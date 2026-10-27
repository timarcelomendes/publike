-- Admin › Conta (27/10/2026): o aparelho do último acesso. O site guarda o navegador da conta ao abrir uma
-- página (no máximo a cada 6 horas por aparelho, pelo proxy) e se veio do app Android. Sem esse registro
-- (contas que não voltaram desde então), vale o navegador da sessão mais recente (auth.sessions), menos as
-- criadas pelo servidor ("node"). O admin mostra só o tipo (celular Android, iPhone, computador...), sem IP.
-- Pode rodar de novo.

create table if not exists privado.aparelho_da_conta (
  conta_id uuid primary key references auth.users (id) on delete cascade,
  navegador text not null,
  app boolean not null default false,
  visto_em timestamptz not null default now()
);
alter table privado.aparelho_da_conta enable row level security;

-- quem entrou: o navegador deste acesso (e se é o app Android)
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
end
$$;
revoke execute on function public.marcar_aparelho(text, boolean) from public, anon;
grant execute on function public.marcar_aparelho(text, boolean) to authenticated;

create or replace function public.admin_aparelho_do_usuario(p_usuario uuid)
returns table (navegador text, app boolean, quando timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  -- o registro do site vem antes: a sessão guarda só o navegador de quando entrou
  select x.navegador, x.app, x.quando from (
    select 1 as ordem, a.navegador, a.app, a.visto_em as quando
      from privado.aparelho_da_conta a
     where a.conta_id = p_usuario
    union all
    (select 2, s.user_agent, false,
            coalesce(s.refreshed_at at time zone 'UTC', s.updated_at, s.created_at)
       from auth.sessions s
      where s.user_id = p_usuario and coalesce(s.user_agent, '') <> '' and s.user_agent !~* '^node'
      order by 4 desc
      limit 1)
  ) x
  order by x.ordem
  limit 1
$$;
revoke execute on function public.admin_aparelho_do_usuario(uuid) from public, anon, authenticated;
grant execute on function public.admin_aparelho_do_usuario(uuid) to service_role;
