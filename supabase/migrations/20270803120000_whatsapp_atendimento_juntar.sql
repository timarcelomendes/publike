-- O atendimento pelo WhatsApp, mais simples e completo (18/11/2026, claude/plano-whatsapp-atendimento.md). Pedido do
-- Marcelo: "Tornar o diálogo mais simples mas completo, capricha e deixe ele melhor, não seja tão aficionado a levar o
-- usuário a publicar ou procurar vagas, mas isso precisa ser evidente". Nas conversas do primeiro dia, quem mandava
-- "Oi" duas vezes seguidas recebia duas respostas. Agora o site espera uns segundos e responde só a última mensagem,
-- com a conversa toda.
--
--   * servidor_whatsapp_conversa_ultima: a última mensagem da pessoa (o wamid), quem responde a conversa agora, o que a
--     pessoa quer e as últimas 12 mensagens. O site chama depois da espera: se chegou uma mensagem mais nova, deixa a
--     resposta para ela; se a equipe pegou a conversa no meio, não responde.
-- Pode rodar de novo.

create or replace function public.servidor_whatsapp_conversa_ultima(p_chave text, p_conversa text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (
    select jsonb_build_object(
      'wamid', (select m.wamid from privado.whatsapp_conversa_mensagens m
                 where m.chave = c.chave and m.de = 'pessoa'
                 order by m.criado_em desc, m.id desc limit 1),
      'situacao', c.situacao,
      'perfil', c.perfil,
      -- as últimas 12 mensagens, da mais antiga para a mais nova
      'historico', coalesce((select jsonb_agg(jsonb_build_object('de', x.de, 'texto', x.texto) order by x.criado_em, x.id)
                               from (select m.id, m.de, m.texto, m.criado_em from privado.whatsapp_conversa_mensagens m
                                      where m.chave = c.chave order by m.criado_em desc, m.id desc limit 12) x),
                            '[]'::jsonb))
      from privado.whatsapp_conversas c
     where c.chave = p_conversa);
end
$$;

revoke execute on function public.servidor_whatsapp_conversa_ultima(text, text) from public;
grant execute on function public.servidor_whatsapp_conversa_ultima(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270803120000_whatsapp_atendimento_juntar');
