-- A leitura do currículo não rodava em produção (21/11/2026, depois do Marcelo ligar em Admin › Qualificados): as
-- funções do robô (migração 20270826120000) estavam como "stable", e a conferência da chave do servidor
-- (privado.exigir_servidor) grava a hora de uso da chave. O PostgREST roda função "stable" numa transação só de
-- leitura, então cada chamada falhava (405) e o robô lia como "desligado". Passam a "volatile", como as outras
-- funções servidor_*.
--
-- Pode rodar de novo.

alter function public.servidor_config_leitura(text) volatile;
alter function public.servidor_curriculos_para_leitura(text, integer) volatile;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270829120000_leitura_volatil');
