-- A Rota do currículo com o mapa no alto (16/11/2026, Marcelo: "não está carregando ninguém, mas quero essa
-- funcionalidade mais estratégica e que as pessoas vejam o mapa de cara"). lugares_da_rota passa a dizer também:
--   * total: quantos lugares há no raio (a lista continua até 30 sem conta e até 100 com conta);
--   * aberta_em: a data de abertura na Receita (o selo "Lugar novo", aberto há até 12 meses);
--   * no_publike: a empresa (o mesmo CNPJ básico) tem conta no Publike, e o "Quero trabalhar aqui" avisa direto.
-- O resultado muda de forma, então a função é apagada e criada de novo. Os filtros e a velocidade são os de
-- 20270618120000. Pode rodar de novo.

drop function if exists public.lugares_da_rota(text, double precision, double precision, numeric, integer);

create function public.lugares_da_rota(
  p_cbo text, p_lat double precision, p_lng double precision, p_raio_km numeric default 2, p_limite integer default 60
)
returns table (
  cnpj text, nome text, ramo text, cnae text, endereco text, bairro text, cidade text,
  lat double precision, lng double precision, distancia_m integer,
  aberta_em date, no_publike boolean, total integer
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
  v_publike text[];
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
  -- as empresas com conta no Publike, pelo CNPJ básico (a matriz e as filiais), como o "Quero trabalhar aqui"
  select coalesce(array_agg(distinct left(p.cnpj, 8)), '{}') into v_publike
    from public.perfis p
   where p.cnpj is not null;
  return query
    with achados as (
      select e.cnpj as l_cnpj, e.nome as l_nome, r.nome as l_ramo, e.cnae as l_cnae,
             concat_ws(', ', e.logradouro, e.numero) as l_endereco, e.bairro as l_bairro, e.cidade as l_cidade,
             extensions.st_y(e.local::extensions.geometry) as l_lat, extensions.st_x(e.local::extensions.geometry) as l_lng,
             round(extensions.st_distance(e.local, v_ponto))::integer as l_distancia,
             e.data_abertura as l_aberta, (e.cnpj_basico = any(v_publike)) as l_publike
        from privado.empresas_receita e
        left join privado.ramos_do_publike r on r.cnae = e.cnae
       where e.cnae = any(v_cnaes) and e.situacao = 'ativa' and not e.mei
         and not (coalesce(e.natureza, '') = '2135' and e.razao_social is null and (e.nome = 'Empresa sem nome' or exists (select 1 from privado.ramos_do_publike rr where rr.cnae = e.cnae and rr.nome = e.nome)))
         and e.local is not null
         and extensions.st_dwithin(e.local, v_ponto, v_raio * 1000)
    )
    select a.l_cnpj, a.l_nome, a.l_ramo, a.l_cnae, a.l_endereco, a.l_bairro, a.l_cidade, a.l_lat, a.l_lng,
           a.l_distancia, a.l_aberta, a.l_publike, (count(*) over ())::integer
      from achados a
     order by a.l_distancia, a.l_nome
     limit least(greatest(coalesce(p_limite, 60), 1), case when auth.uid() is null then 30 else 100 end);
end
$$;

revoke execute on function public.lugares_da_rota(text, double precision, double precision, numeric, integer) from public;
grant execute on function public.lugares_da_rota(text, double precision, double precision, numeric, integer)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
