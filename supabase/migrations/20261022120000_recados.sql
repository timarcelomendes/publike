-- Recados: textos curtos de quem está perto, na linha do tempo da home (etapas 3 e 4 da nova home).
--
-- Um recado tem até 280 letras, uma foto opcional e, se quiser, uma vaga ou um serviço do Publike
-- citado. Passa pela revisão da IA (como as avaliações) quando a moderação automática está ligada.
-- Fica no ar 30 dias na linha do tempo e continua no perfil. Quem lê dá "Força" (a reação do recado;
-- no Publike, "Curtir" é candidatar-se). Sem telefone, e-mail ou link: o contato é pela conversa.
--
-- Leitura e escrita só por funções (security definer, conta_atual()). Pode rodar de novo.


-- 1. Tabelas ----------------------------------------------------------------------------------------

create table if not exists public.recados (
  id uuid primary key default gen_random_uuid(),
  -- a conta (para quem é da equipe de uma agência, a agência)
  autor_id uuid not null references public.perfis (id) on delete cascade,
  -- a pessoa que escreveu (a pasta da foto é dela)
  escrito_por uuid references auth.users (id) on delete set null,
  texto text not null check (char_length(btrim(texto)) between 1 and 280),
  -- recados/<pessoa>/<hora>.jpg
  foto text check (foto is null or foto ~ '^[0-9a-f-]{36}/[0-9]{10,16}\.jpg$'),
  -- a vaga ou o serviço citado (some se o anúncio for apagado)
  anuncio_id uuid references public.anuncios (id) on delete set null,
  -- o meio do bairro de quem escreveu (nunca a casa), para a distância
  local extensions.geography(point, 4326) not null,
  cidade text not null,
  bairro text,
  status text not null default 'revisao' check (status in ('revisao', 'no_ar', 'retido', 'apagado')),
  -- por que ficou retido ou foi removido (vai no aviso de quem escreveu)
  motivo text check (char_length(motivo) <= 500),
  forcas integer not null default 0 check (forcas >= 0),
  criado_em timestamptz not null default now(),
  publicado_em timestamptz,
  apagado_em timestamptz
);
create index if not exists recados_no_ar_local_idx on public.recados using gist (local) where status = 'no_ar';
create index if not exists recados_autor_idx on public.recados (autor_id, criado_em desc);
create index if not exists recados_publicado_idx on public.recados (publicado_em desc) where status = 'no_ar';

create table if not exists public.recado_forcas (
  recado_id uuid not null references public.recados (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (recado_id, perfil_id)
);
create index if not exists recado_forcas_perfil_idx on public.recado_forcas (perfil_id);

-- Denúncias de recado: os mesmos motivos e status das denúncias de anúncio, numa tabela própria
-- (a de anúncios tem anuncio_id obrigatório).
create table if not exists public.denuncias_recados (
  id bigint generated always as identity primary key,
  recado_id uuid not null references public.recados (id) on delete cascade,
  autor_id uuid default auth.uid() references public.perfis (id) on delete set null,
  motivo text not null
    check (motivo in ('cobra_taxa', 'golpe', 'enganoso', 'discriminacao', 'ofensivo', 'spam', 'outro')),
  detalhes text check (char_length(detalhes) <= 1000),
  status text not null default 'aberta' check (status in ('aberta', 'procedente', 'improcedente')),
  criado_em timestamptz not null default now(),
  unique (recado_id, autor_id)
);
create index if not exists denuncias_recados_abertas_idx on public.denuncias_recados (recado_id) where status = 'aberta';

-- O que a IA decidiu (para a equipe ver)
create table if not exists public.moderacao_ia_recados (
  id bigint generated always as identity primary key,
  recado_id uuid not null references public.recados (id) on delete cascade,
  decisao text not null check (decisao in ('aprovado', 'retido', 'erro')),
  categorias text[] not null default '{}',
  explicacao text,
  modelo text,
  criado_em timestamptz not null default now()
);
create index if not exists moderacao_ia_recados_idx on public.moderacao_ia_recados (recado_id, criado_em desc);

-- Fila da IA
create table if not exists privado.fila_ia_recados (
  recado_id uuid primary key references public.recados (id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'revisando')),
  tentativas smallint not null default 0,
  criado_em timestamptz not null default now(),
  tentar_depois timestamptz not null default now()
);

