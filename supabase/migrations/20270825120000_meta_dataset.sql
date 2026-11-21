-- O conjunto de dados das conversões fica no banco (21/11/2026; Marcelo: "não entendi" o passo do Gerenciador de
-- Eventos e da Vercel). O botão "Ligar as conversões" de Admin › WhatsApp › Ligação pede à Meta o conjunto de dados da
-- conta do WhatsApp Business (`/{WABA}/dataset`; cria quando não tem) e guarda o ID aqui. O META_DATASET_ID da Vercel,
-- se existir, continua valendo antes deste.
--
-- Pode rodar de novo.

alter table privado.config_whatsapp add column if not exists meta_dataset text;
alter table privado.config_whatsapp drop constraint if exists config_whatsapp_meta_dataset_check;
alter table privado.config_whatsapp add constraint config_whatsapp_meta_dataset_check
  check (meta_dataset is null or meta_dataset ~ '^\d{5,30}$');

-- Para o servidor mandar as conversões.
create or replace function public.servidor_meta_dataset(p_chave text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (select c.meta_dataset from privado.config_whatsapp c where c.id);
end
$$;
revoke execute on function public.servidor_meta_dataset(text) from public;
grant execute on function public.servidor_meta_dataset(text) to anon, authenticated, service_role;

-- O botão do Admin guarda o que a Meta devolveu.
create or replace function public.admin_salvar_meta_dataset(p_id text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  if coalesce(p_id, '') !~ '^\d{5,30}$' then
    raise exception 'ID do conjunto de dados inválido' using errcode = '22023';
  end if;
  insert into privado.config_whatsapp (id) values (true) on conflict (id) do nothing;
  update privado.config_whatsapp set meta_dataset = p_id, atualizado_em = now(), atualizado_por = auth.uid()
   where id;
end
$$;
revoke execute on function public.admin_salvar_meta_dataset(text) from public, anon;
grant execute on function public.admin_salvar_meta_dataset(text) to authenticated, service_role;

-- O resumo do Admin passa a dizer o conjunto de dados guardado.
create or replace function public.admin_meta_conversoes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return (
    select jsonb_build_object(
      'dataset', (select c.meta_dataset from privado.config_whatsapp c where c.id),
      'enviadas_30_dias', count(*) filter (where resultado = 'ok' and criado_em > now() - interval '30 days'),
      'falharam_30_dias', count(*) filter (where resultado <> 'ok' and criado_em > now() - interval '30 days'),
      'ultimo_erro', (select m.resultado from privado.meta_conversoes m
                       where m.resultado <> 'ok' order by m.criado_em desc limit 1),
      'ultima_em', max(criado_em))
      from privado.meta_conversoes);
end
$$;
revoke execute on function public.admin_meta_conversoes() from public, anon;
grant execute on function public.admin_meta_conversoes() to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270825120000_meta_dataset');
