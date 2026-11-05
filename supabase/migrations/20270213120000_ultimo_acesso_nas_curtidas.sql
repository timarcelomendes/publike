-- Admin › Curtidas (05/11/2026): o último acesso de quem curtiu e de quem publicou. O mais recente entre o último
-- login (auth.users) e a última página aberta (privado.aparelho_da_conta, no máximo a cada 6 horas por aparelho):
-- quem fica logado por semanas não passa pelo login de novo. Só o horário, nada do aparelho. Pode rodar de novo.

create or replace function public.admin_ultimos_acessos(p_ids uuid[])
returns table (id uuid, ultimo_acesso timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
  select u.id, nullif(greatest(coalesce(u.last_sign_in_at, '-infinity'), coalesce(a.visto_em, '-infinity')), '-infinity')
    from auth.users u
    left join privado.aparelho_da_conta a on a.conta_id = u.id
   where u.id = any ((coalesce(p_ids, '{}'))[1:1000]);
end
$$;
revoke execute on function public.admin_ultimos_acessos(uuid[]) from public, anon;
grant execute on function public.admin_ultimos_acessos(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
