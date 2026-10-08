-- =====================================================================
-- Publike · estrutura do banco (Supabase / Postgres com PostGIS)
--
-- Como usar: no painel do Supabase, abra "SQL Editor", cole este arquivo
-- inteiro e clique em "Run". Ou, com a CLI do Supabase: supabase db push
--
-- O que tem aqui:
--   1. Extensões: PostGIS (distância) e unaccent (busca sem acento)
--   2. Tabelas: perfis, contatos, anúncios, curtidas, denúncias,
--      notificações e moderadores
--   3. Gatilhos: local aproximado, limites contra abuso, notificações
--   4. Funções chamadas pelo site (busca por distância, matches etc.)
--   5. Regras de segurança (RLS) e permissões por coluna
--   6. Fotos de perfil (Storage), tempo real e limpeza diária (pg_cron)
--
-- Ideias que guiam as regras:
--   * O endereço exato nunca é salvo: o ponto do mapa vira uma área de
--     ~500 m antes de entrar no banco.
--   * O WhatsApp de cada pessoa só aparece para quem deu match com ela.
--   * Anúncio fica no ar por 30 dias; depois expira (pode renovar).
--   * Três denúncias de pessoas diferentes tiram o anúncio do ar até a
--     moderação olhar.
-- =====================================================================


-- 1. Extensões ---------------------------------------------------------

create extension if not exists postgis with schema extensions;
create extension if not exists unaccent with schema extensions;


-- 2. Funções de apoio ----------------------------------------------------

-- unaccent não é "immutable"; este invólucro permite usá-lo em índices.
create or replace function public.sem_acento(texto text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, texto)
$$;

-- Detecta telefone, e-mail ou link de WhatsApp num texto. O contato só
-- aparece depois do match, então ele não pode vir escrito no anúncio.
create or replace function public.tem_contato(texto text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  with t as (
    -- faixas de ano ("2026-2027") não são telefone
    select regexp_replace(coalesce(texto, ''), '(19|20)[0-9]{2} ?[-/] ?(19|20)[0-9]{2}', '', 'g') as v
  )
  select v ~ '(\(?[0-9]{2}\)?[ .-]?)?9?[0-9]{4}[ .-]?[0-9]{4}'
      or v ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
      or v ~* '(wa\.me|whatsapp\.com|api\.whatsapp)'
    from t
$$;


-- 3. Tabelas -------------------------------------------------------------

-- Perfil público de cada pessoa, comércio ou empresa.
create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 80),
  tipo text not null default 'pessoa' check (tipo in ('pessoa', 'comercio', 'empresa')),
  -- caminho da foto no Storage (avatars/<id>/<data>.jpg); a URL é montada pelo site
  foto text check (foto ~ '^[0-9a-f-]{36}/[0-9]{10,16}\.jpg$'),
  cidade text not null default 'Goiânia' check (char_length(cidade) between 2 and 60),
  bairro text check (char_length(bairro) between 2 and 80),
  sobre text check (char_length(sobre) <= 600),
  servicos text[] not null default '{}' check (cardinality(servicos) <= 12),
  verificado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.perfis is 'Perfil público. O contato fica em contatos e só aparece depois do match.';

-- Quem pode moderar denúncias. Adicione pelo SQL Editor (veja o README).
create table public.moderadores (
  perfil_id uuid primary key references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now()
);

-- Contato privado: só o dono vê. Quem deu match recebe pelas funções
-- meus_matches(), interessados() e minhas_curtidas().
create table public.contatos (
  perfil_id uuid primary key references public.perfis (id) on delete cascade,
  whatsapp text check (whatsapp ~ '^55[1-9][0-9][0-9]{8,9}$'),
  email text check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  atualizado_em timestamptz not null default now()
);

