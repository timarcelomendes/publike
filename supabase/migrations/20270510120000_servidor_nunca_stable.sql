-- As funções do servidor nunca STABLE (13/11/2026). A conferência da chave do servidor (privado.exigir_servidor)
-- grava quando a chave foi usada (chaves_servidor.usada_em), e o PostgREST roda as funções STABLE e IMMUTABLE numa
-- transação só de leitura, até no POST. Aí a conferência dá erro ("cannot execute UPDATE in a read-only
-- transaction") e a função nunca responde. Quatro estavam assim:
-- - servidor_assinaturas_da_conta (20270421120000): o plano novo não cancelava sozinho as assinaturas que ele
--   substitui (o erro ficava só no log: "não deu para ler as assinaturas da conta");
-- - servidor_impulso_palavras_em (20270507120000): as palavras do impulso eram conferidas a cada medida, e não uma
--   vez por dia;
-- - servidor_impulso_palavras_ia (20270508120000): a IA nunca revisou as palavras do impulso;
-- - servidor_ajustes_para_fazer (20270509120000): o ajuste diário não começaria.
-- A conferência das migrações (scripts/ci/verificar-migracoes.sh) agora barra função do servidor STABLE.
-- Pode rodar de novo.

alter function public.servidor_assinaturas_da_conta(text, uuid) volatile;
alter function public.servidor_impulso_palavras_em(text, uuid) volatile;
alter function public.servidor_impulso_palavras_ia(text, uuid) volatile;
alter function public.servidor_ajustes_para_fazer(text) volatile;

notify pgrst, 'reload schema';
