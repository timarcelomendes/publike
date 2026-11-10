-- "Mais recentes" pela data, sem agrupar por perto (10/11/2026, pedido do Marcelo). Rode depois de
-- 20270412120000_prazo_para_mudar_de_faixa.sql. Pode rodar de novo.
-- Antes, a ordem "recentes" vinha primeiro pela prioridade (mesmo bairro, região, cidade, o resto) e só depois pela
-- data, e na vitrine uma vaga de 1 hora atrás aparecia depois de vagas de 6 e 13 dias. Agora, em "recentes", a data
-- vem antes da prioridade: a mais nova primeiro, em qualquer lugar dentro do raio. As outras ordens não mudam.
-- O corpo é o de 20270112120000_busca_sem_postgis.sql, com só essa linha a mais nos dois "order by".

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
               a.oficio, a.fotos, a.busca, a.atende,
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
       case when p_ordem = 'recentes' then x.criado_em end desc nulls last,
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
     case when p_ordem = 'recentes' then x.criado_em end desc nulls last,
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