-- Vagas (alguém quer contratar) e serviços (alguém precisa de um serviço).
create table public.anuncios (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  tipo text not null check (tipo in ('vaga', 'servico')),
  titulo text not null check (char_length(titulo) between 5 and 90),
  descricao text not null check (char_length(descricao) between 20 and 3000),
  categoria text not null check (categoria ~ '^[a-z][a-z-]{1,39}$'),
  regime text check (regime in ('clt', 'temporario', 'diaria', 'freelance', 'estagio', 'pj', 'outro')),
  pagamento_valor numeric(10, 2) check (pagamento_valor between 0 and 1000000),
  pagamento_unidade text check (pagamento_unidade in ('hora', 'dia', 'semana', 'mes', 'servico')),
  beneficios text check (char_length(beneficios) <= 120),
  horario text check (char_length(horario) <= 120),
  vagas smallint not null default 1 check (vagas between 1 and 999),
  cidade text not null check (char_length(cidade) between 2 and 60),
  bairro text not null check (char_length(bairro) between 2 and 80),
  local extensions.geography(point, 4326) not null,
  status text not null default 'ativo'
    check (status in ('ativo', 'pausado', 'encerrado', 'expirado', 'em_analise', 'removido')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '30 days',
  busca tsvector generated always as (
    to_tsvector('portuguese'::regconfig, public.sem_acento(titulo || ' ' || descricao || ' ' || bairro))
  ) stored,
  constraint regime_so_em_vaga check ((tipo = 'vaga') = (regime is not null)),
  constraint pagamento_completo check ((pagamento_valor is null) = (pagamento_unidade is null))
);
comment on column public.anuncios.local is 'Ponto aproximado (grade de ~500 m). O endereço exato nunca é salvo.';

create index anuncios_local_idx on public.anuncios using gist (local);
create index anuncios_busca_idx on public.anuncios using gin (busca);
create index anuncios_status_idx on public.anuncios (status, expira_em desc);
create index anuncios_autor_idx on public.anuncios (autor_id, criado_em desc);

-- Curtir = "tenho interesse". Quando quem publicou curte de volta, dá match.
create table public.curtidas (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  mensagem text check (char_length(mensagem) <= 280),
  status text not null default 'pendente' check (status in ('pendente', 'match', 'dispensada')),
  criado_em timestamptz not null default now(),
  respondida_em timestamptz,
  primary key (anuncio_id, perfil_id)
);
create index curtidas_perfil_idx on public.curtidas (perfil_id, criado_em desc);

create table public.denuncias (
  id bigint generated always as identity primary key,
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  autor_id uuid default auth.uid() references public.perfis (id) on delete set null,
  motivo text not null
    check (motivo in ('cobra_taxa', 'golpe', 'enganoso', 'discriminacao', 'ofensivo', 'spam', 'outro')),
  detalhes text check (char_length(detalhes) <= 1000),
  status text not null default 'aberta' check (status in ('aberta', 'procedente', 'improcedente')),
  criado_em timestamptz not null default now(),
  unique (anuncio_id, autor_id)
);
create index denuncias_abertas_idx on public.denuncias (anuncio_id) where status = 'aberta';

create table public.notificacoes (
  id bigint generated always as identity primary key,
  destinatario_id uuid not null references public.perfis (id) on delete cascade,
  tipo text not null check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado')),
  anuncio_id uuid references public.anuncios (id) on delete cascade,
  ator_id uuid references public.perfis (id) on delete cascade,
  texto text not null,
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);
create index notificacoes_destinatario_idx on public.notificacoes (destinatario_id, criado_em desc);

-- Registro das ações para os limites contra abuso. Apagar e publicar de
-- novo não zera a conta. Fica no esquema "privado", que a API não expõe.
create schema if not exists privado;
grant usage on schema privado to authenticated;

create table privado.limites_uso (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  acao text not null check (acao in ('anuncio', 'curtida', 'denuncia')),
  criado_em timestamptz not null default now()
);
create index limites_uso_idx on privado.limites_uso (perfil_id, acao, criado_em desc);


-- 4. Moderação -----------------------------------------------------------

create or replace function public.eh_moderador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.moderadores m where m.perfil_id = (select auth.uid()))
$$;


-- Confere e registra um uso. Só mexe nos registros de quem está logado.
create or replace function privado.conferir_limite(p_acao text, p_maximo integer, p_mensagem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('publike:' || p_acao || ':' || usuario::text));
  if (select count(*) from privado.limites_uso l
       where l.perfil_id = usuario and l.acao = p_acao and l.criado_em > now() - interval '24 hours') >= p_maximo then
    raise exception '%', p_mensagem using errcode = 'P0001', hint = 'limite_' || p_acao;
  end if;
  insert into privado.limites_uso (perfil_id, acao) values (usuario, p_acao);
end
$$;


-- 5. Gatilhos ------------------------------------------------------------

create or replace function public.perfis_antes_de_salvar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome := btrim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  new.bairro := nullif(btrim(regexp_replace(coalesce(new.bairro, ''), '\s+', ' ', 'g')), '');
  new.sobre := nullif(btrim(coalesce(new.sobre, '')), '');
  new.servicos := coalesce(
    (select array_agg(distinct s order by s)
       from (select btrim(x) as s from unnest(new.servicos) as x) t
      where char_length(s) between 2 and 40),
    '{}'
  );
  new.atualizado_em := now();
  if new.foto is not null and split_part(new.foto, '/', 1) <> new.id::text then
    raise exception 'Envie a foto de novo.' using errcode = 'P0001', hint = 'foto_invalida';
  end if;
  if public.tem_contato(new.nome) or public.tem_contato(new.sobre) or public.tem_contato(new.bairro)
     or public.tem_contato(array_to_string(new.servicos, ' ')) then
    raise exception 'Tire o telefone, e-mail ou link do perfil. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;
  if tg_op = 'UPDATE' then
    new.criado_em := old.criado_em;
    if not public.eh_moderador() then
      new.verificado := old.verificado;
    end if;
  end if;
  return new;
end
$$;

create trigger perfis_antes_de_salvar
  before insert or update on public.perfis
  for each row execute function public.perfis_antes_de_salvar();

create or replace function public.contatos_antes_de_salvar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  digitos text := regexp_replace(coalesce(new.whatsapp, ''), '[^0-9]', '', 'g');
begin
  if digitos = '' then
    new.whatsapp := null;
  elsif char_length(digitos) in (10, 11) then
    new.whatsapp := '55' || digitos;   -- veio sem o +55
  else
    new.whatsapp := digitos;
  end if;
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.atualizado_em := now();
  return new;
end
$$;

create trigger contatos_antes_de_salvar
  before insert or update on public.contatos
  for each row execute function public.contatos_antes_de_salvar();

