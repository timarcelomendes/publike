-- Endereço certo para quem contrata, casa privada para quem procura.
--
-- O Publike quer pôr as pessoas para trabalhar perto de casa. Para isso o
-- local da vaga e o de quem procura precisam ser bons:
--   * Comércio, empresa e agência podem informar o endereço (CEP + número). O
--     ponto fica exato e o endereço aparece no anúncio, como numa fachada.
--     Vaga de pessoa física e vaga de "empresa confidencial" continuam com uma
--     área de ~500 m, sem endereço.
--   * Quem procura pode informar o CEP de casa. Guardamos só um ponto
--     arredondado (~300 m), que ninguém mais vê, para medir a distância e o
--     tempo até cada vaga.

-- 1. Endereço no anúncio ---------------------------------------------------------

alter table public.anuncios
  add column cep text check (cep ~ '^[0-9]{8}$'),
  add column endereco text check (char_length(endereco) between 3 and 120),
  add column local_exato boolean not null default false;

grant insert (cep, endereco), update (cep, endereco) on public.anuncios to authenticated;

create or replace function public.anuncios_antes_de_salvar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  moderador boolean := public.eh_moderador();
  -- ligado só dentro de funções do próprio banco (denúncias automáticas, IA)
  sistema boolean := coalesce(current_setting('publike.sistema', true), '') = 'on';
  lat double precision;
  lng double precision;
  prazo interval;
  foto text;
