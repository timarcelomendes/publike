-- A vaga com candidatura no site da empresa (13/11/2026; claude/plano-candidatura-no-site-da-empresa.md). Pedido do
-- Marcelo ("quero"): a Nutriex topou divulgar as vagas no Publike, mas recebe os candidatos na Gupy, num lugar só.
-- A vaga aparece como qualquer outra (busca, mapa, avisos), mas o Curtir vira "Candidatar no site da empresa", que
-- leva ao link da vaga no site dela. Quem procura passa pelo Publike antes de sair.
--
-- 1. A vaga: candidatura ('publike', o padrão, ou 'site') e o link (só https). No site da empresa, nada de contato
--    direto nem de pedir currículo. Quem publica escolhe entre os sites de vaga conhecidos (Gupy, Inhire, Sólides e
--    outros: privado.site_de_candidatura_aceito); o link de outro site entra pela equipe (o admin).
-- 2. Curtir uma vaga do site não vale (o banco recusa, para todo caminho: cartão, feed, Descobrir).
-- 3. As idas ao site: cada toque em "Candidatar no site da empresa" conta (privado.idas_ao_site). Quem tem conta vê
--    as vagas em Minhas curtidas ("Fui para o site"); quem publicou e a equipe veem os números.
-- 4. Onde aparecem: a vaga (obter_anuncio) e a busca (buscar_anuncios) dizem a candidatura (em Relevantes, a vaga do
--    site fica um pouco abaixo: metade dos pontos e, no mesmo lugar, depois das outras); o Descobrir (curtir ou
--    pular) e o arquivo de vagas para outros sites (a vaga já está lá pelo sistema da empresa) ficam sem elas; a vaga
--    do site nunca conta como parada (o impulso automático não pega).
-- 5. A conferência do link, uma vez por dia (o robô das filas): o link que não abre mais (ou a vaga fechada na Gupy)
--    tira a vaga do ar.
-- 6. Os alertas do sistema: quando uma peça de fora muda (o formato da página da Gupy), a equipe recebe um e-mail e
--    vê no Painel do admin ("Precisa de você"), só na primeira vez, até voltar a funcionar.
-- Pode rodar de novo.

-- ------------------------------------------------------------------ 1. a vaga

alter table public.anuncios
  add column if not exists candidatura text not null default 'publike',
  add column if not exists link_candidatura text;

do $$
begin
  alter table public.anuncios add constraint anuncios_candidatura_check
    check (candidatura in ('publike', 'site')
           and (candidatura = 'publike' or tipo = 'vaga')
           and (candidatura = 'site') = (link_candidatura is not null)
           and (link_candidatura is null
                or (link_candidatura ~ '^https://[^\s/?#]+\.[^\s/?#]+' and char_length(link_candidatura) <= 500)));
exception when duplicate_object then null;
end
$$;

grant insert (candidatura, link_candidatura), update (candidatura, link_candidatura) on public.anuncios to authenticated;

