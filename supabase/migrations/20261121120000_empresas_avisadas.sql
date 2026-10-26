-- Admin › Esperando (26/10/2026): guarda quando a equipe avisou a empresa pelo WhatsApp, para não
-- mandar duas vezes (a lista mostra "avisada há 2 dias"). Uma linha por aviso; só o service_role.
-- Pode rodar de novo.

create table if not exists privado.empresas_avisadas (
  id bigint generated always as identity primary key,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  pessoas integer not null default 0 check (pessoas >= 0),
  avisada_em timestamptz not null default now()
);
create index if not exists empresas_avisadas_conta_idx on privado.empresas_avisadas (conta_id, avisada_em desc);
alter table privado.empresas_avisadas enable row level security;

-- a equipe abriu o WhatsApp (ou copiou a mensagem) para a conta
create or replace function public.admin_marcar_empresa_avisada(p_conta uuid, p_pessoas integer default 0)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v timestamptz;
begin
  -- o mesmo aviso tocado de novo em 10 minutos (abrir e copiar) conta uma vez só
  select a.avisada_em into v from privado.empresas_avisadas a
   where a.conta_id = p_conta and a.avisada_em > now() - interval '10 minutes'
   order by a.avisada_em desc limit 1;
  if v is not null then
    return v;
  end if;
  insert into privado.empresas_avisadas (conta_id, pessoas)
  values (p_conta, greatest(coalesce(p_pessoas, 0), 0))
  returning avisada_em into v;
  return v;
end
$$;

-- o último aviso de cada conta
create or replace function public.admin_empresas_avisadas(p_contas uuid[])
returns table (conta_id uuid, avisada_em timestamptz, pessoas integer)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (a.conta_id) a.conta_id, a.avisada_em, a.pessoas
    from privado.empresas_avisadas a
   where a.conta_id = any (p_contas)
   order by a.conta_id, a.avisada_em desc
$$;

revoke execute on function public.admin_marcar_empresa_avisada(uuid, integer), public.admin_empresas_avisadas(uuid[])
  from public, anon, authenticated;
grant execute on function public.admin_marcar_empresa_avisada(uuid, integer), public.admin_empresas_avisadas(uuid[])
  to service_role;
