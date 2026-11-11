-- O plano no lugar do recurso sozinho (11/11/2026): quem assina o Teste Prático (ou outro recurso sozinho, ou o
-- combo) pode assinar um plano sem cancelar antes. Quando o plano começa a valer (o cartão ligado ou o 1º Pix pago),
-- o site cancela no Asaas as assinaturas que o plano substitui (src/lib/servidor/pagamentos.ts); o que já foi pago
-- delas continua valendo até o fim. Esta função só lê as assinaturas da conta para o servidor. Pode rodar de novo.

create or replace function public.servidor_assinaturas_da_conta(p_chave text, p_conta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'recurso', a.recurso, 'asaas_id', a.asaas_id,
                                                       'situacao', a.situacao, 'sandbox', a.sandbox))
                     from privado.assinaturas a
                    where a.conta_id = p_conta and a.situacao <> 'cancelada'), '[]'::jsonb);
end
$$;
-- como as outras servidor_*: quem chama precisa da chave do servidor (privado.exigir_servidor)

notify pgrst, 'reload schema';