-- No máximo 20 anúncios no ar (ou pausados) por pessoa.
create or replace function privado.conferir_ativos(p_ignorar uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('publike:ativos:' || usuario::text));
  if (select count(*) from public.anuncios a
       where a.autor_id = usuario and a.id <> p_ignorar
         and a.status in ('ativo', 'pausado', 'em_analise')) >= 20 then
    raise exception 'Você já tem 20 anúncios no ar. Encerre algum para publicar ou reativar outro.'
      using errcode = 'P0001', hint = 'limite_ativos';
  end if;
end
$$;

create or replace function public.anuncios_antes_de_salvar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  moderador boolean := public.eh_moderador();
  -- ligado só dentro de funções do próprio banco (denúncias automáticas)
  sistema boolean := coalesce(current_setting('publike.sistema', true), '') = 'on';
  lat double precision;
  lng double precision;
begin
  new.titulo := btrim(regexp_replace(new.titulo, '\s+', ' ', 'g'));
  new.bairro := btrim(regexp_replace(new.bairro, '\s+', ' ', 'g'));
  new.descricao := btrim(new.descricao);
  new.beneficios := nullif(btrim(coalesce(new.beneficios, '')), '');
  new.horario := nullif(btrim(coalesce(new.horario, '')), '');

  if public.tem_contato(new.titulo) or public.tem_contato(new.descricao)
     or public.tem_contato(new.beneficios) or public.tem_contato(new.horario)
     or public.tem_contato(new.bairro) or public.tem_contato(new.cidade) then
    raise exception 'Tire o telefone, e-mail ou link do texto. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;

  -- Guarda só a região (grade de ~500 m). O endereço exato nunca é salvo.
  new.local := extensions.st_snaptogrid(new.local::extensions.geometry, 0.005)::extensions.geography;
  lat := extensions.st_y(new.local::extensions.geometry);
  lng := extensions.st_x(new.local::extensions.geometry);
  if lat not between -17.5 and -15.9 or lng not between -50.3 and -48.4 then
    raise exception 'Por enquanto o Publike funciona em Goiânia e região. Marque um ponto dentro da região metropolitana.'
      using errcode = 'P0001', hint = 'fora_da_regiao';
  end if;

  if tg_op = 'INSERT' then
    new.status := 'ativo';
    new.criado_em := now();
    new.atualizado_em := now();
    new.expira_em := now() + interval '30 days';
    if usuario is not null then
      if not exists (
        select 1 from public.contatos c
         where c.perfil_id = usuario and (c.whatsapp is not null or c.email is not null)
      ) then
        raise exception 'Complete seu perfil com um WhatsApp antes de publicar.'
          using errcode = 'P0001', hint = 'perfil_incompleto';
      end if;
      perform privado.conferir_ativos(new.id);
      perform privado.conferir_limite('anuncio', 10, 'Você chegou ao limite de 10 publicações por dia. Tente de novo amanhã.');
    end if;
  else
    new.id := old.id;
    new.autor_id := old.autor_id;
    new.tipo := old.tipo;
    new.criado_em := old.criado_em;
    new.atualizado_em := now();
    if usuario is not null and not moderador and not sistema then
      if old.status in ('em_analise', 'removido') then
        raise exception 'Este anúncio está com a moderação e não pode ser alterado agora.'
          using errcode = 'P0001', hint = 'com_moderacao';
      end if;
      if new.status is distinct from old.status and new.status not in ('ativo', 'pausado', 'encerrado') then
        raise exception 'Mudança de status não permitida.' using errcode = '42501';
      end if;
    end if;
    -- voltar ao ar (de encerrado ou expirado) conta no limite de 20 no ar
    if usuario is not null and not moderador and not sistema
       and new.status in ('ativo', 'pausado') and old.status not in ('ativo', 'pausado', 'em_analise') then
      perform privado.conferir_ativos(new.id);
    end if;
    -- voltar ao ar renova o prazo de 30 dias
    if new.status = 'ativo' and old.status is distinct from 'ativo' then
      new.expira_em := now() + interval '30 days';
    end if;
  end if;
  return new;
end
$$;

create trigger anuncios_antes_de_salvar
  before insert or update on public.anuncios
  for each row execute function public.anuncios_antes_de_salvar();

create or replace function public.curtidas_antes_de_inserir()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  new.status := 'pendente';
  new.criado_em := now();
  new.respondida_em := null;
  new.mensagem := nullif(btrim(coalesce(new.mensagem, '')), '');
  if public.tem_contato(new.mensagem) then
    raise exception 'Tire o telefone ou e-mail da mensagem. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;
  if usuario is not null then
    if not exists (
      select 1 from public.contatos c
       where c.perfil_id = usuario and (c.whatsapp is not null or c.email is not null)
    ) then
      raise exception 'Complete seu perfil com um WhatsApp antes de curtir.'
        using errcode = 'P0001', hint = 'perfil_incompleto';
    end if;
    perform privado.conferir_limite('curtida', 60, 'Você curtiu bastante coisa hoje. Tente de novo amanhã.');
  end if;
  return new;
end
$$;

create trigger curtidas_antes_de_inserir
  before insert on public.curtidas
  for each row execute function public.curtidas_antes_de_inserir();

create or replace function public.notificar_curtida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dono uuid;
  titulo text;
  quem text;
