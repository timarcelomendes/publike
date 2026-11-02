-- Quem já abriu o Publike pelo app Android (02/11/2026, pedido do usuário): o app só instala para quem aceitou o
-- teste fechado da Play, e a Play Console mostra só o total de testadores, sem dizer quem. O aparelho do último
-- acesso (privado.aparelho_da_conta) guarda só o último: quem abre pelo app e depois pelo navegador perde a marca.
-- Aqui fica a primeira e a última vez que a conta abriu pelo app, para o Admin listar quem está testando.
-- Pode rodar de novo. Rode depois de 20270118120000_novidades_do_publike.sql.

create table if not exists privado.contas_no_app (
  conta_id uuid primary key references auth.users (id) on delete cascade,
  primeiro_em timestamptz not null default now(),
  ultimo_em timestamptz not null default now(),
  vezes integer not null default 1
);
alter table privado.contas_no_app enable row level security;
revoke all on privado.contas_no_app from public, anon, authenticated;

-- quem já tem a marca do app no último acesso entra com a data dele
insert into privado.contas_no_app (conta_id, primeiro_em, ultimo_em)
select a.conta_id, a.visto_em, a.visto_em from privado.aparelho_da_conta a where a.app
on conflict (conta_id) do nothing;

-- o mesmo marcar_aparelho de 20261128120000, que agora também guarda a vez no app
create or replace function public.marcar_aparelho(p_navegador text, p_app boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(btrim(p_navegador), '') = '' then
    return;
  end if;
  insert into privado.aparelho_da_conta as a (conta_id, navegador, app, visto_em)
  values (auth.uid(), left(p_navegador, 400), coalesce(p_app, false), now())
  on conflict (conta_id) do update
    set navegador = excluded.navegador, app = excluded.app, visto_em = excluded.visto_em;
  if coalesce(p_app, false) then
    insert into privado.contas_no_app as c (conta_id) values (auth.uid())
    on conflict (conta_id) do update set ultimo_em = now(), vezes = c.vezes + 1;
  end if;
end
$$;
revoke execute on function public.marcar_aparelho(text, boolean) from public, anon;
grant execute on function public.marcar_aparelho(text, boolean) to authenticated;

-- Admin: as contas que já abriram pelo app, da mais nova para a mais antiga (com o e-mail, para conferir no grupo
-- dos testadores)
create or replace function public.admin_contas_no_app()
returns table (conta_id uuid, nome text, tipo text, email text, primeiro_em timestamptz, ultimo_em timestamptz, vezes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.conta_id, p.nome, p.tipo, u.email::text, c.primeiro_em, c.ultimo_em, c.vezes
    from privado.contas_no_app c
    join auth.users u on u.id = c.conta_id
    left join public.perfis p on p.id = c.conta_id
   order by c.primeiro_em desc
   limit 200
$$;
revoke execute on function public.admin_contas_no_app() from public, anon, authenticated;
grant execute on function public.admin_contas_no_app() to service_role;
