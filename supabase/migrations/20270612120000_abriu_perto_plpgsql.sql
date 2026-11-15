-- "Abriu perto" ainda lento dentro da função (6 s; a mesma consulta solta leva 90 ms): a função em SQL puro, com
-- security definer, não é aberta pelo planejador e ficava com um plano ruim. Agora em plpgsql: a data de referência e os
-- ramos vão para variáveis antes, e a consulta usa os valores. Pode rodar de novo.

create or replace function privado.abriu_perto(
  p_lat double precision, p_lng double precision, p_cbos text[], p_dias integer, p_raio_km numeric, p_limite integer
)
returns table (cnpj text, nome text, ramo text, bairro text, cidade text, abertura date, distancia_m integer, cbo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ponto extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  v_desde date := privado.ultima_abertura() - least(greatest(coalesce(p_dias, 30), 1), 120);
  v_raio double precision := least(greatest(coalesce(p_raio_km, 3), 0.5), 10) * 1000;
  v_cnaes text[];
  v_cbos text[];
begin
  -- de cada função, os ramos onde ela pesa (até 8); o ramo fica com a função que mais contrata nele
  select array_agg(x.cnae order by x.cnae), array_agg(x.cbo order by x.cnae)
    into v_cnaes, v_cbos
    from (select distinct on (r.cnae) r.cnae, c.cbo
            from unnest(p_cbos) as c(cbo)
            cross join lateral privado.ramos_da_funcao(c.cbo, 8) r
           order by r.cnae, r.contratacoes desc) x;
  if v_cnaes is null then
    return;
  end if;
  return query
    select e.cnpj, e.nome, r2.nome, e.bairro, e.cidade, e.data_abertura,
           round(extensions.st_distance(e.local, v_ponto))::integer,
           v_cbos[array_position(v_cnaes, e.cnae)]
      from privado.empresas_receita e
      left join privado.ramos_do_publike r2 on r2.cnae = e.cnae
     where e.situacao = 'ativa' and not e.mei and e.local is not null
       and e.data_abertura >= v_desde
       and e.cnae = any(v_cnaes)
       and extensions.st_dwithin(e.local, v_ponto, v_raio)
     order by e.data_abertura desc, extensions.st_distance(e.local, v_ponto)
     limit least(greatest(coalesce(p_limite, 3), 1), 10);
end
$$;
revoke all on function privado.abriu_perto(double precision, double precision, text[], integer, numeric, integer) from public;

notify pgrst, 'reload schema';
