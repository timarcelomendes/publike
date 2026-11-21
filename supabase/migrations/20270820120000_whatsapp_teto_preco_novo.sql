-- O e-mail do teto do WhatsApp com a regra de preço de verdade (21/11/2026; Marcelo: "Atualize"). A migração
-- 20270808120000 dizia "a Meta cobra cada mensagem de atendimento depois das 1.000 grátis do mês", mas desde 01/10/2026
-- a Meta cobra cada mensagem de atendimento, sem cota grátis no mês, menos nas 72 horas depois de um clique num
-- anúncio de clique para o WhatsApp. Troca o texto padrão e, se a equipe não mudou o e-mail, o texto em uso.
--
-- Pode rodar de novo.

update public.modelos_email m
   set corpo = case when m.corpo = m.corpo_padrao then x.novo else m.corpo end,
       corpo_padrao = x.novo
  from (select E'O atendimento do WhatsApp já mandou {{enviadas}} das {{teto}} respostas do teto deste mês.\n\n{{situacao}}\n\n'
               || 'Desde 1º/10/2026, a Meta cobra cada mensagem que o Publike manda (respostas e códigos de entrar), menos '
               || 'nas 72 horas depois de a pessoa chegar por um anúncio de clique para o WhatsApp. Para mudar o teto, vá '
               || 'em Admin › WhatsApp › Conversas.' as novo) x
 where m.chave = 'aviso_whatsapp_teto';

select privado.migracao_aplicada('20270820120000_whatsapp_teto_preco_novo');
