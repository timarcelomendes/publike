-- Busca por palavra mais justa ("mecânico"):
--   1. o que tem a palavra no título vem antes do que só a cita na descrição (antes, a ordem era só
--      a de perto: a assistência técnica com "mecânico" no texto vinha antes do "Mecânico de
--      automóveis");
--   2. aceita erro de digitação no título ("mecanio" acha "Mecânico"), com trigramas;
--   3. alguns ofícios valem uns pelos outros ("doméstica" acha "diarista", "motoboy" acha
--      "entregador").
-- Mesma assinatura e mesmo retorno de 20261015120000_vaga_completa.sql: o site publicado continua
-- chamando igual. "Mais recentes" continua do mais novo para o mais antigo (sem a relevância).

create extension if not exists pg_trgm with schema extensions;

-- 1. A consulta: cada palavra da busca (sem acento, minúscula) vale também pelos sinônimos dela;
-- as palavras entram juntas (E), como antes. Palavras vazias ("de", "para") o dicionário tira.
create or replace function public.consulta_da_busca(p_texto text)
returns tsquery
language sql
stable
parallel safe
set search_path = ''
as $$
  with palavras as (
    select p, ord
      from regexp_split_to_table(lower(public.sem_acento(coalesce(p_texto, ''))), '[^a-z0-9]+')
           with ordinality as t(p, ord)
     where length(p) >= 2
     limit 8
  ),
  -- grupos pequenos e seguros: ofícios que quem procura escreve de jeitos diferentes
  grupos(grupo, palavra) as (
    values
      (1, 'diarista'), (1, 'faxineira'), (1, 'faxineiro'), (1, 'faxina'), (1, 'domestica'),
      (1, 'domestico'), (1, 'limpeza'),
      (2, 'motorista'), (2, 'condutor'), (2, 'chofer'),
      (3, 'motoboy'), (3, 'motoqueiro'), (3, 'motofrete'), (3, 'entregador'), (3, 'entregadora'),
      (4, 'garcom'), (4, 'garconete'),
      (5, 'manicure'), (5, 'pedicure'), (5, 'manicuro'),
      (6, 'programador'), (6, 'programadora'), (6, 'desenvolvedor'), (6, 'desenvolvedora'),
      (7, 'jardineiro'), (7, 'jardineira'), (7, 'jardinagem'),
      (8, 'padeiro'), (8, 'padeira'), (8, 'panificacao'),
      (9, 'acougueiro'), (9, 'acougue'),
      (10, 'vigilante'), (10, 'vigia'),
      (11, 'estoquista'), (11, 'almoxarife'),
      (12, 'baba'), (12, 'babysitter')
  ),
  termos as (
    select p.ord, string_agg(distinct coalesce(g2.palavra, p.p), ' | ') as alternativas
      from palavras p
      left join grupos g1 on g1.palavra = p.p
      left join grupos g2 on g2.grupo = g1.grupo
     group by p.ord, p.p
  )
  select to_tsquery(
    'portuguese'::regconfig,
    coalesce((select string_agg('(' || alternativas || ')', ' & ' order by ord) from termos), '')
  )
$$;

revoke all on function public.consulta_da_busca(text) from public;
grant execute on function public.consulta_da_busca(text) to anon, authenticated;

-- 2. A busca: a relevância (3 = a frase inteira no título; 2 = as palavras no título, ou o título
-- parecido com a palavra digitada; 1 = só no texto ou no bairro) vem antes da ordem de perto.
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
  escolhidos as (
    select * from achados x
     order by
       case when p_ordem = 'recentes' then 0 else x.relevancia end desc,
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
     case when p_ordem = 'recentes' then 0 else x.relevancia end desc,
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
