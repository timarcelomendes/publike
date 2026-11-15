-- "Abriu perto de você" também para quem não deu o CEP de casa (15/11/2026, Marcelo: "não vi até agora"): o site manda
-- o ponto que tiver (o CEP de casa, o bairro escolhido neste aparelho ou o meio do bairro do perfil). Só para quem
-- entrou. Pode rodar de novo.

create or replace function public.abriu_perto_do_ponto(
  p_lat double precision, p_lng double precision, p_cbos text[], p_dias integer default 30, p_limite integer default 3
)
returns table (cnpj text, nome text, ramo text, bairro text, cidade text, abertura date, distancia_m integer, cbo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_lat is null or p_lng is null then
    return;
  end if;
  return query select * from privado.abriu_perto(p_lat, p_lng, p_cbos, p_dias, 3, p_limite);
end
$$;
revoke execute on function public.abriu_perto_do_ponto(double precision, double precision, text[], integer, integer) from public, anon;
grant execute on function public.abriu_perto_do_ponto(double precision, double precision, text[], integer, integer)
  to authenticated, service_role;

-- e as funções específicas (como Product Manager, que é pouco em cada ramo): além dos ramos onde a função pesa 5% ou
-- mais, entram os 3 ramos que mais a contratam (sempre fora agência, apoio de escritório e governo)
create or replace function privado.ramos_da_funcao(p_cbo text, p_limite integer default 12)
returns table (cnae text, contratacoes integer)
language sql
stable
security definer
set search_path = ''
as $$
  with tot as (select f.cnae, sum(f.contratacoes) as t from privado.ramos_funcoes f group by f.cnae),
  base as (
    select f.cnae, f.contratacoes, f.contratacoes::numeric / tot.t as peso,
           row_number() over (order by f.contratacoes desc) as n
      from privado.ramos_funcoes f
      join tot on tot.cnae = f.cnae
     where f.cbo = p_cbo and f.contratacoes >= 3 and f.cnae !~ '^(78|82|84)'
  )
  select b.cnae, b.contratacoes
    from base b
   where b.peso >= 0.05 or b.n <= 3
   order by b.contratacoes desc
   limit least(greatest(coalesce(p_limite, 12), 1), 20)
$$;
revoke all on function privado.ramos_da_funcao(text, integer) from public;

notify pgrst, 'reload schema';