begin
  if tg_op = 'UPDATE' then
    new.tipo := old.tipo;
    new.autor_id := old.autor_id;
  end if;
  prazo := public.prazo_no_ar(new.tipo);

  new.titulo := btrim(regexp_replace(new.titulo, '\s+', ' ', 'g'));
  new.bairro := btrim(regexp_replace(new.bairro, '\s+', ' ', 'g'));
  new.descricao := btrim(new.descricao);
  new.beneficios := nullif(btrim(coalesce(new.beneficios, '')), '');
  new.horario := nullif(btrim(coalesce(new.horario, '')), '');

  -- fotos sem repetição, na ordem, e só da pasta de quem publicou
  new.fotos := coalesce(
    (select array_agg(f order by primeira)
       from (select f, min(n) as primeira
               from unnest(coalesce(new.fotos, '{}')) with ordinality as t(f, n)
              where f is not null
              group by f) u),
    '{}');
  foreach foto in array new.fotos loop
    if foto !~ ('^' || new.autor_id::text || '/[0-9]{10,20}\.jpg$') then
      raise exception 'Envie as fotos de novo.' using errcode = 'P0001', hint = 'foto_invalida';
    end if;
  end loop;

  -- onde atende: sem repetição; cidade ou "Goiânia: Região"
  new.atende := coalesce(
    (select array_agg(a order by primeira)
       from (select btrim(a) as a, min(n) as primeira
               from unnest(coalesce(new.atende, '{}')) with ordinality as t(a, n)
              where btrim(coalesce(a, '')) <> ''
              group by btrim(a)) u),
    '{}');
  if exists (select 1 from unnest(new.atende) a
              where a !~ '^(Goiânia: (Centro|Norte|Sul|Leste|Oeste|Noroeste|Sudoeste)|[[:upper:]][[:alpha:] ]{2,40})$') then
    raise exception 'Confira as regiões que você atende.' using errcode = 'P0001', hint = 'atende_invalido';
  end if;

  -- Confere o texto só quando ele muda: um anúncio antigo não trava a
  -- moderação, a IA nem o vencimento automático.
  if (tg_op = 'INSERT' or new.titulo is distinct from old.titulo or new.descricao is distinct from old.descricao
      or new.beneficios is distinct from old.beneficios or new.horario is distinct from old.horario
      or new.bairro is distinct from old.bairro or new.cidade is distinct from old.cidade
      or new.endereco is distinct from old.endereco)
     and (public.tem_contato(new.titulo) or public.tem_contato(new.descricao, true)
          or public.tem_contato(new.beneficios, true) or public.tem_contato(new.horario, true)
          or public.tem_contato(new.bairro) or public.tem_contato(new.cidade)
          or public.tem_contato(new.endereco)) then
    raise exception 'Tire o telefone, e-mail ou link do texto. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;

  -- O ponto fica exato ou vira uma área de ~500 m em anuncios_endereco (logo depois deste).
  lat := extensions.st_y(new.local::extensions.geometry);
  lng := extensions.st_x(new.local::extensions.geometry);
  if lat not between -17.5 and -15.9 or lng not between -50.3 and -48.4 then
    raise exception 'Por enquanto o Publike funciona em Goiânia e região. Marque um ponto dentro da região metropolitana.'
      using errcode = 'P0001', hint = 'fora_da_regiao';
  end if;

  if tg_op = 'INSERT' then
    new.status := 'ativo';
    new.nota_moderacao := null;
    new.status_anterior := null;
    new.criado_em := now();
    new.atualizado_em := now();
    new.expira_em := now() + prazo;
    if usuario is not null then
      perform privado.exigir_conta_ativa();
      if not exists (
        select 1 from public.contatos c
         where c.perfil_id = usuario and (c.whatsapp is not null or c.email is not null)
      ) then
        raise exception 'Complete seu perfil com um WhatsApp antes de publicar.'
          using errcode = 'P0001', hint = 'perfil_incompleto';
      end if;
      if new.tipo = 'servico' and (
        select count(*) from public.anuncios a
         where a.autor_id = usuario and a.tipo = 'servico' and a.status in ('ativo', 'pausado', 'expirado', 'em_analise')
      ) >= 8 then
        raise exception 'Você já tem 8 serviços. Tire algum para pôr outro.'
          using errcode = 'P0001', hint = 'limite_servicos';
      end if;
      perform privado.conferir_ativos(new.id);
      perform privado.conferir_limite('anuncio', 10, 'Você chegou ao limite de 10 publicações por dia. Tente de novo amanhã.');
    end if;
  else
    new.id := old.id;
    new.criado_em := old.criado_em;
    new.atualizado_em := now();
    -- a moderação muda a situação do anúncio só pelos botões (moderar_anuncio)
    if usuario is not null and moderador and not sistema and usuario <> old.autor_id
       and new.status is distinct from old.status then
      raise exception 'Mude a situação do anúncio pelos botões da moderação.' using errcode = 'P0001';
    end if;
    -- regras de quem publicou (valem também para o moderador no próprio anúncio)
    if usuario is not null and not sistema and (not moderador or usuario = old.autor_id) then
      perform privado.exigir_conta_ativa();
      if old.status in ('em_analise', 'removido') then
        raise exception 'Este anúncio está com a moderação e não pode ser alterado agora.'
          using errcode = 'P0001', hint = 'com_moderacao';
      end if;
      if new.status is distinct from old.status and new.status not in ('ativo', 'pausado', 'encerrado') then
        raise exception 'Mudança de status não permitida.' using errcode = '42501';
      end if;
      new.nota_moderacao := old.nota_moderacao;
      -- cada mudança no texto passa de novo pela IA: um limite por dia evita abuso
      if privado.conteudo_revisado(new) <> privado.conteudo_revisado(old) then
        perform privado.conferir_limite('edicao', 40, 'Você editou anúncios muitas vezes hoje. Tente de novo amanhã.');
      end if;
      -- voltar ao ar (de encerrado ou expirado) conta no limite de 20 no ar
      if new.status in ('ativo', 'pausado') and old.status not in ('ativo', 'pausado') then
        perform privado.conferir_ativos(new.id);
      end if;
    end if;
    -- guarda a situação de antes da moderação: ao liberar, o anúncio volta para ela
    if new.status in ('em_analise', 'removido') then
      new.status_anterior := case when old.status in ('em_analise', 'removido') then old.status_anterior else old.status end;
    else
      new.status_anterior := null;
    end if;
    -- voltar ao ar renova o prazo
    if new.status = 'ativo' and old.status is distinct from 'ativo' then
      new.expira_em := now() + prazo;
    end if;
  end if;
  return new;
end
$$;

-- Depois de anuncios_antes_de_salvar e anuncios_contratante (os gatilhos rodam em
-- ordem alfabética): decide se o ponto fica exato ou vira uma área de ~500 m.
create or replace function public.anuncios_endereco()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tipo_autor text;
begin
  new.endereco := nullif(btrim(regexp_replace(coalesce(new.endereco, ''), '\s+', ' ', 'g')), '');
  new.cep := nullif(regexp_replace(coalesce(new.cep, ''), '[^0-9]', '', 'g'), '');
  select p.tipo into tipo_autor from public.perfis p where p.id = new.autor_id;

  if new.endereco is not null and coalesce(tipo_autor, 'pessoa') <> 'pessoa'
     and not coalesce(new.contratante_confidencial, false) then
    -- endereço de comércio/empresa é público, como a fachada: ponto exato (~1 m)
    new.local := extensions.st_snaptogrid(new.local::extensions.geometry, 0.00001)::extensions.geography;
    new.local_exato := true;
  else
    -- pessoa física e empresa confidencial: só a região (grade de ~500 m)
    new.local := extensions.st_snaptogrid(new.local::extensions.geometry, 0.005)::extensions.geography;
    new.endereco := null;
    new.cep := null;
    new.local_exato := false;
  end if;
  return new;
end
$$;

