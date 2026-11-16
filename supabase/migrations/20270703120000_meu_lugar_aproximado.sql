-- A distância do talento até quem contrata (16/11/2026, "senti falta da distância aproximada do talento x empresa /
-- vaga"): sem vaga no ar com lugar e sem a localização do aparelho, a conta conta do próprio lugar aproximado: o CEP de
-- casa guardado (casas) ou o centro do bairro do perfil (privado.centros_dos_bairros). Só o lugar da própria conta.

create or replace function public.meu_lugar_aproximado()
returns table (lat double precision, lng double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select x.lat, x.lng from (
    select extensions.st_y(c.local::extensions.geometry) as lat, extensions.st_x(c.local::extensions.geometry) as lng, 1 as ordem
      from public.casas c
     where c.perfil_id = (select public.conta_atual())
    union all
    select b.lat, b.lng, 2
      from public.perfis p
      join privado.centros_dos_bairros b
        on b.cidade = lower(public.sem_acento(p.cidade)) and b.bairro = privado.bairro_comparavel(p.bairro)
     where p.id = (select public.conta_atual())
  ) x
  order by x.ordem
  limit 1
$$;
revoke execute on function public.meu_lugar_aproximado() from public, anon;
grant execute on function public.meu_lugar_aproximado() to authenticated;

select privado.migracao_aplicada('20270703120000_meu_lugar_aproximado');
