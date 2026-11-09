-- Telas do Admin e quem vê cada uma (09/11/2026). Uma lista das telas do Admin com a marca "Somente publike.org":
-- a tela marcada só abre, no site no ar, para as contas da equipe (e-mail de login @publike.org confirmado e
-- liberado em Admin › Moderadores › Painel no site). O moderador vê as telas sem a marca. O admin do computador do
-- dono continua vendo tudo. Uma tela só abre no site quando o código dela já funciona sem a chave secreta (as outras
-- seguem só no computador do dono, com a marca ou sem). Pode rodar de novo.

create table if not exists privado.telas_do_admin (
  rota text primary key check (rota ~ '^/admin(/[a-z0-9-]+)*$'),
  somente_publike boolean not null default true,
  mudado_em timestamptz not null default now()
);
alter table privado.telas_do_admin enable row level security;

-- Começa como hoje: a moderação (Números, Denúncias, Anúncios, Curtidas e Vagas do dia) aberta ao moderador; o
-- resto, só a equipe publike.org. Tela nova que não estiver aqui conta como marcada.
insert into privado.telas_do_admin (rota, somente_publike)
values
  ('/admin', true),
  ('/admin/numeros', false),
  ('/admin/usuarios', true),
  ('/admin/empresas', true),
  ('/admin/convites', true),
  ('/admin/moderadores', true),
  ('/admin/testadores', true),
  ('/admin/anuncios', false),
  ('/admin/curtidas', false),
  ('/admin/matches', true),
  ('/admin/esperando', true),
  ('/admin/vagas-paradas', true),
  ('/admin/retorno', true),
  ('/admin/salarios', true),
  ('/admin/denuncias', false),
  ('/admin/testes', true),
  ('/admin/falhas', true),
  ('/admin/sugestoes', true),
  ('/admin/emails', true),
  ('/admin/comunicados', true),
  ('/admin/novidades', true),
  ('/admin/noticias', true),
  ('/admin/vagas-do-dia', false),
  ('/admin/campanhas', true),
  ('/admin/banners', true),
  ('/admin/pagamentos', true),
  ('/admin/ia', true),
  ('/admin/chaves', true),
  ('/admin/telas', true)
on conflict (rota) do nothing;

-- a equipe publike.org: a mesma regra do Painel no site (liberada, e-mail @publike.org confirmado, conferido a cada vez)
create or replace function privado.equipe_publike()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.pode_ver_painel_no_site()
$$;

-- As telas que a pessoa que entrou pode ver pela marca: a equipe publike.org, todas; o moderador, as sem a marca.
-- (O que cada tela mostra continua conferido pelas funções dela.)
create or replace function public.minhas_telas_do_admin()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select t.rota
    from privado.telas_do_admin t
   where privado.equipe_publike()
      or (not t.somente_publike and public.eh_moderador())
   order by t.rota
$$;

revoke execute on function public.minhas_telas_do_admin() from public, anon;
grant execute on function public.minhas_telas_do_admin() to authenticated, service_role;

-- A lista com as marcas: o admin (computador do dono) e a equipe publike.org
create or replace function public.admin_telas_do_admin()
returns table (rota text, somente_publike boolean, mudado_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike vê as telas do admin.' using errcode = '42501';
  end if;
  return query select t.rota, t.somente_publike, t.mudado_em from privado.telas_do_admin t order by t.rota;
end
$$;

-- Marcar ou desmarcar "Somente publike.org". A própria lista das telas fica sempre marcada.
create or replace function public.admin_marcar_tela(p_rota text, p_somente boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike muda quem vê as telas.' using errcode = '42501';
  end if;
  if p_rota is null or p_rota !~ '^/admin(/[a-z0-9-]+)*$' then
    raise exception 'Tela desconhecida.' using errcode = '22023';
  end if;
  if p_rota = '/admin/telas' and not coalesce(p_somente, true) then
    raise exception 'A lista das telas fica só com a equipe publike.org.' using errcode = '22023';
  end if;
  insert into privado.telas_do_admin as t (rota, somente_publike, mudado_em)
  values (p_rota, coalesce(p_somente, true), now())
  on conflict (rota) do update set somente_publike = excluded.somente_publike, mudado_em = now();
end
$$;

revoke execute on function public.admin_telas_do_admin(), public.admin_marcar_tela(text, boolean) from public, anon;
grant execute on function public.admin_telas_do_admin(), public.admin_marcar_tela(text, boolean)
  to authenticated, service_role;
