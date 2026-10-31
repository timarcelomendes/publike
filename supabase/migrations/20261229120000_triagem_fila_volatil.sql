-- Conserto da tarefa das filas: /api/filas dava erro 500 desde 30/10, 21h (o cron-job.org desligou a tarefa).
-- As funções da fila da Triagem estavam marcadas "stable", e o PostgREST roda as "stable" numa transação só
-- de leitura. Só que privado.exigir_servidor anota o uso da chave do servidor (um UPDATE), e o banco recusava:
-- "cannot execute UPDATE in a read-only transaction". Elas passam a ser "volatile", como as outras servidor_*.
-- As de notícias e de pagamento têm o mesmo jeito e ainda não deram erro no registro; vão juntas, por cuidado.
-- Pode rodar de novo.

alter function public.servidor_copiloto_vagas_sem_criterios(text, integer) volatile;
alter function public.servidor_copiloto_fila(text, integer) volatile;
alter function public.servidor_copiloto_vagas_para_ler(text, integer, uuid) volatile;
alter function public.servidor_copiloto_candidatos_da_vaga(text, uuid) volatile;
alter function public.servidor_noticias_contexto(text) volatile;
alter function public.servidor_pagamento_contexto(text, uuid) volatile;
alter function public.servidor_pagamento_da_conta(text, uuid, uuid) volatile;
alter function public.servidor_pagamento_cobranca_da_conta(text, uuid, uuid) volatile;

notify pgrst, 'reload schema';