revoke execute on function public.anuncios_endereco() from public;

create trigger anuncios_endereco
  before insert or update on public.anuncios
  for each row execute function public.anuncios_endereco();

-- Os anúncios que já existem continuam como estão: área de ~500 m, sem endereço.


-- 2. Página do anúncio: endereço, CEP e se o ponto é exato -------------------------

drop function public.obter_anuncio(uuid);
create function public.obter_anuncio(p_id uuid)
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
  minha_mensagem text,
  oficio text,
  fotos text[],
  atende text[],
  pede_curriculo boolean,
  contratante text,
  contratante_confidencial boolean,
  autor_cnpj text,
  cep text,
  endereco text,
  local_exato boolean
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
         c.status, c.mensagem,
         a.oficio, a.fotos, a.atende, a.pede_curriculo,
         a.contratante, a.contratante_confidencial, p.cnpj,
         a.cep, a.endereco, a.local_exato
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
   where a.id = p_id
$$;

grant execute on function public.obter_anuncio(uuid) to anon, authenticated;


-- 3. Casa de quem procura: CEP privado e ponto arredondado ---------------------------

create table public.casas (
  perfil_id uuid primary key default auth.uid() references public.perfis (id) on delete cascade,
  cep text not null check (cep ~ '^[0-9]{8}$'),
  cidade text not null check (char_length(cidade) between 2 and 60),
  bairro text not null default '' check (char_length(bairro) <= 80),
  local extensions.geography(point, 4326) not null,
  atualizado_em timestamptz not null default now()
);

alter table public.casas enable row level security;

create policy "cada um vê a própria casa" on public.casas
  for select to authenticated using (perfil_id = (select auth.uid()));
create policy "cada um guarda a própria casa" on public.casas
  for insert to authenticated with check (perfil_id = (select auth.uid()));
create policy "cada um muda a própria casa" on public.casas
  for update to authenticated using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()));
create policy "cada um apaga a própria casa" on public.casas
  for delete to authenticated using (perfil_id = (select auth.uid()));

revoke all on public.casas from anon, authenticated;
grant select, delete on public.casas to authenticated;
grant insert (cep, cidade, bairro, local), update (cep, cidade, bairro, local) on public.casas to authenticated;

-- Nunca guarda o ponto exato: grade de ~300 m. Só vale Goiânia e região.
create or replace function public.casas_antes_de_salvar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lat double precision;
  lng double precision;
begin
  new.cep := regexp_replace(coalesce(new.cep, ''), '[^0-9]', '', 'g');
  new.cidade := btrim(regexp_replace(coalesce(new.cidade, ''), '\s+', ' ', 'g'));
  new.bairro := btrim(regexp_replace(coalesce(new.bairro, ''), '\s+', ' ', 'g'));
  new.local := extensions.st_snaptogrid(new.local::extensions.geometry, 0.003)::extensions.geography;
  lat := extensions.st_y(new.local::extensions.geometry);
  lng := extensions.st_x(new.local::extensions.geometry);
  if lat not between -17.5 and -15.9 or lng not between -50.3 and -48.4 then
    raise exception 'Por enquanto o Publike funciona em Goiânia e região.'
      using errcode = 'P0001', hint = 'fora_da_regiao';
  end if;
  new.atualizado_em := now();
  return new;
end
$$;

revoke execute on function public.casas_antes_de_salvar() from public;

create trigger casas_antes_de_salvar
  before insert or update on public.casas
  for each row execute function public.casas_antes_de_salvar();

