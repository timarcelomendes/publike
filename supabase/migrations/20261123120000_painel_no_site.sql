-- Painel do admin no site publicado (27/10/2026): os números do Painel (sem nomes, sem mensagens e sem
-- botões) abrem em /equipe para as contas que o admin liberou no computador dele (Admin › Moderadores ›
-- Painel no site). Só conta com e-mail de login @publike.org confirmado pode ser liberada, e o banco confere
-- o domínio de novo a cada leitura. Pode rodar de novo.

create table if not exists privado.painel_no_site (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  liberado_em timestamptz not null default now()
);
alter table privado.painel_no_site enable row level security;

-- a pessoa que entrou (auth.uid(), não a conta pela qual age) está liberada e ainda tem o e-mail da equipe
create or replace function privado.pode_ver_painel_no_site()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from privado.painel_no_site p
      join auth.users u on u.id = p.usuario_id
     where p.usuario_id = auth.uid()
       and u.email_confirmed_at is not null
       and lower(u.email) like '%@publike.org'
  )
$$;

-- O admin continua sendo o service_role. A leitura do Painel no site (abaixo) liga, só dentro da própria
-- transação, o aviso "publike.painel_no_site", e ele só vale para quem está liberado.
create or replace function privado.eh_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or coalesce(current_setting('role', true), '') = 'service_role'
      or (coalesce(current_setting('publike.painel_no_site', true), '') = 'sim' and privado.pode_ver_painel_no_site())
$$;

-- para o site saber se mostra o Painel (e o /admin levar para lá)
create or replace function public.posso_ver_painel_no_site()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.pode_ver_painel_no_site()
$$;

-- os números do Painel, só leitura: os mesmos do admin (resumo, acessos, encerramentos) e os matches de hoje
create or replace function public.painel_no_site()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
  hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  if not privado.pode_ver_painel_no_site() then
    raise exception 'Só a equipe do Publike vê o painel.' using errcode = '42501';
  end if;
  perform set_config('publike.painel_no_site', 'sim', true);
  v := jsonb_build_object(
    'resumo', public.admin_resumo(),
    'acessos', public.admin_acessos_site(),
    'encerramentos', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from public.admin_motivos_encerramento(30) e),
    'matches_hoje', (select count(*) from public.curtidas c where c.status = 'match' and c.respondida_em >= hoje)
  );
  perform set_config('publike.painel_no_site', '', true);
  return v;
exception when others then
  perform set_config('publike.painel_no_site', '', true);
  raise;
end
$$;

revoke execute on function public.posso_ver_painel_no_site(), public.painel_no_site() from public, anon;
grant execute on function public.posso_ver_painel_no_site(), public.painel_no_site() to authenticated;

-- Admin (computador do dono): as contas com e-mail @publike.org confirmado, liberadas ou não
create or replace function public.admin_contas_painel_no_site()
returns table (usuario_id uuid, email text, nome text, liberado boolean, liberado_em timestamptz, ultimo_acesso timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return query
  select u.id, u.email::text, p.nome, (l.usuario_id is not null), l.liberado_em, u.last_sign_in_at
    from auth.users u
    left join public.perfis p on p.id = u.id
    left join privado.painel_no_site l on l.usuario_id = u.id
   where u.email_confirmed_at is not null
     and lower(u.email) like '%@publike.org'
   order by u.email;
end
$$;

create or replace function public.admin_liberar_painel_no_site(p_usuario uuid, p_liberar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  if p_liberar then
    if not exists (select 1 from auth.users u
                    where u.id = p_usuario and u.email_confirmed_at is not null and lower(u.email) like '%@publike.org') then
      raise exception 'Só conta com e-mail @publike.org confirmado.' using errcode = '22023';
    end if;
    insert into privado.painel_no_site (usuario_id) values (p_usuario) on conflict (usuario_id) do nothing;
  else
    delete from privado.painel_no_site where usuario_id = p_usuario;
  end if;
end
$$;

revoke execute on function public.admin_contas_painel_no_site(), public.admin_liberar_painel_no_site(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_contas_painel_no_site(), public.admin_liberar_painel_no_site(uuid, boolean)
  to service_role;