-- Os sites de vaga que quem publica pode usar (os sistemas de recrutamento). A mesma lista do site:
-- SITES_DE_CANDIDATURA, em src/lib/candidatura.ts.
create or replace function privado.site_de_candidatura_aceito(p_link text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(lower(substring(p_link from '^https://([^/:?#]+)')) ~ (
    '(^|\.)(' || array_to_string(array[
      'gupy\.io', 'gupy\.com\.br', 'inhire\.app', 'kenoby\.com', 'solides\.jobs', 'solides\.com\.br',
      'recrutei\.com\.br', 'pandape\.com\.br', 'abler\.com\.br', 'quickin\.io', 'taqe\.com\.br', '99jobs\.com',
      'empregare\.com', 'selecty\.com\.br', 'vagas\.com\.br', 'factorialhr\.com', 'factorialhr\.com\.br',
      'greenhouse\.io', 'lever\.co', 'workable\.com', 'myworkdayjobs\.com', 'smartrecruiters\.com',
      'teamtailor\.com', 'recruitee\.com', 'bamboohr\.com', 'breezy\.hr', 'jobvite\.com'], '|') || ')$'), false)
$$;

-- Antes de salvar: o link limpo e conferido; no site da empresa, sem contato direto e sem pedir currículo.
create or replace function privado.anuncio_candidatura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.candidatura is distinct from 'site' then
    new.candidatura := 'publike';
    new.link_candidatura := null;
    return new;
  end if;
  if new.tipo <> 'vaga' then
    raise exception 'Só vaga recebe candidatos no site da empresa.' using errcode = 'P0001', hint = 'link_candidatura';
  end if;
  new.link_candidatura := nullif(btrim(new.link_candidatura), '');
  if new.link_candidatura is null or new.link_candidatura !~ '^https://[^\s/?#]+\.[^\s/?#]+'
     or char_length(new.link_candidatura) > 500 then
    raise exception 'Cole o link da vaga no site da empresa, começando com https://.'
      using errcode = 'P0001', hint = 'link_candidatura';
  end if;
  -- quem publica usa um dos sites de vaga conhecidos; o site próprio da empresa entra pela equipe (o admin)
  if (select auth.uid()) is not null and not privado.eh_admin()
     and (tg_op = 'INSERT' or new.link_candidatura is distinct from old.link_candidatura)
     and not privado.site_de_candidatura_aceito(new.link_candidatura) then
    raise exception 'Esse site ainda não está na lista do Publike (Gupy, Inhire, Sólides e outros sites de vagas). Para usar o site da sua empresa, fale com a equipe do Publike.'
      using errcode = 'P0001', hint = 'link_candidatura';
  end if;
  new.contato_direto := false;
  new.pede_curriculo := false;
  return new;
end
$$;
revoke execute on function privado.anuncio_candidatura() from public;

drop trigger if exists anuncios_candidatura on public.anuncios;
create trigger anuncios_candidatura
  before insert or update of candidatura, link_candidatura, tipo, contato_direto, pede_curriculo on public.anuncios
  for each row execute function privado.anuncio_candidatura();

-- ------------------------------------------------------------------ 2. curtir não vale

create or replace function privado.curtida_em_vaga_do_site()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pendente' and (tg_op = 'INSERT' or old.status is distinct from 'pendente')
     and exists (select 1 from public.anuncios a where a.id = new.anuncio_id and a.candidatura = 'site') then
    raise exception 'Esta vaga recebe os candidatos no site da empresa. Toque em “Candidatar no site da empresa”.'
      using errcode = 'P0001', hint = 'site';
  end if;
  return new;
end
$$;
revoke execute on function privado.curtida_em_vaga_do_site() from public;

drop trigger if exists curtidas_vaga_do_site on public.curtidas;
create trigger curtidas_vaga_do_site
  before insert or update of status on public.curtidas
  for each row execute function privado.curtida_em_vaga_do_site();

-- ------------------------------------------------------------------ 3. as idas ao site

create table if not exists privado.idas_ao_site (
  id bigint generated always as identity primary key,
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  -- quem foi (sem conta: null)
  perfil_id uuid references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now()
);
create index if not exists idas_ao_site_da_vaga on privado.idas_ao_site (anuncio_id, criado_em desc);
create index if not exists idas_ao_site_de_quem on privado.idas_ao_site (perfil_id, criado_em desc)
  where perfil_id is not null;
alter table privado.idas_ao_site enable row level security;
revoke all on privado.idas_ao_site from public, anon, authenticated;

-- O toque em "Candidatar no site da empresa". Não conta: quem publicou, a mesma pessoa de novo em 30 minutos e,
-- sem conta, mais de 200 por hora na mesma vaga (robô).
create or replace function public.registrar_ida_ao_site(p_anuncio uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_quem uuid := (select auth.uid());
  a public.anuncios;
begin
  select * into a from public.anuncios x where x.id = p_anuncio;
  if a.id is null or a.candidatura <> 'site' or a.status <> 'ativo' then
    return false;
  end if;
  if v_quem is not null then
    if a.autor_id = v_quem
       or exists (select 1 from privado.idas_ao_site i
                   where i.anuncio_id = p_anuncio and i.perfil_id = v_quem and i.criado_em > now() - interval '30 minutes')
    then
      return false;
    end if;
  elsif (select count(*) from privado.idas_ao_site i
          where i.anuncio_id = p_anuncio and i.perfil_id is null and i.criado_em > now() - interval '1 hour') >= 200 then
    return false;
  end if;
  insert into privado.idas_ao_site (anuncio_id, perfil_id) values (p_anuncio, v_quem);
  return true;
end
$$;

-- Minhas curtidas › "Fui para o site": as vagas que a pessoa abriu no site da empresa (a última vez de cada uma).
create or replace function public.minhas_idas_ao_site()
returns table (anuncio_id uuid, titulo text, empresa text, status text, link text, em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select distinct on (i.anuncio_id) i.anuncio_id, a.titulo,
           case when a.contratante_confidencial then 'Empresa confidencial' else coalesce(a.contratante, p.nome) end,
           a.status, a.link_candidatura, i.criado_em
      from privado.idas_ao_site i
      join public.anuncios a on a.id = i.anuncio_id
      join public.perfis p on p.id = a.autor_id
     where i.perfil_id = (select auth.uid())
     order by i.anuncio_id, i.criado_em desc
  ) x
  order by x.criado_em desc
  limit 60
$$;

-- Os números de cada vaga: quem publicou (a conta) e a equipe. total (toques), semana (7 dias) e pessoas (com conta).
create or replace function public.idas_ao_site_das_vagas(p_ids uuid[])
returns table (anuncio_id uuid, total integer, semana integer, pessoas integer)
language sql
stable
security definer
set search_path = ''
as $$
  select i.anuncio_id, count(*)::integer,
         (count(*) filter (where i.criado_em > now() - interval '7 days'))::integer,
         (count(distinct i.perfil_id))::integer
    from privado.idas_ao_site i
    join public.anuncios a on a.id = i.anuncio_id
   where i.anuncio_id = any ((coalesce(p_ids, '{}'::uuid[]))[1:200])
     and (a.autor_id = public.conta_atual() or privado.eh_admin())
   group by i.anuncio_id
$$;

revoke execute on function public.registrar_ida_ao_site(uuid), public.minhas_idas_ao_site(),
  public.idas_ao_site_das_vagas(uuid[]) from public;
grant execute on function public.registrar_ida_ao_site(uuid) to anon, authenticated;
grant execute on function public.minhas_idas_ao_site(), public.idas_ao_site_das_vagas(uuid[]) to authenticated;

-- ------------------------------------------------------------------ 4. onde aparecem

-- a vaga e a busca dizem a candidatura (a mesma de 20261019230000 e de 20270413120000, com as colunas no fim)
drop function if exists public.obter_anuncio(uuid);
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
  local_exato boolean,
  pagamento_ate numeric,
  comissao boolean,
  beneficios_lista text[],
  escolaridade_minima text,
  experiencia text,
  cnh text,
  jornada text,
  modelo text,
  pcd text,
  perguntas jsonb,
  beneficios_extras text[],
  horario_detalhe jsonb,
  minhas_respostas jsonb,
  contato_direto boolean,
  preenchida_em timestamptz,
  prazo_dias smallint,
  ganhos_extras jsonb,
  candidatura text,
  link_candidatura text
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
         a.cep, a.endereco, a.local_exato,
         a.pagamento_ate, a.comissao, a.beneficios_lista, a.escolaridade_minima, a.experiencia, a.cnh,
         a.jornada, a.modelo, a.pcd,
         a.perguntas, a.beneficios_extras, a.horario_detalhe, c.respostas, a.contato_direto,
         a.preenchida_em, a.prazo_dias, a.ganhos_extras, a.candidatura, a.link_candidatura
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
   where a.id = p_id
$$;

grant execute on function public.obter_anuncio(uuid) to anon, authenticated;

drop function if exists public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text, boolean
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
  autor_avaliacoes integer,
  pagamento_ate numeric,
  comissao boolean,
  candidatura text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with ref as (
    -- o raio em graus, para a caixa em volta do ponto (cortar antes de calcular a distância)
    select least(greatest(p_raio_km, 1), 100) * 1000 as raio_m,
           least(greatest(p_raio_km, 1), 100) / 111.0 as dlat,
           least(greatest(p_raio_km, 1), 100) / (111.0 * greatest(cos(radians(p_lat)), 0.2)) as dlng
  ),
  termo as (
    select nullif(btrim(coalesce(p_texto, '')), '') as texto
  ),
  -- uma linha só, calculada uma vez (materialized: sem repetir a consulta para cada anúncio)
  consulta as materialized (
    -- só palavras vazias ("de"): sem consulta de texto (fica o trecho no título)
    select c.texto, c.norma, case when numnode(c.tsq) > 0 then c.tsq end as tsq,
           -- erro de digitação: só numa palavra sozinha, de 4 letras ou mais ("mecanio")
           c.norma is not null and length(c.norma) >= 4 and position(' ' in c.norma) = 0 as parecido
      from (
        select t.texto,
               case when t.texto is null then null else lower(public.sem_acento(t.texto)) end as norma,
               case when t.texto is null then null else public.consulta_da_busca(t.texto) end as tsq
          from termo t
      ) c
  ),
  casa as (
    select nullif(btrim(coalesce(p_cidade, '')), '') as cidade,
           nullif(public.chave_bairro(coalesce(p_bairro, '')), '') as bairro,
           coalesce(p_bairros_regiao, '{}') as regiao,
           case when btrim(coalesce(p_cidade, '')) = 'Goiânia' and nullif(btrim(coalesce(p_regiao, '')), '') is not null
                then 'Goiânia: ' || btrim(p_regiao) end as area
  ),
  candidatos as (
    select d.*
      from (
        select a.id, a.tipo, a.titulo, a.categoria, a.regime, a.pagamento_valor, a.pagamento_unidade, a.beneficios,
               a.pagamento_ate, a.comissao, a.cidade, a.bairro, a.geo_lat, a.geo_lng, a.criado_em, a.autor_id,
               a.oficio, a.fotos, a.busca, a.atende, a.candidatura,
               p.nome as p_nome, p.tipo as p_tipo, p.verificado as p_verificado,
               -- a distância em metros no elipsoide WGS84 (os raios de curvatura na latitude do meio): até 100 km,
               -- a mesma do PostGIS, com diferença de metros
               sqrt(power(6335439.327 / power(1 - 0.00669437999014 * power(sin(radians((a.geo_lat + p_lat) / 2)), 2), 1.5)
                          * radians(a.geo_lat - p_lat), 2)
                    + power(6378137.0 / sqrt(1 - 0.00669437999014 * power(sin(radians((a.geo_lat + p_lat) / 2)), 2))
                            * cos(radians((a.geo_lat + p_lat) / 2)) * radians(a.geo_lng - p_lng), 2))
                 as distancia_m,
               lower(public.sem_acento(a.titulo)) as titulo_norma,
               ref.raio_m,
               (a.geo_lat between p_lat - ref.dlat and p_lat + ref.dlat
                and a.geo_lng between p_lng - ref.dlng and p_lng + ref.dlng) as na_caixa
          from public.anuncios a
          cross join ref
          join public.perfis p on p.id = a.autor_id
         where a.status = 'ativo'
           and a.expira_em > now()
           and (p.suspenso_ate is null or p.suspenso_ate <= now())
           and (p_tipo is null or a.tipo = p_tipo)
           and (p_categoria is null or a.categoria = p_categoria)
           and (p_regime is null or a.regime = p_regime)
      ) d
      cross join casa h
     where ((d.na_caixa and d.distancia_m <= d.raio_m)
            or (d.tipo = 'servico' and h.cidade is not null
                and (h.cidade = any (d.atende) or h.area = any (d.atende))))
  ),
  achados as (
    select a.id, a.tipo, a.titulo, a.categoria, a.regime,
           a.pagamento_valor, a.pagamento_unidade, a.beneficios, a.pagamento_ate, a.comissao,
           a.cidade, a.bairro,
           round(a.geo_lat::numeric, 5)::double precision as lat,
           round(a.geo_lng::numeric, 5)::double precision as lng,
           a.distancia_m,
           a.criado_em, a.autor_id, a.p_nome as autor_nome, a.p_tipo as autor_tipo,
           a.p_verificado as autor_verificado,
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
           case
             when q.texto is null then 0
             when strpos(a.titulo_norma, q.norma) > 0 then 3
             when to_tsvector('portuguese'::regconfig, public.sem_acento(a.titulo)) @@ q.tsq then 2
             when q.parecido and word_similarity(q.norma, a.titulo_norma) >= 0.6 then 2
             else 1
           end as relevancia,
           a.oficio,
           a.fotos[1] as foto,
           a.candidatura
      from candidatos a
      cross join consulta q
      cross join casa h
      left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
     where q.texto is null
        or a.busca @@ q.tsq
        or strpos(a.titulo_norma, q.norma) > 0
        or (q.parecido and word_similarity(q.norma, a.titulo_norma) >= 0.6)
  ),
  -- só nas ordens que precisam: a hora que vale (publicação ou última curtida, só de vaga) e os pontos
  medidos as (
    select x.*,
           case when p_ordem = 'ultimas' and x.tipo = 'vaga'
                then greatest(x.criado_em, coalesce(privado.ultima_curtida(x.id), x.criado_em))
                else x.criado_em end as atividade,
           -- Relevantes: a vaga do site da empresa vale a metade dos pontos (não tira candidato de quem recebe pelo
           -- Publike); sem curtidas, ela já não ganha os pontos delas
           case when p_ordem = 'relevantes'
                then privado.pontos_do_anuncio(x.id) / case when x.candidatura = 'site' then 2 else 1 end
                else 0 end as pontos
      from achados x
  ),
  escolhidos as (
    select * from medidos x
     order by
       case when p_ordem in ('recentes', 'ultimas') then 0 else x.relevancia end desc,
       x.pontos desc,
       case when p_ordem = 'ultimas' then x.atividade end desc nulls last,
       case when p_ordem = 'recentes' then x.criado_em end desc nulls last,
       x.prioridade,
       case when p_ordem = 'recentes' then x.criado_em end desc nulls last,
       -- Relevantes: no mesmo lugar, a vaga do site depois das que recebem pelo Publike
       case when p_ordem = 'relevantes' and x.candidatura = 'site' then 1 else 0 end,
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
         n.media, coalesce(n.total, 0), x.pagamento_ate, x.comissao, x.candidatura
    from escolhidos x
    left join lateral (
      select * from public.nota_do_profissional(x.autor_id) where x.tipo = 'servico'
    ) n on true
   order by
     case when p_ordem in ('recentes', 'ultimas') then 0 else x.relevancia end desc,
     x.pontos desc,
     case when p_ordem = 'ultimas' then x.atividade end desc nulls last,
     case when p_ordem = 'recentes' then x.criado_em end desc nulls last,
     x.prioridade,
     case when p_ordem = 'recentes' then x.criado_em end desc nulls last,
     case when p_ordem = 'relevantes' and x.candidatura = 'site' then 1 else 0 end,
     x.distancia_m,
     x.criado_em desc
$$;

revoke all on function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text, boolean
) from public;
grant execute on function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text, boolean
) to anon, authenticated;

-- o arquivo de vagas para outros sites (a mesma de 20270310120000, sem as do site)
create or replace function public.vagas_para_o_feed(p_limite integer default 2000)
returns table (id uuid, titulo text, descricao text, categoria text, regime text, jornada text,
               pagamento_valor numeric, pagamento_ate numeric, pagamento_unidade text, cidade text, bairro text,
               empresa text, criado_em timestamptz, atualizado_em timestamptz, expira_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.titulo, a.descricao, a.categoria, a.regime, a.jornada, a.pagamento_valor, a.pagamento_ate,
         a.pagamento_unidade, a.cidade, a.bairro,
         -- vaga de agência: a empresa que contrata, ou "Empresa confidencial"; senão, quem publicou
         case when a.contratante_confidencial then 'Empresa confidencial' else coalesce(a.contratante, p.nome) end,
         a.criado_em, a.atualizado_em, a.expira_em
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
   where a.tipo = 'vaga' and a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null
     and p.vagas_em_outros_sites
     -- no site da empresa: a vaga já está nos outros sites pelo sistema de recrutamento dela
     and a.candidatura = 'publike'
     and (p.suspenso_ate is null or p.suspenso_ate < now())
   order by a.criado_em desc
   limit least(greatest(coalesce(p_limite, 2000), 1), 5000)
$$;
revoke execute on function public.vagas_para_o_feed(integer) from public;
grant execute on function public.vagas_para_o_feed(integer) to anon, authenticated, service_role;

-- o Descobrir é curtir ou pular: sem as do site (a mesma de 20261009270000)
create or replace function public.vagas_para_descobrir(p_limite integer default 300)
returns table (
  id uuid,
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
  criado_em timestamptz,
  autor_id uuid,
  autor_nome text,
  autor_tipo text,
  autor_verificado boolean,
  contratante text,
  contratante_confidencial boolean,
  pede_curriculo boolean,
  curtidas_7d integer,
  salvas_7d integer,
  minha_curtida text,
  salva boolean,
  dispensada boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.titulo, left(a.descricao, 600), a.categoria, a.regime, a.pagamento_valor, a.pagamento_unidade,
         a.beneficios, a.horario, a.vagas, a.cidade, a.bairro,
         round(extensions.st_y(a.local::extensions.geometry)::numeric, 5)::double precision,
         round(extensions.st_x(a.local::extensions.geometry)::numeric, 5)::double precision,
         a.criado_em, a.autor_id,
         case when p.tipo = 'pessoa' then split_part(p.nome, ' ', 1) else p.nome end,
         p.tipo, p.verificado, a.contratante, a.contratante_confidencial, a.pede_curriculo,
         (select count(*) from public.curtidas c where c.anuncio_id = a.id and c.criado_em > now() - interval '7 days')::integer,
         (select count(*) from public.salvas s where s.anuncio_id = a.id and s.criado_em > now() - interval '7 days')::integer,
         (select c.status from public.curtidas c where c.anuncio_id = a.id and c.perfil_id = (select auth.uid())),
         exists (select 1 from public.salvas s where s.anuncio_id = a.id and s.perfil_id = (select auth.uid())),
         exists (select 1 from public.dispensas d where d.anuncio_id = a.id and d.perfil_id = (select auth.uid())
                    and d.criado_em > now() - interval '30 days')
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
   where a.tipo = 'vaga'
     and a.status = 'ativo'
     and a.candidatura = 'publike'
     and a.expira_em > now()
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
     and a.autor_id is distinct from (select auth.uid())
     and ((select auth.uid()) is null or not privado.ha_bloqueio((select auth.uid()), a.autor_id))
   order by a.criado_em desc
   limit least(greatest(coalesce(p_limite, 300), 1), 500)
$$;

-- a vaga do site nunca é parada: os candidatos estão no site da empresa (a mesma de 20270423120000)
create or replace function privado.vaga_parada(p_anuncio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.anuncios a
                  where a.id = p_anuncio and a.criado_em < now() - interval '5 days'
                    and a.candidatura = 'publike'
                    and not exists (select 1 from public.curtidas c
                                     where c.anuncio_id = a.id and c.criado_em > now() - interval '5 days'))
$$;

-- ------------------------------------------------------------------ 5. a conferência do link

-- uma linha por vaga do site: quando o robô olhou e o que achou (fora da vaga: olhar não mexe na data dela)
create table if not exists privado.links_de_candidatura (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  conferido_em timestamptz not null default now(),
  -- o que fez a vaga sair do ar ('a página não existe mais', 'a vaga fechou na Gupy'...)
  problema text,
  -- falhas seguidas de rede (o site fora do ar): na terceira, olha de novo só no dia seguinte
  falhas smallint not null default 0
);
alter table privado.links_de_candidatura enable row level security;
revoke all on privado.links_de_candidatura from public, anon, authenticated;

-- As vagas do site no ar que o robô ainda não olhou nas últimas 20 horas (já marcadas como olhadas agora: duas
-- voltas juntas não olham a mesma).
create or replace function public.servidor_links_para_conferir(p_chave text, p_limite integer default 5)
returns table (anuncio_id uuid, link text, titulo text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_servidor(p_chave);
  return query
    with escolhidas as (
      select a.id, a.link_candidatura, a.titulo
        from public.anuncios a
        left join privado.links_de_candidatura l on l.anuncio_id = a.id
       where a.candidatura = 'site' and a.status = 'ativo' and a.expira_em > now()
         and (l.conferido_em is null or l.conferido_em < now() - interval '20 hours')
       order by l.conferido_em nulls first
       limit least(greatest(coalesce(p_limite, 5), 1), 20)
    ), marcadas as (
      insert into privado.links_de_candidatura as l (anuncio_id, conferido_em)
      select e.id, now() from escolhidas e
      on conflict (anuncio_id) do update set conferido_em = now()
      returning l.anuncio_id
    )
    select e.id, e.link_candidatura, e.titulo from escolhidas e join marcadas m on m.anuncio_id = e.id;
end
$$;

-- O que o robô achou: 'aberta' (tudo certo), 'fechada' (a vaga sai do ar, com o motivo) ou 'falhou' (rede: tenta de
-- novo na próxima volta, até 3 vezes; depois, amanhã).
create or replace function public.servidor_link_conferido(p_chave text, p_anuncio uuid, p_situacao text, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if p_situacao = 'aberta' then
    update privado.links_de_candidatura set problema = null, falhas = 0 where anuncio_id = p_anuncio;
  elsif p_situacao = 'fechada' then
    update privado.links_de_candidatura set problema = left(coalesce(p_motivo, 'o link não abre mais'), 200), falhas = 0
     where anuncio_id = p_anuncio;
    update public.anuncios set status = 'encerrado'
     where id = p_anuncio and candidatura = 'site' and status = 'ativo';
  elsif p_situacao = 'falhou' then
    update privado.links_de_candidatura
       set falhas = falhas + 1,
           -- até a terceira falha seguida, a próxima volta tenta de novo
           conferido_em = case when falhas + 1 < 3 then now() - interval '21 hours' else now() end
     where anuncio_id = p_anuncio;
  end if;
end
$$;

revoke execute on function public.servidor_links_para_conferir(text, integer),
  public.servidor_link_conferido(text, uuid, text, text) from public;
grant execute on function public.servidor_links_para_conferir(text, integer),
  public.servidor_link_conferido(text, uuid, text, text) to anon, authenticated, service_role;

-- ------------------------------------------------------------------ 6. os alertas do sistema

create table if not exists privado.alertas_do_sistema (
  chave text primary key check (chave ~ '^[a-z0-9_]{3,60}$'),
  titulo text not null,
  detalhe text,
  desde timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  vezes integer not null default 1,
  resolvido_em timestamptz
);
alter table privado.alertas_do_sistema enable row level security;
revoke all on privado.alertas_do_sistema from public, anon, authenticated;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('aviso_sistema', 'equipe', 62, 'Algo de fora mudou',
     'Aviso para a equipe quando uma peça de fora muda e o Publike deixa de entender, como a página de vagas da Gupy. Vem só na primeira vez, até voltar a funcionar.',
     array['titulo', 'detalhe', 'link'],
     'Publike: {{titulo}}',
     '{{titulo}}.

{{detalhe}}

Este aviso vem uma vez só. Se voltar a funcionar e quebrar de novo, ele vem de novo.',
     'Abrir o admin')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- Algo de fora parou de funcionar. true: começou agora (a equipe recebe o e-mail); false: já estava aberto.
create or replace function public.servidor_alerta(p_chave text, p_alerta text, p_titulo text, p_detalhe text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v privado.alertas_do_sistema;
  v_novo boolean := false;
begin
  perform privado.exigir_servidor(p_chave);
  select * into v from privado.alertas_do_sistema where chave = p_alerta for update;
  if not found then
    begin
      insert into privado.alertas_do_sistema (chave, titulo, detalhe)
      values (p_alerta, left(p_titulo, 200), left(p_detalhe, 1000));
      v_novo := true;
    exception when unique_violation then
      -- outra volta abriu no mesmo instante: ela avisa
      return false;
    end;
  elsif v.resolvido_em is not null then
    update privado.alertas_do_sistema
       set titulo = left(p_titulo, 200), detalhe = left(p_detalhe, 1000), desde = now(), ultima_vez = now(), vezes = 1,
           resolvido_em = null
     where chave = p_alerta;
    v_novo := true;
  else
    update privado.alertas_do_sistema
       set detalhe = left(p_detalhe, 1000), ultima_vez = now(), vezes = vezes + 1
     where chave = p_alerta;
  end if;
  if v_novo then
    perform privado.avisar_equipe('aviso_sistema', jsonb_build_object(
      'titulo', left(p_titulo, 200), 'detalhe', left(coalesce(p_detalhe, ''), 1000), 'caminho', '/admin'));
  end if;
  return v_novo;
end
$$;

-- Voltou a funcionar: o alerta fecha (e, se quebrar de novo, avisa de novo).
create or replace function public.servidor_alerta_resolvido(p_chave text, p_alerta text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.alertas_do_sistema set resolvido_em = now() where chave = p_alerta and resolvido_em is null;
end
$$;

-- O Painel do admin ("Precisa de você"): os alertas abertos.
create or replace function public.admin_alertas_do_sistema()
returns table (chave text, titulo text, detalhe text, desde timestamptz, ultima_vez timestamptz, vezes integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not privado.eh_admin() then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return query
    select a.chave, a.titulo, a.detalhe, a.desde, a.ultima_vez, a.vezes
      from privado.alertas_do_sistema a
     where a.resolvido_em is null
     order by a.desde desc;
end
$$;

revoke execute on function public.servidor_alerta(text, text, text, text), public.servidor_alerta_resolvido(text, text),
  public.admin_alertas_do_sistema() from public;
grant execute on function public.servidor_alerta(text, text, text, text), public.servidor_alerta_resolvido(text, text)
  to anon, authenticated, service_role;
grant execute on function public.admin_alertas_do_sistema() to authenticated, service_role;

notify pgrst, 'reload schema';
