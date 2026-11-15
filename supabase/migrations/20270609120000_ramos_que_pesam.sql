-- A rota do currículo e o "Abriu perto" com os ramos certos (15/11/2026, Marcelo: "a rota do currículo não está
-- funcionando"). Na primeira carga de verdade, os ramos que "mais contratam" padeiro incluíam escritórios de serviços
-- combinados (8211-3/00) e de apoio administrativo (8219-9/99): são as empresas que registram gente para outras, e
-- isso enchia a rota de escritórios (3.892 lugares a 2 km do centro, para padeiro). Agora o ramo só entra quando a
-- função pesa nele (5% ou mais das contratações do ramo) e ficam de fora agências (78), apoio de escritório (82) e
-- governo (84). Pode rodar de novo.

create or replace function privado.ramos_da_funcao(p_cbo text, p_limite integer default 12)
returns table (cnae text, contratacoes integer)
language sql
stable
security definer
set search_path = ''
as $$
  with tot as (select f.cnae, sum(f.contratacoes) as t from privado.ramos_funcoes f group by f.cnae)
  select f.cnae, f.contratacoes
    from privado.ramos_funcoes f
    join tot on tot.cnae = f.cnae
   where f.cbo = p_cbo and f.contratacoes >= 3
     and f.cnae !~ '^(78|82|84)'
     and f.contratacoes::numeric / tot.t >= 0.05
   order by f.contratacoes desc
   limit least(greatest(coalesce(p_limite, 12), 1), 20)
$$;
revoke all on function privado.ramos_da_funcao(text, integer) from public;

create or replace function public.lugares_da_rota(
  p_cbo text, p_lat double precision, p_lng double precision, p_raio_km numeric default 2, p_limite integer default 60
)
returns table (
  cnpj text, nome text, ramo text, cnae text, endereco text, bairro text, cidade text,
  lat double precision, lng double precision, distancia_m integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raio numeric := least(greatest(coalesce(p_raio_km, 2), 0.5), 10);
  v_ponto extensions.geography;
begin
  if auth.uid() is null and not privado.eh_admin() then
    raise exception 'Entre para montar a rota.' using errcode = '42501';
  end if;
  if p_cbo !~ '^[0-9]{6}$' or p_lat is null or p_lng is null then
    return;
  end if;
  v_ponto := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  return query
    with ramos as (
      -- os ramos onde a função pesa (privado.ramos_da_funcao: sem escritório, agência e governo)
      select r.cnae from privado.ramos_da_funcao(p_cbo, 12) r
    )
    select e.cnpj, e.nome, r.nome, e.cnae, concat_ws(', ', e.logradouro, e.numero), e.bairro, e.cidade,
           extensions.st_y(e.local::extensions.geometry), extensions.st_x(e.local::extensions.geometry),
           round(extensions.st_distance(e.local, v_ponto))::integer
      from privado.empresas_receita e
      join ramos using (cnae)
      left join privado.ramos_do_publike r on r.cnae = e.cnae
     where e.situacao = 'ativa' and not e.mei and e.local is not null
       and extensions.st_dwithin(e.local, v_ponto, v_raio * 1000)
     order by extensions.st_distance(e.local, v_ponto), e.nome
     limit least(greatest(coalesce(p_limite, 60), 1), 100);
end
$$;

create or replace function privado.abriu_perto(
  p_lat double precision, p_lng double precision, p_cbos text[], p_dias integer, p_raio_km numeric, p_limite integer
)
returns table (cnpj text, nome text, ramo text, bairro text, cidade text, abertura date, distancia_m integer, cbo text)
language sql
stable
security definer
set search_path = ''
as $$
  with ponto as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  ), ramos as (
    -- de cada função, os ramos que mais a contratam (até 8)
    select distinct on (x.cnae) x.cnae, x.cbo
      from (select r.cnae, c.cbo, r.contratacoes
              from unnest(p_cbos) as c(cbo)
              cross join lateral privado.ramos_da_funcao(c.cbo, 8) r) x
     order by x.cnae, x.contratacoes desc
  )
  select e.cnpj, e.nome, r2.nome, e.bairro, e.cidade, e.data_abertura,
         round(extensions.st_distance(e.local, p.g))::integer, ramos.cbo
    from privado.empresas_receita e
    join ramos on ramos.cnae = e.cnae
    cross join ponto p
    left join privado.ramos_do_publike r2 on r2.cnae = e.cnae
   where e.situacao = 'ativa' and not e.mei and e.local is not null
     and e.data_abertura >= (now() at time zone 'America/Sao_Paulo')::date - least(greatest(p_dias, 1), 120)
     and extensions.st_dwithin(e.local, p.g, least(greatest(p_raio_km, 0.5), 10) * 1000)
   order by e.data_abertura desc, extensions.st_distance(e.local, p.g)
   limit least(greatest(coalesce(p_limite, 3), 1), 10)
$$;

notify pgrst, 'reload schema';