begin
  select a.autor_id, a.titulo into dono, titulo from public.anuncios a where a.id = new.anuncio_id;
  select p.nome into quem from public.perfis p where p.id = new.perfil_id;
  -- curtir, descurtir e curtir de novo não enche o sino de avisos
  if not exists (
    select 1 from public.notificacoes n
     where n.destinatario_id = dono and n.anuncio_id = new.anuncio_id and n.ator_id = new.perfil_id
       and n.tipo = 'curtida' and n.criado_em > now() - interval '24 hours'
  ) then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (dono, 'curtida', new.anuncio_id, new.perfil_id, coalesce(quem, 'Alguém') || ' curtiu “' || titulo || '”.');
  end if;
  return null;
end
$$;

create trigger curtidas_notificar
  after insert on public.curtidas
  for each row execute function public.notificar_curtida();

create or replace function public.notificar_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  titulo text;
  quem text;
  dono uuid;
begin
  if new.status = 'match' and old.status is distinct from 'match' then
    select a.titulo, p.nome, p.id into titulo, quem, dono
      from public.anuncios a join public.perfis p on p.id = a.autor_id
     where a.id = new.anuncio_id;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (new.perfil_id, 'match', new.anuncio_id, dono,
            'Deu match! ' || coalesce(quem, 'Quem publicou') || ' curtiu você de volta em “' || titulo
            || '”. Agora é só conversar.');
  end if;
  return null;
end
$$;

create trigger curtidas_notificar_match
  after update of status on public.curtidas
  for each row execute function public.notificar_match();

create or replace function public.notificar_moderacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'em_analise' then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
      values (new.autor_id, 'em_analise', new.id,
              'Seu anúncio “' || new.titulo || '” recebeu denúncias e saiu do ar até a moderação analisar.');
    elsif new.status = 'removido' then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
      values (new.autor_id, 'removido', new.id,
              'Seu anúncio “' || new.titulo || '” foi removido por não seguir as regras do Publike.');
    elsif new.status = 'ativo' and old.status in ('em_analise', 'removido') then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
      values (new.autor_id, 'liberado', new.id,
              'Seu anúncio “' || new.titulo || '” foi liberado pela moderação e voltou ao ar.');
    end if;
  end if;
  return null;
end
$$;

create trigger anuncios_notificar_moderacao
  after update of status on public.anuncios
  for each row execute function public.notificar_moderacao();

create or replace function public.denuncias_antes_de_inserir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  new.status := 'aberta';
  new.criado_em := now();
  new.detalhes := nullif(btrim(coalesce(new.detalhes, '')), '');
  if usuario is not null then
    perform privado.conferir_limite('denuncia', 10, 'Você já enviou muitas denúncias hoje. A moderação vai analisar as que chegaram.');
  end if;
  return new;
end
$$;

create trigger denuncias_antes_de_inserir
  before insert on public.denuncias
  for each row execute function public.denuncias_antes_de_inserir();

-- Três pessoas diferentes denunciaram: o anúncio sai do ar até a moderação olhar.
create or replace function public.denuncias_depois_de_inserir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(distinct d.autor_id) from public.denuncias d
       where d.anuncio_id = new.anuncio_id and d.status = 'aberta') >= 3 then
    perform set_config('publike.sistema', 'on', true);
    update public.anuncios set status = 'em_analise' where id = new.anuncio_id and status = 'ativo';
    perform set_config('publike.sistema', 'off', true);
  end if;
  return null;
end
$$;

create trigger denuncias_depois_de_inserir
  after insert on public.denuncias
  for each row execute function public.denuncias_depois_de_inserir();


-- 6. Funções chamadas pelo site -----------------------------------------

-- Busca por distância, com filtros. Respeita as regras de RLS de quem chama.
create or replace function public.buscar_anuncios(
  p_lat double precision default -16.6806,
  p_lng double precision default -49.2563,
  p_raio_km double precision default 25,
  p_tipo text default null,
  p_categoria text default null,
  p_regime text default null,
  p_texto text default null,
  p_ordem text default 'perto',
  p_limite integer default 60
)
returns table (
  id uuid,
  tipo text,
  titulo text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  cidade text,
  bairro text,
  lat double precision,
  lng double precision,
  distancia_km double precision,
  criado_em timestamptz,
  autor_id uuid,
  autor_nome text,
  autor_tipo text,
  autor_verificado boolean,
  minha_curtida text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with ref as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as ponto
  ),
  termo as (
    select nullif(btrim(coalesce(p_texto, '')), '') as texto
  ),
  consulta as (
    select t.texto,
           case when t.texto is null then null
                else websearch_to_tsquery('portuguese'::regconfig, public.sem_acento(t.texto)) end as tsq
      from termo t
  )
  select a.id, a.tipo, a.titulo, a.categoria, a.regime,
         a.pagamento_valor, a.pagamento_unidade, a.beneficios,
         a.cidade, a.bairro,
         round(st_y(a.local::geometry)::numeric, 5)::double precision,
         round(st_x(a.local::geometry)::numeric, 5)::double precision,
         round((st_distance(a.local, ref.ponto) / 1000)::numeric, 1)::double precision,
         a.criado_em, p.id, p.nome, p.tipo, p.verificado,
         c.status
    from public.anuncios a
    cross join ref
    cross join consulta q
    join public.perfis p on p.id = a.autor_id
    left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
   where a.status = 'ativo'
     and a.expira_em > now()
     and st_dwithin(a.local, ref.ponto, least(greatest(p_raio_km, 1), 100) * 1000)
     and (p_tipo is null or a.tipo = p_tipo)
     and (p_categoria is null or a.categoria = p_categoria)
     and (p_regime is null or a.regime = p_regime)
     and (q.texto is null
          or a.busca @@ q.tsq
          or public.sem_acento(a.titulo) ilike '%' || public.sem_acento(q.texto) || '%')
   order by
     case when p_ordem = 'recentes' then a.criado_em end desc nulls last,
     st_distance(a.local, ref.ponto),
     a.criado_em desc
   limit least(greatest(p_limite, 1), 200)
