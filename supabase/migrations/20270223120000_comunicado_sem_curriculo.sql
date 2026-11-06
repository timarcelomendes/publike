-- Comunicados: o público "pessoas sem currículo" (claude/plano-rodape-e-comunicados-organicos.md, 06/11/2026).
-- São as contas de pessoa sem linha em public.curriculos; o modelo "Monte seu currículo" vai para elas.

create or replace function privado.recebe_comunicado(p_publico text, p_link text, p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where u.id = p_conta and (u.banned_until is null or u.banned_until <= now()))
     and case p_publico
           when 'todos' then true
           when 'pessoas' then exists (select 1 from public.perfis p where p.id = p_conta and p.tipo = 'pessoa')
           when 'pessoas_sem_curriculo' then
             exists (select 1 from public.perfis p where p.id = p_conta and p.tipo = 'pessoa')
             and not exists (select 1 from public.curriculos cv where cv.perfil_id = p_conta)
           when 'empresas' then exists (select 1 from public.perfis p where p.id = p_conta and p.tipo in ('empresa', 'comercio'))
           when 'agencias' then exists (select 1 from public.perfis p where p.id = p_conta and p.tipo = 'agencia')
           when 'android' then privado.aparelho_da_conta_tipo(p_conta) = 'android'
           when 'iphone' then privado.aparelho_da_conta_tipo(p_conta) = 'iphone'
           when 'computador' then privado.aparelho_da_conta_tipo(p_conta) = 'computador'
           else false
         end
     and (p_link is null or not exists (
           select 1 from public.notificacoes n
            where n.destinatario_id = p_conta and n.tipo = 'comunicado' and n.link = p_link))
$$;

revoke execute on function privado.recebe_comunicado(text, text, uuid) from public, anon, authenticated;

create or replace function public.admin_enviar_comunicado(p_publico text, p_texto text, p_link text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer;
  v_texto text := btrim(coalesce(p_texto, ''));
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
begin
  perform privado.exigir_admin();
  if p_publico not in ('todos', 'pessoas', 'pessoas_sem_curriculo', 'empresas', 'agencias', 'android', 'iphone',
                       'computador') then
    raise exception 'Público desconhecido.' using errcode = 'P0001';
  end if;
  if char_length(v_texto) < 10 or char_length(v_texto) > 240 then
    raise exception 'O texto vai de 10 a 240 letras.' using errcode = 'P0001';
  end if;
  insert into public.notificacoes (destinatario_id, tipo, texto, link)
  select p.id, 'comunicado', v_texto, v_link
    from public.perfis p
   where privado.recebe_comunicado(p_publico, v_link, p.id);
  get diagnostics total = row_count;
  insert into privado.comunicados (publico, texto, link, total) values (p_publico, v_texto, v_link, total);
  if total > 0 then
    perform privado.registrar('enviar_comunicado', 'config', 'comunicados', left(v_texto, 80),
                              jsonb_build_object('total', total, 'publico', p_publico, 'link', v_link));
  end if;
  return total;
end
$$;

revoke execute on function public.admin_enviar_comunicado(text, text, text) from public, anon, authenticated;
grant execute on function public.admin_enviar_comunicado(text, text, text) to service_role;
