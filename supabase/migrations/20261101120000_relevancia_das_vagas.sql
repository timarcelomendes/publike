-- Vagas curtidas sobem na linha do tempo, e a ordem "Mais relevantes" (01/11/2026). Pode rodar de novo.
--
-- 1. Quantas vezes cada anúncio foi aberto: uma por visitante por dia, sem guardar quem. Como em
--    contar_acesso, o IP e o navegador viram um código com o sorteio do dia (apagado no dia
--    seguinte), então nem o banco sabe de quem era. Guarda 30 dias.
-- 2. curtidas_das_vagas devolve todas as vagas com curtida (a hora da última, para subirem na
--    linha), mas o número só a partir de 3 (com 1 ou 2, quem conhece a vaga poderia adivinhar).
-- 3. buscar_anuncios ganha duas ordens: "ultimas" (a vaga vale pela hora mais nova entre a
--    publicação e a última curtida; é a da linha do tempo) e "relevantes" (mais curtidas e mais
--    aberturas nos últimos 30 dias: cada curtida vale 5 aberturas).

-- 1. as aberturas
create table if not exists privado.aberturas_anuncio (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  dia date not null,
  visitante bytea not null,
  primary key (anuncio_id, dia, visitante)
);
create index if not exists aberturas_anuncio_dia_idx on privado.aberturas_anuncio (dia);
alter table privado.aberturas_anuncio enable row level security;
revoke all on table privado.aberturas_anuncio from public, anon, authenticated;

create or replace function public.contar_abertura(p_anuncio uuid, p_ip text, p_navegador text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  s text;
begin
  if p_anuncio is null or coalesce(p_ip, '') = '' or length(p_ip) > 64 then
    return;
  end if;
  -- só anúncio no ar, e quem publicou (ou a equipe da agência) não conta
  if not exists (
    select 1 from public.anuncios a
     where a.id = p_anuncio and a.status = 'ativo'
       and a.autor_id is distinct from public.conta_atual()
  ) then
    return;
  end if;
  insert into privado.sorteio_acessos (dia) values (hoje) on conflict (dia) do nothing;
  select a.sorteio into s from privado.sorteio_acessos a where a.dia = hoje;
  -- trava contra enxurrada num anúncio só
  if (select count(*) from privado.aberturas_anuncio b where b.anuncio_id = p_anuncio and b.dia = hoje) >= 5000 then
    return;
  end if;
  insert into privado.aberturas_anuncio (anuncio_id, dia, visitante)
  values (p_anuncio, hoje, sha256(convert_to(s || '|' || p_ip || '|' || left(coalesce(p_navegador, ''), 300), 'UTF8')))
  on conflict do nothing;
  -- de vez em quando, tira o que passou de 30 dias
  if random() < 0.01 then
    delete from privado.aberturas_anuncio b where b.dia < hoje - 30;
  end if;
end
$$;
revoke execute on function public.contar_abertura(uuid, text, text) from public;
grant execute on function public.contar_abertura(uuid, text, text) to anon, authenticated;

-- a hora da última curtida e os pontos de cada anúncio (para a ordem da busca, que roda com o papel de
-- quem busca e não lê as curtidas dos outros): só o que a ordem precisa, nunca quem
create or replace function privado.ultima_curtida(p_anuncio uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(c.criado_em) from public.curtidas c where c.anuncio_id = p_anuncio
$$;

create or replace function privado.pontos_do_anuncio(p_anuncio uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.curtidas c
           where c.anuncio_id = p_anuncio and c.criado_em > now() - interval '30 days')::integer * 5
       + (select count(*) from privado.aberturas_anuncio b
           where b.anuncio_id = p_anuncio
             and b.dia > (now() at time zone 'America/Sao_Paulo')::date - 30)::integer
$$;

grant usage on schema privado to anon;
revoke execute on function privado.ultima_curtida(uuid) from public;
revoke execute on function privado.pontos_do_anuncio(uuid) from public;
grant execute on function privado.ultima_curtida(uuid) to anon, authenticated;
grant execute on function privado.pontos_do_anuncio(uuid) to anon, authenticated;

-- 2. as curtidas das vagas: todas com curtida; o número só a partir de 3
create or replace function public.curtidas_das_vagas(p_ids uuid[])
returns table (anuncio_id uuid, curtidas integer, ultima timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.anuncio_id,
         case when count(*) >= 3 then count(*)::integer end as curtidas,
         max(c.criado_em) as ultima
  from public.curtidas c
  join public.anuncios a on a.id = c.anuncio_id
  where c.anuncio_id = any ((coalesce(p_ids, '{}'::uuid[]))[1:200])
    and a.tipo = 'vaga'
    and a.status = 'ativo'
    and a.preenchida_em is null
    and (a.expira_em is null or a.expira_em > now())
  group by c.anuncio_id
$$;

revoke execute on function public.curtidas_das_vagas(uuid[]) from public;
grant execute on function public.curtidas_das_vagas(uuid[]) to anon, authenticated;

-- 3. a busca, com as ordens "ultimas" e "relevantes" (o resto igual a 20261026120000_busca_por_relevancia)
create or replace function public.buscar_anuncios(
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
  comissao boolean
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
    select a.*, p.nome as p_nome, p.tipo as p_tipo, p.verificado as p_verificado,
           st_distance(a.local, ref.ponto) as distancia_m,
           lower(public.sem_acento(a.titulo)) as titulo_norma
      from public.anuncios a
      cross join ref
      cross join casa h
      join public.perfis p on p.id = a.autor_id
     where a.status = 'ativo'
       and a.expira_em > now()
       and (p.suspenso_ate is null or p.suspenso_ate <= now())
       and (st_dwithin(a.local, ref.ponto, least(greatest(p_raio_km, 1), 100) * 1000)
            or (a.tipo = 'servico' and h.cidade is not null
                and (h.cidade = any (a.atende) or h.area = any (a.atende))))
       and (p_tipo is null or a.tipo = p_tipo)
       and (p_categoria is null or a.categoria = p_categoria)
       and (p_regime is null or a.regime = p_regime)
  ),
  achados as (
    select a.id, a.tipo, a.titulo, a.categoria, a.regime,
           a.pagamento_valor, a.pagamento_unidade, a.beneficios, a.pagamento_ate, a.comissao,
           a.cidade, a.bairro,
           round(st_y(a.local::geometry)::numeric, 5)::double precision as lat,
           round(st_x(a.local::geometry)::numeric, 5)::double precision as lng,
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
           a.fotos[1] as foto
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
           case when p_ordem = 'relevantes' then privado.pontos_do_anuncio(x.id) else 0 end as pontos
      from achados x
  ),
  escolhidos as (
    select * from medidos x
     order by
       case when p_ordem in ('recentes', 'ultimas') then 0 else x.relevancia end desc,
       x.pontos desc,
       case when p_ordem = 'ultimas' then x.atividade end desc nulls last,
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
         n.media, coalesce(n.total, 0), x.pagamento_ate, x.comissao
    from escolhidos x
    left join lateral (
      select * from public.nota_do_profissional(x.autor_id) where x.tipo = 'servico'
    ) n on true
   order by
     case when p_ordem in ('recentes', 'ultimas') then 0 else x.relevancia end desc,
     x.pontos desc,
     case when p_ordem = 'ultimas' then x.atividade end desc nulls last,
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
