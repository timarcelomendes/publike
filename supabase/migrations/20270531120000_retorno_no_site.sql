-- Admin › Retorno também no site no ar, para a equipe publike.org (15/11/2026: a tela só abria no computador do dono, e
-- "A empresa respondeu o candidato?" não aparecia pelo celular). Uma função só junta o que a tela lê, conferindo antes
-- que é o admin ou a equipe publike.org (como Impulsos). As perguntas dos matches sem contato continuam só no
-- computador do dono. Pode rodar de novo.

create or replace function public.equipe_retorno(p_desde timestamptz, p_conta uuid, p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike vê o retorno.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'empresas', public.admin_retorno_empresas(p_desde),
    'da_empresa', case when p_conta is null then '[]'::jsonb else public.admin_retorno_da_empresa(p_conta, p_desde) end,
    'tres', public.admin_respostas_do_retorno(p_dias),
    'lista', public.admin_lista_te_respondeu(p_dias));
end
$$;
revoke execute on function public.equipe_retorno(timestamptz, uuid, integer) from public, anon;
grant execute on function public.equipe_retorno(timestamptz, uuid, integer) to authenticated, service_role;

-- a tela na lista de Admin › Quem vê cada tela (só a equipe publike.org)
insert into privado.telas_do_admin (rota, somente_publike) values ('/admin/retorno', true)
on conflict (rota) do nothing;

notify pgrst, 'reload schema';
