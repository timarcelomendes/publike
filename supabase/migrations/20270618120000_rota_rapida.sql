-- Rota do currículo rápida (15/11/2026): lugares_da_rota levava até 25 s em produção (o site desistia e mostrava
-- "Nenhum lugar"), porque o banco não sabe quantos ramos a função tem e juntava os ramos com a base inteira.
-- Agora os ramos vão antes para uma lista e a busca usa o índice do ramo (0,3 s). O resultado é o mesmo.
-- Pode rodar de novo.

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
  v_cnaes text[];
begin
  -- sem conta também (para conhecer a rota): até 30 lugares; montar e imprimir pedem a conta
  if p_cbo !~ '^[0-9]{6}$' or p_lat is null or p_lng is null then
    return;
  end if;
  v_ponto := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  -- os ramos onde a função pesa (privado.ramos_da_funcao: sem escritório, agência e governo)
  select array_agg(r.cnae) into v_cnaes from privado.ramos_da_funcao(p_cbo, 12) r;
  if v_cnaes is null then
    return;
  end if;
  return query
    select e.cnpj, e.nome, r.nome, e.cnae, concat_ws(', ', e.logradouro, e.numero), e.bairro, e.cidade,
           extensions.st_y(e.local::extensions.geometry), extensions.st_x(e.local::extensions.geometry),
           round(extensions.st_distance(e.local, v_ponto))::integer
      from privado.empresas_receita e
      left join privado.ramos_do_publike r on r.cnae = e.cnae
     where e.cnae = any(v_cnaes) and e.situacao = 'ativa' and not e.mei
       and not (coalesce(e.natureza, '') = '2135' and e.razao_social is null and (e.nome = 'Empresa sem nome' or exists (select 1 from privado.ramos_do_publike rr where rr.cnae = e.cnae and rr.nome = e.nome)))
       and e.local is not null
       and extensions.st_dwithin(e.local, v_ponto, v_raio * 1000)
     order by extensions.st_distance(e.local, v_ponto), e.nome
     limit least(greatest(coalesce(p_limite, 60), 1), case when auth.uid() is null then 30 else 100 end);
end
$$;

notify pgrst, 'reload schema';