alter table public.recados enable row level security;
alter table public.recado_forcas enable row level security;
alter table public.denuncias_recados enable row level security;
alter table public.moderacao_ia_recados enable row level security;
alter table privado.fila_ia_recados enable row level security;
-- Sem regras: ninguém lê nem escreve direto pela API, só pelas funções abaixo.
revoke all on public.recados, public.recado_forcas, public.denuncias_recados, public.moderacao_ia_recados
  from anon, authenticated;
revoke all on privado.fila_ia_recados from public, anon, authenticated;


-- 2. Avisos, limites e registro da equipe -----------------------------------------------------------

-- o aviso do recado leva para o recado (e some junto se ele for apagado de vez)
alter table public.notificacoes add column if not exists recado_id uuid references public.recados (id) on delete cascade;
create index if not exists notificacoes_recado_idx on public.notificacoes (recado_id) where recado_id is not null;

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'recado_no_ar', 'recado_retido', 'recado_forca'));

-- os avisos de recado ficam só no sino (sem e-mail)
drop trigger if exists notificacoes_por_email on public.notificacoes;
create trigger notificacoes_por_email
  after insert on public.notificacoes
  for each row
  when (new.tipo not in ('recado_no_ar', 'recado_retido', 'recado_forca'))
  execute function privado.notificacao_por_email();

alter table privado.limites_uso drop constraint if exists limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check check (acao = any (array[
  'anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match', 'ia_indicacao',
  'mensagem', 'seguir', 'recomendacao', 'etapa', 'contratacao', 'ia_resumo', 'convite', 'talento',
  'convite_candidato', 'convite_equipe', 'conexao', 'recado']));

alter table public.registro_equipe drop constraint if exists registro_equipe_alvo_tipo_check;
alter table public.registro_equipe add constraint registro_equipe_alvo_tipo_check
  check (alvo_tipo in ('usuario', 'anuncio', 'config', 'modelo', 'equipe', 'chave', 'avaliacao', 'recado'));


-- 3. Apoio ------------------------------------------------------------------------------------------

