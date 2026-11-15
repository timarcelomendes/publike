-- A Rota do currículo aberta para quem ainda não entrou (15/11/2026, Marcelo: "deixe a rota do currículo visível,
-- que o usuário acesse na home sem logar e veja sobre, gera interesse"). Quem visita escolhe a função e o bairro e vê
-- os lugares no mapa (até 30, só empresas da Receita, nunca MEI); montar a rota e imprimir pedem a conta.
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
begin
  -- sem conta também (para conhecer a rota): até 30 lugares; montar e imprimir pedem a conta
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
     limit least(greatest(coalesce(p_limite, 60), 1), case when auth.uid() is null then 30 else 100 end);
end
$$;
grant execute on function public.lugares_da_rota(text, double precision, double precision, numeric, integer) to anon;

notify pgrst, 'reload schema';