$$;

-- Um anúncio com os dados de quem publicou. Só devolve o que a pessoa pode ver.
create or replace function public.obter_anuncio(p_id uuid)
returns table (
  id uuid,
  autor_id uuid,
  tipo text,
  titulo text,
  descricao text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  horario text,
  vagas smallint,
  cidade text,
  bairro text,
  lat double precision,
  lng double precision,
  status text,
  criado_em timestamptz,
  atualizado_em timestamptz,
  expira_em timestamptz,
  autor_nome text,
  autor_tipo text,
  autor_foto text,
  autor_verificado boolean,
  autor_desde timestamptz,
  minha_curtida text,
  minha_mensagem text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select a.id, a.autor_id, a.tipo, a.titulo, a.descricao, a.categoria, a.regime,
         a.pagamento_valor, a.pagamento_unidade, a.beneficios, a.horario, a.vagas,
         a.cidade, a.bairro,
         round(st_y(a.local::geometry)::numeric, 5)::double precision,
         round(st_x(a.local::geometry)::numeric, 5)::double precision,
         a.status, a.criado_em, a.atualizado_em, a.expira_em,
         p.nome, p.tipo, p.foto, p.verificado, p.criado_em,
         c.status, c.mensagem
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
   where a.id = p_id
$$;

-- Anúncios de quem está logado, com a contagem de curtidas.
create or replace function public.meus_anuncios()
returns table (
  id uuid,
  tipo text,
  titulo text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  cidade text,
  bairro text,
  status text,
  criado_em timestamptz,
  expira_em timestamptz,
  curtidas_total integer,
  curtidas_novas integer,
  matches integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.tipo, a.titulo, a.categoria, a.regime,
         a.pagamento_valor, a.pagamento_unidade, a.beneficios,
         a.cidade, a.bairro, a.status, a.criado_em, a.expira_em,
         count(c.perfil_id)::integer,
         (count(c.perfil_id) filter (where c.status = 'pendente'))::integer,
         (count(c.perfil_id) filter (where c.status = 'match'))::integer
    from public.anuncios a
    left join public.curtidas c on c.anuncio_id = a.id
   where a.autor_id = (select auth.uid())
   group by a.id
   order by (a.status in ('ativo', 'pausado', 'em_analise')) desc, a.criado_em desc
$$;

-- Quem curtiu um anúncio meu. O contato só vem para quem deu match.
create or replace function public.interessados(p_anuncio uuid)
returns table (
  perfil_id uuid,
  nome text,
  tipo text,
  foto text,
  cidade text,
  bairro text,
  sobre text,
  servicos text[],
  verificado boolean,
  membro_desde timestamptz,
  mensagem text,
  status text,
  curtido_em timestamptz,
  whatsapp text,
  email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nome, p.tipo, p.foto, p.cidade, p.bairro, p.sobre, p.servicos,
         p.verificado, p.criado_em, c.mensagem, c.status, c.criado_em,
         case when c.status = 'match' and a.status not in ('em_analise', 'removido') then ct.whatsapp end,
         case when c.status = 'match' and a.status not in ('em_analise', 'removido') then ct.email end
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
    join public.perfis p on p.id = c.perfil_id
    left join public.contatos ct on ct.perfil_id = p.id
   where c.anuncio_id = p_anuncio
     and a.autor_id = (select auth.uid())
   order by (c.status = 'match') desc, (c.status = 'pendente') desc, c.criado_em desc
$$;

-- O que eu curti, mesmo que o anúncio já tenha saído do ar.
create or replace function public.minhas_curtidas()
returns table (
  anuncio_id uuid,
  titulo text,
  tipo text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  cidade text,
  bairro text,
  anuncio_status text,
  expira_em timestamptz,
  autor_id uuid,
  autor_nome text,
  autor_tipo text,
  autor_foto text,
  status text,
  mensagem text,
  curtido_em timestamptz,
  respondida_em timestamptz,
  autor_whatsapp text,
  autor_email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.titulo, a.tipo, a.categoria, a.regime,
         a.pagamento_valor, a.pagamento_unidade, a.beneficios,
         a.cidade, a.bairro,
         case when a.status = 'ativo' and a.expira_em <= now() then 'expirado' else a.status end,
         a.expira_em, p.id, p.nome, p.tipo, p.foto,
         c.status, c.mensagem, c.criado_em, c.respondida_em,
         case when c.status = 'match' and a.status <> 'em_analise' then ct.whatsapp end,
         case when c.status = 'match' and a.status <> 'em_analise' then ct.email end
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
    join public.perfis p on p.id = a.autor_id
    left join public.contatos ct on ct.perfil_id = p.id
   where c.perfil_id = (select auth.uid())
     and a.status <> 'removido'
   order by c.criado_em desc
$$;

-- Todos os matches, dos dois lados, com o contato da outra pessoa.
create or replace function public.meus_matches()
returns table (
  anuncio_id uuid,
  anuncio_titulo text,
  anuncio_tipo text,
  papel text,
  outro_id uuid,
  outro_nome text,
  outro_tipo text,
  outro_foto text,
  outro_cidade text,
  outro_bairro text,
  outro_whatsapp text,
  outro_email text,
  match_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select a.id, a.titulo, a.tipo, 'publiquei'::text,
           p.id, p.nome, p.tipo, p.foto, p.cidade, p.bairro, ct.whatsapp, ct.email,
           coalesce(c.respondida_em, c.criado_em) as quando
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
      join public.perfis p on p.id = c.perfil_id
      left join public.contatos ct on ct.perfil_id = p.id
     where c.status = 'match' and a.autor_id = (select auth.uid())
       and a.status not in ('em_analise', 'removido')
    union all
    select a.id, a.titulo, a.tipo, 'curti'::text,
           p.id, p.nome, p.tipo, p.foto, p.cidade, p.bairro, ct.whatsapp, ct.email,
           coalesce(c.respondida_em, c.criado_em) as quando
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
      join public.perfis p on p.id = a.autor_id
      left join public.contatos ct on ct.perfil_id = p.id
     where c.status = 'match' and c.perfil_id = (select auth.uid())
       and a.status not in ('em_analise', 'removido')
  ) m
  order by m.quando desc
$$;

-- Quem publicou responde a uma curtida: 'match', 'dispensada' ou 'pendente' (desfazer).
create or replace function public.responder_curtida(p_anuncio uuid, p_perfil uuid, p_decisao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  atual text;
  situacao text;
begin
  if p_decisao not in ('match', 'dispensada', 'pendente') then
    raise exception 'Resposta inválida.' using errcode = '22023';
  end if;
  select c.status, a.status into atual, situacao
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio
     and c.perfil_id = p_perfil
     and a.autor_id = (select auth.uid())
     for update of c;
  if not found then
    raise exception 'Curtida não encontrada.' using errcode = 'P0002';
  end if;
  if situacao in ('em_analise', 'removido') then
    raise exception 'Este anúncio está com a moderação. Responda depois que ele for liberado.'
      using errcode = 'P0001', hint = 'com_moderacao';
  end if;
  if atual = 'match' then
    raise exception 'Este match já aconteceu e não pode ser desfeito.' using errcode = 'P0001', hint = 'match_feito';
  end if;
  update public.curtidas
     set status = p_decisao,
         respondida_em = case when p_decisao = 'pendente' then null else now() end
   where anuncio_id = p_anuncio and perfil_id = p_perfil;
end
$$;

-- Põe o anúncio de volta no ar por mais 30 dias.
create or replace function public.renovar_anuncio(p_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  nova_data timestamptz;
begin
  update public.anuncios
     set status = 'ativo', expira_em = now() + interval '30 days'
   where id = p_id
     and autor_id = (select auth.uid())
     and status in ('ativo', 'pausado', 'encerrado', 'expirado')
  returning expira_em into nova_data;
  if nova_data is null then
    raise exception 'Não foi possível renovar este anúncio.' using errcode = 'P0001';
  end if;
  return nova_data;
end
$$;

-- Salva perfil e contato juntos.
create or replace function public.salvar_perfil(
  p_nome text,
  p_tipo text,
  p_cidade text,
  p_bairro text,
  p_sobre text,
  p_servicos text[],
  p_foto text,
  p_whatsapp text,
  p_email text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null then
    raise exception 'Entre na sua conta para salvar o perfil.' using errcode = '42501';
  end if;
  insert into public.perfis as p (id, nome, tipo, cidade, bairro, sobre, servicos, foto)
  values (usuario, p_nome, p_tipo, p_cidade, p_bairro, p_sobre, coalesce(p_servicos, '{}'), p_foto)
  on conflict (id) do update
     set nome = excluded.nome, tipo = excluded.tipo, cidade = excluded.cidade,
         bairro = excluded.bairro, sobre = excluded.sobre, servicos = excluded.servicos,
         foto = excluded.foto;
  insert into public.contatos as c (perfil_id, whatsapp, email)
  values (usuario, p_whatsapp, p_email)
  on conflict (perfil_id) do update
     set whatsapp = excluded.whatsapp, email = excluded.email;
end
$$;

-- Apaga a conta e tudo que é dela (perfil, anúncios, curtidas...). LGPD.
-- As fotos do Storage são apagadas antes, pelo site.
create or replace function public.excluir_minha_conta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null then
    raise exception 'Entre na sua conta para excluí-la.' using errcode = '42501';
  end if;
  delete from auth.users where id = usuario;
end
$$;

-- Fila da moderação: anúncios com denúncias abertas.
create or replace function public.fila_moderacao()
returns table (
  anuncio_id uuid,
  titulo text,
  tipo text,
  status text,
  cidade text,
  bairro text,
  criado_em timestamptz,
  autor_id uuid,
  autor_nome text,
  denuncias_abertas integer,
  motivos text[],
  detalhes text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.eh_moderador() then
    raise exception 'Só a moderação pode ver esta lista.' using errcode = '42501';
  end if;
  return query
    select a.id, a.titulo, a.tipo, a.status, a.cidade, a.bairro, a.criado_em,
           p.id, p.nome,
           count(d.id)::integer,
           coalesce(array_agg(distinct d.motivo) filter (where d.motivo is not null), '{}'),
           coalesce((array_agg(d.detalhes order by d.criado_em desc)
                      filter (where d.detalhes is not null))[1:5], '{}')
      from public.anuncios a
      join public.perfis p on p.id = a.autor_id
      left join public.denuncias d on d.anuncio_id = a.id and d.status = 'aberta'
     where a.status = 'em_analise' or d.id is not null
     group by a.id, p.id
     order by (a.status = 'em_analise') desc, count(d.id) desc, max(d.criado_em) desc nulls last;
end
$$;

-- Decisão da moderação: 'remover' ou 'liberar'.
create or replace function public.moderar_anuncio(p_anuncio uuid, p_decisao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_moderador() then
    raise exception 'Só a moderação pode fazer isso.' using errcode = '42501';
  end if;
  if p_decisao = 'remover' then
    update public.anuncios set status = 'removido' where id = p_anuncio;
    update public.denuncias set status = 'procedente' where anuncio_id = p_anuncio and status = 'aberta';
  elsif p_decisao = 'liberar' then
    update public.anuncios set status = 'ativo'
     where id = p_anuncio and status in ('em_analise', 'removido');
    update public.denuncias set status = 'improcedente' where anuncio_id = p_anuncio and status = 'aberta';
  else
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
end
$$;

-- Limpeza diária (pg_cron): expira anúncios vencidos e apaga avisos antigos.
create or replace function public.expirar_anuncios()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer;
begin
  perform set_config('publike.sistema', 'on', true);
  update public.anuncios set status = 'expirado' where status = 'ativo' and expira_em <= now();
  get diagnostics total = row_count;
  delete from public.notificacoes where criado_em < now() - interval '90 days';
  delete from privado.limites_uso where criado_em < now() - interval '2 days';
  return total;
end
$$;


-- 7. Regras de segurança (RLS) ---------------------------------------------

alter table public.perfis enable row level security;
alter table public.moderadores enable row level security;
alter table public.contatos enable row level security;
alter table public.anuncios enable row level security;
alter table public.curtidas enable row level security;
alter table public.denuncias enable row level security;
alter table public.notificacoes enable row level security;

-- perfis
create policy "perfis são públicos" on public.perfis
  for select to anon, authenticated using (true);
create policy "cada um cria o próprio perfil" on public.perfis
  for insert to authenticated with check (id = (select auth.uid()));
create policy "cada um edita o próprio perfil" on public.perfis
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- moderadores: sem regras = ninguém lê ou escreve pela API.

-- contatos
create policy "cada um vê o próprio contato" on public.contatos
  for select to authenticated using (perfil_id = (select auth.uid()));
create policy "cada um cria o próprio contato" on public.contatos
  for insert to authenticated with check (perfil_id = (select auth.uid()));
create policy "cada um edita o próprio contato" on public.contatos
  for update to authenticated
  using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()));

-- anúncios
create policy "anúncios no ar são públicos" on public.anuncios
  for select to anon, authenticated using (status = 'ativo' and expira_em > now());
create policy "autor vê os próprios anúncios" on public.anuncios
  for select to authenticated using (autor_id = (select auth.uid()));
create policy "moderação vê todos os anúncios" on public.anuncios
  for select to authenticated using ((select public.eh_moderador()));
create policy "quem tem perfil publica" on public.anuncios
  for insert to authenticated with check (autor_id = (select auth.uid()));
create policy "autor edita o próprio anúncio" on public.anuncios
  for update to authenticated
  using (autor_id = (select auth.uid())) with check (autor_id = (select auth.uid()));
create policy "autor exclui o próprio anúncio" on public.anuncios
  for delete to authenticated
  using (autor_id = (select auth.uid()) and status not in ('em_analise', 'removido'));

-- curtidas
create policy "quem curtiu e quem publicou veem a curtida" on public.curtidas
  for select to authenticated
  using (
    perfil_id = (select auth.uid())
    or exists (select 1 from public.anuncios a
                where a.id = anuncio_id and a.autor_id = (select auth.uid()))
  );
create policy "curtir anúncio no ar de outra pessoa" on public.curtidas
  for insert to authenticated
  with check (
    perfil_id = (select auth.uid())
    and exists (select 1 from public.anuncios a
                 where a.id = anuncio_id and a.status = 'ativo' and a.expira_em > now()
                   and a.autor_id <> (select auth.uid()))
  );
create policy "desfazer curtida ainda sem resposta" on public.curtidas
  for delete to authenticated using (perfil_id = (select auth.uid()) and status = 'pendente');

-- denúncias
create policy "denunciar anúncio de outra pessoa" on public.denuncias
  for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and exists (select 1 from public.anuncios a
                 where a.id = anuncio_id and a.autor_id <> (select auth.uid()))
  );
create policy "moderação vê as denúncias" on public.denuncias
  for select to authenticated using ((select public.eh_moderador()));

-- notificações
create policy "cada um vê as próprias notificações" on public.notificacoes
  for select to authenticated using (destinatario_id = (select auth.uid()));
create policy "cada um marca as próprias como lidas" on public.notificacoes
  for update to authenticated
  using (destinatario_id = (select auth.uid())) with check (destinatario_id = (select auth.uid()));
create policy "cada um apaga as próprias notificações" on public.notificacoes
  for delete to authenticated using (destinatario_id = (select auth.uid()));


-- 8. Permissões por coluna -------------------------------------------------
-- O Supabase libera tudo por padrão; aqui cada papel fica só com o necessário.

revoke all on public.perfis, public.moderadores, public.contatos, public.anuncios,
  public.curtidas, public.denuncias, public.notificacoes from anon, authenticated;

grant select on public.perfis to anon, authenticated;
grant insert (id, nome, tipo, foto, cidade, bairro, sobre, servicos) on public.perfis to authenticated;
grant update (nome, tipo, foto, cidade, bairro, sobre, servicos) on public.perfis to authenticated;

grant select on public.contatos to authenticated;
grant insert (perfil_id, whatsapp, email) on public.contatos to authenticated;
grant update (whatsapp, email) on public.contatos to authenticated;

grant select on public.anuncios to anon, authenticated;
grant insert (tipo, titulo, descricao, categoria, regime, pagamento_valor, pagamento_unidade,
              beneficios, horario, vagas, cidade, bairro, local) on public.anuncios to authenticated;
grant update (titulo, descricao, categoria, regime, pagamento_valor, pagamento_unidade,
              beneficios, horario, vagas, cidade, bairro, local, status) on public.anuncios to authenticated;
grant delete on public.anuncios to authenticated;

grant select, delete on public.curtidas to authenticated;
grant insert (anuncio_id, mensagem) on public.curtidas to authenticated;
-- A busca pública consulta curtidas; sem regra para anon, ela sempre volta vazia.
grant select on public.curtidas to anon;

grant select on public.denuncias to authenticated;
grant insert (anuncio_id, motivo, detalhes) on public.denuncias to authenticated;

grant select, delete on public.notificacoes to authenticated;
grant update (lida) on public.notificacoes to authenticated;

-- Funções: as abertas ao público e as que exigem login.
revoke execute on function
  public.meus_anuncios(),
  public.interessados(uuid),
  public.minhas_curtidas(),
  public.meus_matches(),
  public.responder_curtida(uuid, uuid, text),
  public.renovar_anuncio(uuid),
  public.salvar_perfil(text, text, text, text, text, text[], text, text, text),
  public.excluir_minha_conta(),
  public.fila_moderacao(),
  public.moderar_anuncio(uuid, text),
  public.expirar_anuncios()
from public, anon;

grant execute on function
  public.meus_anuncios(),
  public.interessados(uuid),
  public.minhas_curtidas(),
  public.meus_matches(),
  public.responder_curtida(uuid, uuid, text),
  public.renovar_anuncio(uuid),
  public.salvar_perfil(text, text, text, text, text, text[], text, text, text),
  public.excluir_minha_conta(),
  public.fila_moderacao(),
  public.moderar_anuncio(uuid, text)
to authenticated;

revoke execute on function public.expirar_anuncios() from authenticated;

grant execute on function
  public.buscar_anuncios(double precision, double precision, double precision, text, text, text, text, text, integer),
  public.obter_anuncio(uuid),
  public.eh_moderador()
to anon, authenticated;

-- Limites: só os gatilhos usam (o esquema "privado" não aparece na API).
alter table privado.limites_uso enable row level security;
revoke all on privado.limites_uso from public;
revoke execute on function privado.conferir_limite(text, integer, text), privado.conferir_ativos(uuid) from public;
grant execute on function privado.conferir_limite(text, integer, text), privado.conferir_ativos(uuid) to authenticated;


-- 9. Fotos de perfil (Storage) ---------------------------------------------
-- Pasta por pessoa: avatars/<id-do-usuário>/foto.webp

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "publike: dono vê as próprias fotos" on storage.objects;
drop policy if exists "publike: dono envia foto" on storage.objects;
drop policy if exists "publike: dono troca foto" on storage.objects;
drop policy if exists "publike: dono apaga foto" on storage.objects;

create policy "publike: dono vê as próprias fotos" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "publike: dono envia foto" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "publike: dono troca foto" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "publike: dono apaga foto" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- 10. Tempo real e limpeza diária ------------------------------------------

-- Avisos de curtida e de match chegam na hora (sino no topo do site).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificacoes'
     ) then
    alter publication supabase_realtime add table public.notificacoes;
  end if;
end
$$;

-- Todo dia às 3h15 (horário de Brasília) expira o que venceu.
-- Se o pg_cron não estiver disponível, os anúncios vencidos já somem das
-- buscas do mesmo jeito; a limpeza só fica para depois.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('publike-expirar-anuncios', '15 6 * * *', 'select public.expirar_anuncios()');
  end if;
exception
  when others then
    raise notice 'pg_cron indisponível (%). Ative em Database > Extensions e rode este bloco de novo.', sqlerrm;
end
$$;
