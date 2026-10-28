-- A IA de reserva (27/10/2026): o site fala com a OpenAI (GPT-6 Luna e Sol) ou com o Claude (Haiku 5.5 e
-- Sonnet 5.5), conforme o modelo de Admin › IA. Com a reserva ligada, quando a escolhida não tem chave, fica
-- sem créditos ou sai do ar, o pedido vai uma vez para o par dela na outra IA. Pode rodar de novo.

alter table public.config_site add column if not exists ia_reserva boolean not null default true;

-- o servidor lê se a reserva está ligada (não é segredo: só sim ou não)
create or replace function public.ia_reserva()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.ia_reserva from public.config_site c limit 1), true)
$$;
revoke execute on function public.ia_reserva() from public;
grant execute on function public.ia_reserva() to anon, authenticated, service_role;

-- a de 20261009210000, mais a reserva
drop function if exists public.admin_salvar_config_ia(boolean, boolean, boolean, text);
create or replace function public.admin_salvar_config_ia(
  p_moderacao boolean,
  p_melhorar_texto boolean,
  p_resumo boolean,
  p_modelo text,
  p_reserva boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  if coalesce(p_modelo, '') !~ '^[a-z0-9][a-z0-9.-]{2,60}$' then
    raise exception 'Modelo inválido.' using errcode = '22023';
  end if;
  update public.config_site
     set ia_moderacao = coalesce(p_moderacao, false),
         ia_melhorar_texto = coalesce(p_melhorar_texto, false),
         ia_resumo = coalesce(p_resumo, false),
         ia_modelo = p_modelo,
         ia_reserva = coalesce(p_reserva, true),
         atualizado_em = now(),
         atualizado_por = (select auth.uid())
   where id;
  perform privado.registrar('salvar_config', 'config', 'ia', 'IA',
                            jsonb_build_object('moderacao', p_moderacao, 'melhorar_texto', p_melhorar_texto,
                                               'resumo', p_resumo, 'modelo', p_modelo, 'reserva', p_reserva));
end
$$;
revoke execute on function public.admin_salvar_config_ia(boolean, boolean, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_salvar_config_ia(boolean, boolean, boolean, text, boolean) to service_role;

notify pgrst, 'reload schema';
