-- Busca com prioridade para perto de casa: primeiro os anúncios do bairro
-- da pessoa, depois os da região dela (em Goiânia), depois os da cidade e,
-- por fim, o resto. Dentro de cada grupo, a ordem de sempre (mais perto ou
-- mais recentes).
--
-- Os parâmetros novos têm valor padrão, então o site antigo continua
-- funcionando durante a troca (chama sem eles e recebe a ordem de antes).

-- Chave de comparação de bairro: sem acento, minúscula e sem "Setor",
-- "Residencial" etc. no começo. É a mesma regra de chaveBairro (src/lib/regioes.ts).
create or replace function public.chave_bairro(texto text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(
           lower(public.sem_acento(btrim(texto))),
           '^(setor|st\.?|bairro|residencial|res\.?|conjunto|loteamento|vila)\s+', ''),
           '[^a-z0-9 ]', ' ', 'g'),
           '\s+', ' ', 'g'))
$$;

grant execute on function public.chave_bairro(text) to anon, authenticated;

-- A assinatura muda (parâmetros e a coluna "prioridade"), então troca a função.
drop function if exists public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer
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
  p_bairros_regiao text[] default null
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
  prioridade integer
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
           coalesce(p_bairros_regiao, '{}') as regiao
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
             when h.cidade is null or a.cidade <> h.cidade then 3
             when h.bairro is not null and public.chave_bairro(a.bairro) = h.bairro then 0
             when public.chave_bairro(a.bairro) = any (h.regiao) then 1
             else 2
           end as prioridade
      from public.anuncios a
      cross join ref
      cross join consulta q
      cross join casa h
      join public.perfis p on p.id = a.autor_id
      left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
     where a.status = 'ativo'
       and a.expira_em > now()
       and (p.suspenso_ate is null or p.suspenso_ate <= now())
       and st_dwithin(a.local, ref.ponto, least(greatest(p_raio_km, 1), 100) * 1000)
       and (p_tipo is null or a.tipo = p_tipo)
       and (p_categoria is null or a.categoria = p_categoria)
       and (p_regime is null or a.regime = p_regime)
       and (q.texto is null
            or a.busca @@ q.tsq
            or public.sem_acento(a.titulo) ilike '%' || public.sem_acento(q.texto) || '%')
  )
  select x.id, x.tipo, x.titulo, x.categoria, x.regime,
         x.pagamento_valor, x.pagamento_unidade, x.beneficios,
         x.cidade, x.bairro, x.lat, x.lng,
         round((x.distancia_m / 1000)::numeric, 1)::double precision,
         x.criado_em, x.autor_id, x.autor_nome, x.autor_tipo, x.autor_verificado,
         x.minha_curtida, x.prioridade
    from achados x
   order by
     x.prioridade,
     case when p_ordem = 'recentes' then x.criado_em end desc nulls last,
     x.distancia_m,
     x.criado_em desc
   limit least(greatest(p_limite, 1), 200)
$$;

revoke all on function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[]
) from public;
grant execute on function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[]
) to anon, authenticated;

notify pgrst, 'reload schema';
