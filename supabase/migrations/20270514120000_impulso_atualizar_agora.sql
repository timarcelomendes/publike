-- O botão "Atualizar" em Admin › Impulsos › Agora (13/11/2026, pedido do Marcelo: "adicione um botão para atualizar os
-- dados"). O robô mede cada impulso no ar de 2 em 2 horas (migração 20270501120000), e os números da tela ficavam até
-- 2 horas atrás do Google. O botão põe os impulsos no ar na fila da medida já (medido_em vazio, como faz a mudança do
-- raio) e a ação roda uma volta do robô em seguida (src/lib/acoes/admin-impulsos.ts, atualizarImpulsos).
-- Pode rodar de novo.

create or replace function public.admin_medir_impulsos_agora()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantos integer;
begin
  perform privado.exigir_impulsos_admin();
  update privado.impulsos set medido_em = null where situacao = 'no_ar' and medido_em is not null;
  get diagnostics v_quantos = row_count;
  return v_quantos;
end
$$;

revoke execute on function public.admin_medir_impulsos_agora() from public, anon;
grant execute on function public.admin_medir_impulsos_agora() to authenticated, service_role;

notify pgrst, 'reload schema';
