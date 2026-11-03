-- O funil de quem chega sem conta (claude/plano-home-visitante.md, "Como medir"; 02/11/2026): quantas vezes a home
-- de quem não entrou abriu e quantas vezes tocaram em Curtir, Publicar, Currículo e Entrar nela, por dia. Só a
-- contagem: sem conta, sem aparelho, sem nada que diga quem foi. O admin vê, junto, quantas contas nasceram no
-- período e quantas delas já curtiram uma vaga ou publicaram um anúncio. Pode rodar de novo.
-- Rode depois de 20270123120000_banners_destaque.sql.

create table if not exists privado.funil_visitante (
  dia date not null,
  evento text not null check (evento in ('home', 'curtir', 'publicar', 'curriculo', 'entrar')),
  total integer not null default 0 check (total >= 0),
  primary key (dia, evento)
);

alter table privado.funil_visitante enable row level security;
revoke all on privado.funil_visitante from public, anon, authenticated;

-- o site soma 1: a home abriu, ou tocaram num dos botões dela
create or replace function public.registrar_funil_visitante(p_evento text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into privado.funil_visitante (dia, evento, total)
  select (now() at time zone 'America/Sao_Paulo')::date, p_evento, 1
   where p_evento in ('home', 'curtir', 'publicar', 'curriculo', 'entrar')
  on conflict (dia, evento) do update set total = privado.funil_visitante.total + 1;
$$;

revoke all on function public.registrar_funil_visitante(text) from public;
grant execute on function public.registrar_funil_visitante(text) to anon, authenticated;

-- o funil para o admin, nos últimos `p_dias` dias (hoje incluído): os eventos da home e, das contas criadas no
-- período, quantas são e quantas já curtiram (ou pediram um serviço) e quantas publicaram
create or replace function public.admin_funil_visitante(p_dias integer default 7)
returns table (etapa text, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with periodo as (
    select (now() at time zone 'America/Sao_Paulo')::date - greatest(1, least(coalesce(p_dias, 7), 365)) as antes
  ),
  novas as (
    select p.id from public.perfis p, periodo
     where (p.criado_em at time zone 'America/Sao_Paulo')::date > periodo.antes
  )
  select f.evento, sum(f.total)::bigint
    from privado.funil_visitante f, periodo
   where f.dia > periodo.antes
   group by f.evento
  union all
  select 'contas', count(*)::bigint from novas
  union all
  select 'curtiu', count(*)::bigint from novas n
   where exists (select 1 from public.curtidas c where c.perfil_id = n.id)
  union all
  select 'publicou', count(*)::bigint from novas n
   where exists (select 1 from public.anuncios a where a.autor_id = n.id);
$$;

revoke all on function public.admin_funil_visitante(integer) from public, anon, authenticated;
grant execute on function public.admin_funil_visitante(integer) to service_role;

notify pgrst, 'reload schema';