-- A casa de quem está logado, com o ponto em números (para medir distâncias).
create or replace function public.minha_casa()
returns table (cep text, cidade text, bairro text, lat double precision, lng double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.cep, c.cidade, c.bairro,
         extensions.st_y(c.local::extensions.geometry), extensions.st_x(c.local::extensions.geometry)
    from public.casas c
   where c.perfil_id = (select auth.uid())
$$;

revoke execute on function public.minha_casa() from public, anon;
grant execute on function public.minha_casa() to authenticated;

-- O último endereço que a pessoa usou numa vaga, para não digitar de novo.
create or replace function public.meu_ultimo_endereco()
returns table (cep text, endereco text, cidade text, bairro text, lat double precision, lng double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.cep, a.endereco, a.cidade, a.bairro,
         round(extensions.st_y(a.local::extensions.geometry)::numeric, 5)::double precision,
         round(extensions.st_x(a.local::extensions.geometry)::numeric, 5)::double precision
    from public.anuncios a
   where a.autor_id = (select auth.uid()) and a.endereco is not null
   order by a.criado_em desc
   limit 1
$$;

revoke execute on function public.meu_ultimo_endereco() from public, anon;
grant execute on function public.meu_ultimo_endereco() to authenticated;


-- 4. Busca: com o CEP de casa, a ordem é pela distância -----------------------------
-- (a mesma busca de 20261009180000_avaliacoes.sql, com p_por_distancia)

drop function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text
);

create function public.buscar_anuncios(
  p_lat double precision default -16.6806,
  p_lng double precision default -49.2563,
  p_raio_km double precision default 25,
  p_tipo text default null,
  p_categoria text default null,
  p_regime text default null,
  p_texto text default null,
  p_ordem text default 'perto',
  p_limite integer default 60,
  p_cidade text default null,
  p_bairro text default null,
  p_bairros_regiao text[] default null,
  p_regiao text default null,
  -- com o CEP de casa, a ordem é só pela distância (sem "primeiro o bairro")
  p_por_distancia boolean default false
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
  minha_curtida text,
  prioridade integer,
  oficio text,
  foto text,
  autor_nota numeric,
  autor_avaliacoes integer
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
  ),
  casa as (
    select nullif(btrim(coalesce(p_cidade, '')), '') as cidade,
           nullif(public.chave_bairro(coalesce(p_bairro, '')), '') as bairro,
           coalesce(p_bairros_regiao, '{}') as regiao,
           case when btrim(coalesce(p_cidade, '')) = 'Goiânia' and nullif(btrim(coalesce(p_regiao, '')), '') is not null
                then 'Goiânia: ' || btrim(p_regiao) end as area
  ),
  achados as (
    select a.id, a.tipo, a.titulo, a.categoria, a.regime,
           a.pagamento_valor, a.pagamento_unidade, a.beneficios,
           a.cidade, a.bairro,
           round(st_y(a.local::geometry)::numeric, 5)::double precision as lat,
           round(st_x(a.local::geometry)::numeric, 5)::double precision as lng,
           st_distance(a.local, ref.ponto) as distancia_m,
           a.criado_em, p.id as autor_id, p.nome as autor_nome, p.tipo as autor_tipo,
           p.verificado as autor_verificado,
           c.status as minha_curtida,
           case
             when p_por_distancia then 2
             when h.cidade is null then 3
             when a.cidade = h.cidade and h.bairro is not null and public.chave_bairro(a.bairro) = h.bairro then 0
             when a.cidade = h.cidade and public.chave_bairro(a.bairro) = any (h.regiao) then 1
             when a.tipo = 'servico' and h.area is not null and h.area = any (a.atende) then 1
             when a.cidade = h.cidade then 2
             when a.tipo = 'servico' and h.cidade = any (a.atende) then 2
             else 3
           end as prioridade,
           a.oficio,
           a.fotos[1] as foto
      from public.anuncios a
      cross join ref
      cross join consulta q
      cross join casa h
      join public.perfis p on p.id = a.autor_id
      left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
     where a.status = 'ativo'
       and a.expira_em > now()
       and (p.suspenso_ate is null or p.suspenso_ate <= now())
       and (st_dwithin(a.local, ref.ponto, least(greatest(p_raio_km, 1), 100) * 1000)
            or (a.tipo = 'servico' and h.cidade is not null
                and (h.cidade = any (a.atende) or h.area = any (a.atende))))
       and (p_tipo is null or a.tipo = p_tipo)
       and (p_categoria is null or a.categoria = p_categoria)
       and (p_regime is null or a.regime = p_regime)
       and (q.texto is null
            or a.busca @@ q.tsq
            or public.sem_acento(a.titulo) ilike '%' || public.sem_acento(q.texto) || '%')
  ),
  escolhidos as (
    select * from achados x
     order by
       x.prioridade,
       case when p_ordem = 'recentes' then x.criado_em end desc nulls last,
       x.distancia_m,
       x.criado_em desc
     limit least(greatest(p_limite, 1), 200)
  )
  select x.id, x.tipo, x.titulo, x.categoria, x.regime,
         x.pagamento_valor, x.pagamento_unidade, x.beneficios,
         x.cidade, x.bairro, x.lat, x.lng,
         round((x.distancia_m / 1000)::numeric, 1)::double precision,
         x.criado_em, x.autor_id, x.autor_nome, x.autor_tipo, x.autor_verificado,
         x.minha_curtida, x.prioridade, x.oficio, x.foto,
         n.media, coalesce(n.total, 0)
    from escolhidos x
    left join lateral (
      select * from public.nota_do_profissional(x.autor_id) where x.tipo = 'servico'
    ) n on true
   order by
     x.prioridade,
     case when p_ordem = 'recentes' then x.criado_em end desc nulls last,
     x.distancia_m,
     x.criado_em desc
$$;

revoke all on function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text, boolean
) from public;
grant execute on function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text, boolean
) to anon, authenticated;

notify pgrst, 'reload schema';
