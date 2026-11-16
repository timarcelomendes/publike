-- A Rota do currículo sem esperar (16/11/2026): com a função comum ("vendedor") e 5 km, lugares_da_rota levava 6 s,
-- porque media a distância exata (no elipsoide) de cada um dos 7 mil lugares do raio antes de pegar os mais perto, e o
-- site desistia ("Nenhum lugar"). Agora ordena pela distância rápida (o operador <->, na esfera), pega os mais perto e
-- só neles mede a distância exata: 0,2 s, com o mesmo resultado e o mesmo total. Pode rodar de novo.

create or replace function public.lugares_da_rota(
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
  v_limite integer := least(greatest(coalesce(p_limite, 60), 1), case when auth.uid() is null then 30 else 100 end);
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
    select a.l_cnpj, a.l_nome, r.nome, a.l_cnae, concat_ws(', ', a.l_logradouro, a.l_numero), a.l_bairro, a.l_cidade,
           extensions.st_y(a.l_local::extensions.geometry), extensions.st_x(a.l_local::extensions.geometry),
           round(extensions.st_distance(a.l_local, v_ponto))::integer,
           a.l_aberta, (a.l_basico = any(v_publike)), a.l_total
      from (
        -- os mais perto pela distância rápida; o total do raio vem junto
        select e.cnpj as l_cnpj, e.nome as l_nome, e.cnae as l_cnae, e.logradouro as l_logradouro,
               e.numero as l_numero, e.bairro as l_bairro, e.cidade as l_cidade, e.local as l_local,
               e.data_abertura as l_aberta, e.cnpj_basico as l_basico, (count(*) over ())::integer as l_total,
               e.local operator(extensions.<->) v_ponto as l_perto
          from privado.empresas_receita e
         where e.cnae = any(v_cnaes) and e.situacao = 'ativa' and not e.mei
           and not (coalesce(e.natureza, '') = '2135' and e.razao_social is null and (e.nome = 'Empresa sem nome' or exists (select 1 from privado.ramos_do_publike rr where rr.cnae = e.cnae and rr.nome = e.nome)))
           and e.local is not null
           and extensions.st_dwithin(e.local, v_ponto, v_raio * 1000)
         order by l_perto, e.nome
         limit v_limite
      ) a
      left join privado.ramos_do_publike r on r.cnae = a.l_cnae
     order by a.l_perto, a.l_nome;
end
$$;

notify pgrst, 'reload schema';
