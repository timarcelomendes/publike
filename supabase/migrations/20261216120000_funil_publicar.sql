-- Os números do publicar em passos (claude/plano-publicar-em-passos.md, "Depois"): quantas vezes cada passo
-- abriu, por dia, e quantas vagas saíram por ele (o passo 6). Só a contagem: sem conta, sem aparelho, sem
-- nada que diga quem foi. O admin vê o funil dos últimos dias (onde a pessoa desiste).
-- Rode depois de 20261215120000_experimentar.sql.

create table if not exists privado.funil_publicar (
  dia date not null,
  -- 1 A vaga, 2 Pagamento e horário, 3 Onde, 4 Mais detalhes, 5 Publicar, 6 publicou
  passo smallint not null check (passo between 1 and 6),
  total integer not null default 0 check (total >= 0),
  primary key (dia, passo)
);

alter table privado.funil_publicar enable row level security;
revoke all on privado.funil_publicar from public, anon, authenticated;

-- o site soma 1 quando um passo abre pela primeira vez na página (e 6 quando a vaga sai)
create or replace function public.registrar_passo_publicar(p_passo integer)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into privado.funil_publicar (dia, passo, total)
  select (now() at time zone 'America/Sao_Paulo')::date, p_passo::smallint, 1
   where p_passo between 1 and 6
  on conflict (dia, passo) do update set total = privado.funil_publicar.total + 1;
$$;

revoke all on function public.registrar_passo_publicar(integer) from public;
grant execute on function public.registrar_passo_publicar(integer) to anon, authenticated;

-- o funil para o admin: a soma de cada passo nos últimos `p_dias` dias (hoje incluído)
create or replace function public.admin_funil_publicar(p_dias integer default 30)
returns table (passo smallint, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select f.passo, sum(f.total)::bigint
    from privado.funil_publicar f
   where f.dia > (now() at time zone 'America/Sao_Paulo')::date - greatest(1, least(coalesce(p_dias, 30), 365))
   group by f.passo
   order by f.passo;
$$;

revoke all on function public.admin_funil_publicar(integer) from public, anon, authenticated;
grant execute on function public.admin_funil_publicar(integer) to service_role;

notify pgrst, 'reload schema';