-- O motivo que quem escreveu lê quando o recado não vai ao ar (as categorias da IA, em português).
create or replace function privado.motivo_do_recado(p_categorias text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when 'ofensa' = any (p_categorias) then 'O recado tem ofensa ou xingamento.'
           when 'ameaca' = any (p_categorias) then 'O recado tem ameaça.'
           when 'discriminacao' = any (p_categorias) then 'O recado exclui ou ofende pessoas por quem elas são.'
           when 'dados_pessoais' = any (p_categorias) then 'O recado expõe dados pessoais de alguém.'
           when 'conteudo_improprio' = any (p_categorias) then 'O recado tem conteúdo impróprio.'
           when 'golpe' = any (p_categorias) then 'O recado parece golpe ou cobra para dar trabalho.'
           when 'spam' = any (p_categorias) then 'O recado parece propaganda ou spam.'
           else 'O recado não segue as regras do Publike.'
         end
$$;

-- Avisa quem escreveu (na conta do recado).
create or replace function privado.avisar_recado(p_recado uuid, p_tipo text, p_texto text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notificacoes (destinatario_id, tipo, recado_id, texto)
  select r.autor_id, p_tipo, r.id, p_texto from public.recados r where r.id = p_recado
$$;

-- Os dados de cada recado para quem está vendo (a lista, o perfil e a página usam a mesma forma).
create or replace function privado.recados_para(p_ids uuid[], p_lat double precision, p_lng double precision)
returns table (
  id uuid,
  autor_id uuid,
  autor_nome text,
  autor_tipo text,
  autor_foto text,
  autor_verificado boolean,
  texto text,
  foto text,
  cidade text,
  bairro text,
  distancia_km double precision,
  status text,
  motivo text,
  forcas integer,
  dei_forca boolean,
  meu boolean,
  quando timestamptz,
  anuncio_id uuid,
  anuncio_tipo text,
  anuncio_titulo text,
  anuncio_autor text,
  anuncio_valor numeric,
  anuncio_unidade text,
  anuncio_regime text,
  anuncio_bairro text,
  anuncio_cidade text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.autor_id, p.nome, p.tipo, p.foto, p.verificado,
         r.texto, r.foto, r.cidade, r.bairro,
         case when p_lat is null or p_lng is null then null
              else round((extensions.st_distance(r.local,
                     extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography) / 1000)::numeric, 1)::double precision
         end,
         r.status,
         case when r.autor_id = (select public.conta_atual()) then r.motivo end,
         r.forcas,
         exists (select 1 from public.recado_forcas f where f.recado_id = r.id and f.perfil_id = (select public.conta_atual())),
         r.autor_id = (select public.conta_atual()),
         coalesce(r.publicado_em, r.criado_em),
         a.id, a.tipo, a.titulo, pa.nome, a.pagamento_valor, a.pagamento_unidade, a.regime, a.bairro, a.cidade
    from public.recados r
    join public.perfis p on p.id = r.autor_id
    -- a vaga citada só aparece enquanto está no ar
    left join public.anuncios a on a.id = r.anuncio_id and a.status = 'ativo' and a.expira_em > now()
    left join public.perfis pa on pa.id = a.autor_id
   where r.id = any (p_ids)
$$;

-- O recado pode aparecer para quem está vendo? (no ar, autor sem suspensão e sem bloqueio entre os dois)
create or replace function privado.recado_visivel(p_status text, p_autor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (p_status = 'no_ar'
          and not exists (select 1 from public.perfis p where p.id = p_autor and p.suspenso_ate > now())
          and ((select public.conta_atual()) is null
               or not privado.ha_bloqueio((select public.conta_atual()), p_autor)))
$$;


-- 4. Quem usa o site --------------------------------------------------------------------------------

-- Escreve um recado. O lugar é o meio do bairro de quem escreve (o site acha e manda).
create or replace function public.escrever_recado(
  p_texto text,
  p_foto text default null,
  p_anuncio uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_cidade text default null,
  p_bairro text default null
)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  conta uuid := (select public.conta_atual());
  pessoa uuid := (select auth.uid());
  v_texto text := btrim(regexp_replace(coalesce(p_texto, ''), '\n{3,}', E'\n\n', 'g'));
  v_cidade text := nullif(btrim(coalesce(p_cidade, '')), '');
  v_ponto extensions.geography;
  v_status text;
  v_id uuid;
  primeiro timestamptz;
  quando text;
begin
  if conta is null or pessoa is null then
    raise exception 'Entre na sua conta para escrever um recado.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if not exists (
    select 1 from public.contatos c
     where c.perfil_id = conta and (c.whatsapp is not null or c.email is not null)
  ) then
    raise exception 'Complete seu perfil antes de escrever um recado.' using errcode = 'P0001', hint = 'perfil_incompleto';
  end if;
  if char_length(v_texto) < 1 then
    raise exception 'Escreva o recado.' using errcode = 'P0001', hint = 'texto';
  end if;
  if char_length(v_texto) > 280 then
    raise exception 'O recado passa de 280 letras.' using errcode = 'P0001', hint = 'texto';
  end if;
  if public.tem_contato(v_texto, true) then
    raise exception 'Tire o telefone, o e-mail ou o link do recado. O contato é pela conversa do Publike.'
      using errcode = 'P0001', hint = 'contato';
  end if;
  if p_foto is not null and p_foto !~ ('^' || pessoa::text || '/[0-9]{10,16}\.jpg$') then
    raise exception 'Envie a foto de novo.' using errcode = 'P0001', hint = 'foto';
  end if;
  if p_anuncio is not null and not exists (
    select 1 from public.anuncios a where a.id = p_anuncio and a.status = 'ativo' and a.expira_em > now()
  ) then
    raise exception 'Essa vaga não está mais no ar. Cite outra ou publique sem citar.'
      using errcode = 'P0001', hint = 'anuncio';
  end if;
  if p_lat is null or p_lng is null or v_cidade is null then
    raise exception 'Complete o bairro no seu perfil para escrever um recado.' using errcode = 'P0001', hint = 'lugar';
  end if;
  v_ponto := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  -- Goiânia e região
  if not extensions.st_dwithin(v_ponto,
           extensions.st_setsrid(extensions.st_makepoint(-49.2563, -16.6806), 4326)::extensions.geography, 150000) then
    raise exception 'O Publike é de Goiânia e região.' using errcode = 'P0001', hint = 'lugar';
  end if;

  -- 5 por dia (24 horas): a mensagem diz quando dá para escrever de novo
  select min(l.criado_em) into primeiro
    from (select l.criado_em from privado.limites_uso l
           where l.perfil_id = pessoa and l.acao = 'recado' and l.criado_em > now() - interval '24 hours'
           order by l.criado_em desc limit 5) l;
  quando := case
              when primeiro is null then 'amanhã'
              when ((primeiro + interval '24 hours') at time zone 'America/Sao_Paulo')::date
                   = (now() at time zone 'America/Sao_Paulo')::date
                then 'hoje às ' || to_char((primeiro + interval '24 hours') at time zone 'America/Sao_Paulo', 'HH24"h"MI')
              else 'amanhã às ' || to_char((primeiro + interval '24 hours') at time zone 'America/Sao_Paulo', 'HH24"h"MI')
            end;
  perform privado.conferir_limite('recado', 5,
    'Você já escreveu 5 recados nas últimas 24 horas. Dá para escrever de novo ' || quando || '.');

  v_status := case when coalesce((select c.ia_moderacao from public.config_site c limit 1), false)
                   then 'revisao' else 'no_ar' end;
  insert into public.recados (autor_id, escrito_por, texto, foto, anuncio_id, local, cidade, bairro, status, publicado_em)
  values (conta, pessoa, v_texto, p_foto, p_anuncio, v_ponto, v_cidade, nullif(btrim(coalesce(p_bairro, '')), ''),
          v_status, case when v_status = 'no_ar' then now() end)
  returning recados.id into v_id;
  if v_status = 'revisao' then
    insert into privado.fila_ia_recados (recado_id) values (v_id);
  end if;
  return query select v_id, v_status;
end
$$;

-- Apaga o próprio recado (some de todo lugar). Devolve a foto, para o site tirar do armazenamento.
create or replace function public.apagar_recado(p_recado uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foto text;
begin
  select r.foto into v_foto from public.recados r
   where r.id = p_recado and r.autor_id = (select public.conta_atual()) and r.status <> 'apagado'
   for update;
  if not found then
    raise exception 'Recado não encontrado.' using errcode = 'P0002';
  end if;
  update public.recados r set status = 'apagado', apagado_em = now(), foto = null where r.id = p_recado;
  delete from privado.fila_ia_recados where recado_id = p_recado;
  delete from public.notificacoes n where n.recado_id = p_recado;
  return v_foto;
end
$$;

-- Dá (ou tira) a Força de um recado. Não vale no próprio. Devolve o número e se a pessoa deu.
create or replace function public.dar_forca(p_recado uuid)
returns table (forcas integer, dei boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  conta uuid := (select public.conta_atual());
  r public.recados;
  v_dei boolean;
  v_total integer;
  v_nome text;
begin
  if conta is null then
    raise exception 'Entre na sua conta para dar Força.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select * into r from public.recados x where x.id = p_recado for update;
  if not found or not privado.recado_visivel(r.status, r.autor_id) then
    raise exception 'Esse recado não está mais no ar.' using errcode = 'P0002';
  end if;
  if r.autor_id = conta then
    raise exception 'Não dá para dar Força no próprio recado.' using errcode = 'P0001', hint = 'proprio';
  end if;

  delete from public.recado_forcas f where f.recado_id = p_recado and f.perfil_id = conta;
  if found then
    v_dei := false;
  else
    insert into public.recado_forcas (recado_id, perfil_id) values (p_recado, conta);
    v_dei := true;
  end if;
  select count(*)::integer into v_total from public.recado_forcas f where f.recado_id = p_recado;
  update public.recados x set forcas = v_total where x.id = p_recado;

  -- um aviso por recado, que vai atualizando: "Fulano e mais 4 deram Força ao seu recado"
  if v_dei then
    select p.nome into v_nome from public.perfis p where p.id = conta;
    update public.notificacoes n
       set ator_id = conta, lida = false, criado_em = now(),
           texto = case when v_total > 1
                        then coalesce(v_nome, 'Alguém') || ' e mais ' || (v_total - 1) || ' deram Força ao seu recado.'
                        else coalesce(v_nome, 'Alguém') || ' deu Força ao seu recado.' end
     where n.recado_id = p_recado and n.tipo = 'recado_forca' and n.destinatario_id = r.autor_id;
    if not found then
      insert into public.notificacoes (destinatario_id, tipo, recado_id, ator_id, texto)
      values (r.autor_id, 'recado_forca', p_recado, conta,
              case when v_total > 1
                   then coalesce(v_nome, 'Alguém') || ' e mais ' || (v_total - 1) || ' deram Força ao seu recado.'
                   else coalesce(v_nome, 'Alguém') || ' deu Força ao seu recado.' end);
    end if;
  elsif v_total = 0 then
    delete from public.notificacoes n
     where n.recado_id = p_recado and n.tipo = 'recado_forca' and n.destinatario_id = r.autor_id and not n.lida;
  end if;
  return query select v_total, v_dei;
end
$$;

-- Denuncia um recado. Três denúncias de contas diferentes, com pelo menos 3 dias, tiram do ar até
-- a moderação olhar (como nos anúncios).
create or replace function public.denunciar_recado(p_recado uuid, p_motivo text, p_detalhes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  r public.recados;
begin
  if conta is null then
    raise exception 'Entre na sua conta para denunciar.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select * into r from public.recados x where x.id = p_recado;
  if not found or r.status in ('apagado') then
    raise exception 'Recado não encontrado.' using errcode = 'P0002';
  end if;
  if r.autor_id = conta then
    raise exception 'Esse recado é seu. Para tirar, use Apagar.' using errcode = 'P0001';
  end if;
  if p_motivo is null or p_motivo not in ('cobra_taxa', 'golpe', 'enganoso', 'discriminacao', 'ofensivo', 'spam', 'outro') then
    raise exception 'Escolha o motivo.' using errcode = '22023';
  end if;
  if exists (select 1 from public.denuncias_recados d where d.recado_id = p_recado and d.autor_id = conta) then
    raise exception 'Você já denunciou esse recado. A moderação vai analisar.' using errcode = 'P0001', hint = 'repetida';
  end if;
  perform privado.conferir_limite('denuncia', 10, 'Você já enviou muitas denúncias hoje. A moderação vai analisar as que chegaram.');
  insert into public.denuncias_recados (recado_id, autor_id, motivo, detalhes)
  values (p_recado, conta, p_motivo, nullif(left(btrim(coalesce(p_detalhes, '')), 1000), ''));

  if r.status = 'no_ar' and (select count(distinct d.autor_id) from public.denuncias_recados d
        join public.perfis p on p.id = d.autor_id
       where d.recado_id = p_recado and d.status = 'aberta'
         and p.criado_em <= now() - interval '3 days') >= 3 then
    update public.recados x set status = 'retido', motivo = 'Recebeu denúncias. A moderação vai analisar.'
     where x.id = p_recado and x.status = 'no_ar';
  end if;
end
$$;

-- A linha do tempo: recados no ar perto do ponto (até 30 dias), os de quem a pessoa segue (de onde
-- for) e os da própria pessoa que ainda estão em revisão.
create or replace function public.linha_recados(
  p_lat double precision,
  p_lng double precision,
  p_raio_km double precision default 25,
  p_limite integer default 60
)
returns table (
  id uuid, autor_id uuid, autor_nome text, autor_tipo text, autor_foto text, autor_verificado boolean,
  texto text, foto text, cidade text, bairro text, distancia_km double precision, status text, motivo text,
  forcas integer, dei_forca boolean, meu boolean, quando timestamptz,
  anuncio_id uuid, anuncio_tipo text, anuncio_titulo text, anuncio_autor text, anuncio_valor numeric,
  anuncio_unidade text, anuncio_regime text, anuncio_bairro text, anuncio_cidade text,
  seguindo boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  conta uuid := (select public.conta_atual());
  ponto extensions.geography :=
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  ids uuid[];
  seguidos uuid[];
begin
  if conta is null then
    return;
  end if;
  select coalesce(array_agg(s.alvo_perfil), '{}') into seguidos
    from public.seguindo s
   where s.perfil_id in (conta, (select auth.uid())) and s.alvo_perfil is not null;
  select coalesce(array_agg(x.id), '{}') into ids
    from (
      select r.id from public.recados r
       where (r.status = 'no_ar' and r.publicado_em > now() - interval '30 days'
              and privado.recado_visivel(r.status, r.autor_id)
              and (extensions.st_dwithin(r.local, ponto, least(greatest(coalesce(p_raio_km, 25), 1), 100) * 1000)
                   or r.autor_id = any (seguidos)
                   or r.autor_id = conta))
          or (r.autor_id = conta and r.status in ('revisao', 'retido') and r.criado_em > now() - interval '30 days')
       order by coalesce(r.publicado_em, r.criado_em) desc
       limit least(greatest(coalesce(p_limite, 60), 1), 200)
    ) x;
  return query
    select v.*, v.autor_id = any (seguidos)
      from privado.recados_para(ids, p_lat, p_lng) v
     order by v.quando desc;
end
$$;

-- Os recados de um perfil (no ar; para a dona, também os em revisão e retidos).
create or replace function public.recados_do_perfil(p_perfil uuid, p_limite integer default 30)
returns table (
  id uuid, autor_id uuid, autor_nome text, autor_tipo text, autor_foto text, autor_verificado boolean,
  texto text, foto text, cidade text, bairro text, distancia_km double precision, status text, motivo text,
  forcas integer, dei_forca boolean, meu boolean, quando timestamptz,
  anuncio_id uuid, anuncio_tipo text, anuncio_titulo text, anuncio_autor text, anuncio_valor numeric,
  anuncio_unidade text, anuncio_regime text, anuncio_bairro text, anuncio_cidade text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  ids uuid[];
  dona boolean := p_perfil = (select public.conta_atual());
begin
  select coalesce(array_agg(x.id), '{}') into ids
    from (
      select r.id from public.recados r
       where r.autor_id = p_perfil
         and (privado.recado_visivel(r.status, r.autor_id) or (dona and r.status in ('revisao', 'retido')))
       order by coalesce(r.publicado_em, r.criado_em) desc
       limit least(greatest(coalesce(p_limite, 30), 1), 100)
    ) x;
  return query select v.* from privado.recados_para(ids, null, null) v order by v.quando desc;
end
$$;

-- Um recado só (a página do recado, para compartilhar). Fora do ar: nada (só a dona vê).
create or replace function public.recado(p_id uuid)
returns table (
  id uuid, autor_id uuid, autor_nome text, autor_tipo text, autor_foto text, autor_verificado boolean,
  texto text, foto text, cidade text, bairro text, distancia_km double precision, status text, motivo text,
  forcas integer, dei_forca boolean, meu boolean, quando timestamptz,
  anuncio_id uuid, anuncio_tipo text, anuncio_titulo text, anuncio_autor text, anuncio_valor numeric,
  anuncio_unidade text, anuncio_regime text, anuncio_bairro text, anuncio_cidade text
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.* from privado.recados_para(
    array(select r.id from public.recados r
           where r.id = p_id
             and (privado.recado_visivel(r.status, r.autor_id)
                  or (r.autor_id = (select public.conta_atual()) and r.status in ('revisao', 'retido')))),
    null, null) v
$$;


-- 5. Servidor do site (IA) --------------------------------------------------------------------------

create or replace function public.servidor_pegar_recados_ia(p_chave text, p_limite integer default 5)
returns table (recado_id uuid, versao text, texto text, citado text, modelo text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_servidor(p_chave);
  -- travou três vezes: registra o erro e deixa para a equipe (o recado continua em revisão)
  with esgotados as (
    delete from privado.fila_ia_recados f
     where f.status = 'revisando' and f.tentar_depois <= now() and f.tentativas >= 3
    returning f.recado_id
  )
  insert into public.moderacao_ia_recados (recado_id, decisao, explicacao)
  select e.recado_id, 'erro', 'A revisão não terminou depois de três tentativas.' from esgotados e;

  return query
  with escolhidos as (
    select f.recado_id from privado.fila_ia_recados f
     where f.tentar_depois <= now() and (f.status = 'pendente' or f.tentativas < 3)
     order by f.criado_em
     limit least(greatest(coalesce(p_limite, 5), 1), 20)
     for update skip locked
  ), marcados as (
    update privado.fila_ia_recados f
       set status = 'revisando', tentativas = f.tentativas + 1, tentar_depois = now() + interval '5 minutes'
      from escolhidos e
     where f.recado_id = e.recado_id
    returning f.recado_id
  )
  select r.id, md5(r.texto), r.texto, a.titulo, c.ia_modelo
    from marcados m
    join public.recados r on r.id = m.recado_id
    left join public.anuncios a on a.id = r.anuncio_id
    cross join public.config_site c;
end
$$;

create or replace function public.servidor_resultado_recado(
  p_chave text,
  p_recado uuid,
  p_versao text,
  p_decisao text,
  p_categorias text[] default '{}',
  p_explicacao text default null,
  p_modelo text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila privado.fila_ia_recados;
  r public.recados;
  categorias text[];
begin
  perform privado.exigir_servidor(p_chave);
  if p_decisao not in ('aprovado', 'retido', 'erro') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  select * into fila from privado.fila_ia_recados f where f.recado_id = p_recado for update;
  if not found then
    return 'ignorado';
  end if;
  select * into r from public.recados x where x.id = p_recado for update;
  if not found or r.status <> 'revisao' then
    delete from privado.fila_ia_recados where recado_id = p_recado;
    return 'ignorado';
  end if;
  if md5(r.texto) is distinct from p_versao then
    update privado.fila_ia_recados set status = 'pendente', tentativas = 0, tentar_depois = now() where recado_id = p_recado;
    return 'desatualizado';
  end if;
  if p_decisao = 'erro' and fila.tentativas < 3 then
    update privado.fila_ia_recados
       set status = 'pendente', tentar_depois = now() + fila.tentativas * interval '5 minutes'
     where recado_id = p_recado;
    return 'tentar_de_novo';
  end if;
  select coalesce(array_agg(distinct c), '{}') into categorias
    from (select c from unnest(coalesce(p_categorias, '{}')) as c where c ~ '^[a-z_]{2,40}$' limit 8) t;
  delete from privado.fila_ia_recados where recado_id = p_recado;
  insert into public.moderacao_ia_recados (recado_id, decisao, categorias, explicacao, modelo)
  values (p_recado, p_decisao, categorias, left(p_explicacao, 1000), left(p_modelo, 80));

  if p_decisao = 'aprovado' then
    update public.recados set status = 'no_ar', publicado_em = now(), motivo = null where id = p_recado;
    perform privado.avisar_recado(p_recado, 'recado_no_ar', 'Seu recado está no ar.');
  elsif p_decisao = 'retido' then
    update public.recados set status = 'retido', motivo = privado.motivo_do_recado(categorias) where id = p_recado;
    perform privado.avisar_recado(p_recado, 'recado_retido',
      'Seu recado não foi publicado: ' || lower(left(privado.motivo_do_recado(categorias), 1))
      || substr(privado.motivo_do_recado(categorias), 2) || ' A equipe vai olhar também.');
  end if;
  -- 'erro' depois de três tentativas: continua em revisão e aparece na fila da equipe
  return p_decisao;
end
$$;


-- 6. Equipe -----------------------------------------------------------------------------------------

-- Recados que precisam de uma pessoa: retidos (pela IA ou por denúncias), com denúncia aberta, ou
-- que a IA não conseguiu revisar.
create or replace function public.fila_recados()
returns table (
  recado_id uuid,
  situacao text,
  texto text,
  foto text,
  status text,
  autor_id uuid,
  autor_nome text,
  cidade text,
  bairro text,
  anuncio_titulo text,
  denuncias_abertas integer,
  motivos text[],
  detalhes text[],
  ia_categorias text[],
  ia_explicacao text,
  criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_equipe();
  return query
    select r.id,
           case when r.status = 'retido' then 'retido'
                when r.status = 'revisao' then 'sem_revisao'
                else 'denunciado' end,
           r.texto, r.foto, r.status, r.autor_id, p.nome, r.cidade, r.bairro, a.titulo,
           (select count(*)::integer from public.denuncias_recados d where d.recado_id = r.id and d.status = 'aberta'),
           coalesce((select array_agg(distinct d.motivo) from public.denuncias_recados d
                      where d.recado_id = r.id and d.status = 'aberta'), '{}'),
           coalesce((select array_agg(d.detalhes order by d.criado_em) from public.denuncias_recados d
                      where d.recado_id = r.id and d.status = 'aberta' and d.detalhes is not null), '{}'),
           coalesce(ia.categorias, '{}'), ia.explicacao, r.criado_em
      from public.recados r
      join public.perfis p on p.id = r.autor_id
      left join public.anuncios a on a.id = r.anuncio_id
      left join lateral (
        select m.categorias, m.explicacao from public.moderacao_ia_recados m
         where m.recado_id = r.id order by m.criado_em desc, m.id desc limit 1
      ) ia on true
     where r.status = 'retido'
        or (r.status = 'no_ar' and exists (
              select 1 from public.denuncias_recados d where d.recado_id = r.id and d.status = 'aberta'))
        or (r.status = 'revisao' and not exists (select 1 from privado.fila_ia_recados f where f.recado_id = r.id))
     order by (r.status = 'retido') desc, r.criado_em desc;
end
$$;

-- Decisão da equipe: 'liberar' (vai ao ar; as denúncias abertas ficam improcedentes) ou 'remover'
-- (sai de todo lugar, com o motivo no aviso de quem escreveu).
create or replace function public.moderar_recado(p_recado uuid, p_decisao text, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.recados;
  v_nota text := nullif(left(btrim(coalesce(p_nota, '')), 500), '');
begin
  perform privado.exigir_equipe();
  if p_decisao not in ('liberar', 'remover') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  if p_decisao = 'remover' and v_nota is null then
    raise exception 'Escreva o motivo para quem escreveu o recado.' using errcode = '22023';
  end if;
  select * into r from public.recados x where x.id = p_recado for update;
  if not found or r.status = 'apagado' then
    raise exception 'Recado não encontrado.' using errcode = 'P0002';
  end if;
  delete from privado.fila_ia_recados where recado_id = p_recado;
  if p_decisao = 'liberar' then
    update public.recados
       set status = 'no_ar', publicado_em = coalesce(publicado_em, now()), motivo = null
     where id = p_recado;
    update public.denuncias_recados set status = 'improcedente' where recado_id = p_recado and status = 'aberta';
    if r.status <> 'no_ar' then
      perform privado.avisar_recado(p_recado, 'recado_no_ar', 'Seu recado está no ar.');
    end if;
  else
    update public.recados set status = 'apagado', apagado_em = now(), motivo = v_nota where id = p_recado;
    update public.denuncias_recados set status = 'procedente' where recado_id = p_recado and status = 'aberta';
    delete from public.notificacoes n where n.recado_id = p_recado;
    insert into public.notificacoes (destinatario_id, tipo, texto)
    values (r.autor_id, 'recado_retido', 'Seu recado foi tirado do ar pela moderação: ' || v_nota);
  end if;
  perform privado.registrar(case when p_decisao = 'liberar' then 'liberar_recado' else 'remover_recado' end,
                            'recado', p_recado::text, left(r.texto, 80),
                            jsonb_build_object('autor', r.autor_id, 'nota', v_nota));
end
$$;


-- 7. Fotos dos recados (Storage) --------------------------------------------------------------------
-- Pasta por pessoa: recados/<id-do-usuário>/<hora>.jpg. Públicas, como as fotos de trabalhos;
-- conta suspensa não envia nem apaga.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recados', 'recados', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "publike: dono vê as fotos de recados" on storage.objects;
drop policy if exists "publike: dono envia foto de recado" on storage.objects;
drop policy if exists "publike: dono apaga foto de recado" on storage.objects;

create policy "publike: dono vê as fotos de recados" on storage.objects
  for select to authenticated
  using (bucket_id = 'recados' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "publike: dono envia foto de recado" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recados' and (storage.foldername(name))[1] = (select auth.uid())::text
              and not (select public.minha_conta_suspensa()));
create policy "publike: dono apaga foto de recado" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recados' and (storage.foldername(name))[1] = (select auth.uid())::text
         and not (select public.minha_conta_suspensa()));


-- 8. Permissões -------------------------------------------------------------------------------------

revoke execute on function
  privado.motivo_do_recado(text[]),
  privado.avisar_recado(uuid, text, text),
  privado.recados_para(uuid[], double precision, double precision),
  privado.recado_visivel(text, uuid)
from public;

revoke execute on function
  public.escrever_recado(text, text, uuid, double precision, double precision, text, text),
  public.apagar_recado(uuid),
  public.dar_forca(uuid),
  public.denunciar_recado(uuid, text, text),
  public.linha_recados(double precision, double precision, double precision, integer),
  public.recados_do_perfil(uuid, integer),
  public.recado(uuid),
  public.servidor_pegar_recados_ia(text, integer),
  public.servidor_resultado_recado(text, uuid, text, text, text[], text, text),
  public.fila_recados(),
  public.moderar_recado(uuid, text, text)
from public, anon;

grant execute on function
  public.escrever_recado(text, text, uuid, double precision, double precision, text, text),
  public.apagar_recado(uuid),
  public.dar_forca(uuid),
  public.denunciar_recado(uuid, text, text),
  public.linha_recados(double precision, double precision, double precision, integer)
to authenticated;

grant execute on function
  public.recados_do_perfil(uuid, integer),
  public.recado(uuid)
to anon, authenticated;

grant execute on function
  public.fila_recados(),
  public.moderar_recado(uuid, text, text)
to authenticated, service_role;

grant execute on function
  public.servidor_pegar_recados_ia(text, integer),
  public.servidor_resultado_recado(text, uuid, text, text, text[], text, text)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
