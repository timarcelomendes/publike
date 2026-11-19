-- Manter contato com as empresas que vieram dos convites (19/11/2026; Marcelo: "queria manter contato para
-- continuarem" e "reforçar para que elas publiquem mais vagas, e entender a razão de não ter publicado ainda, de forma
-- simples e objetiva"). Admin › Convites › Manter contato lista quem já publicou com o Publike, com a mensagem pronta
-- para o WhatsApp da equipe (o mesmo número dos convites, aberto pelo link, uma de cada vez). Aqui ficam quando foi o
-- último contato e o motivo que a empresa deu para não publicar de novo (para contar os motivos).
--
-- Pode rodar de novo.

alter table public.convites
  add column if not exists contato_em timestamptz,
  add column if not exists contato_motivo text;
alter table public.convites drop constraint if exists convites_contato_motivo_check;
alter table public.convites add constraint convites_contato_motivo_check
  check (contato_motivo is null
         or contato_motivo in ('vai_publicar', 'sem_vaga', 'contratou_fora', 'candidatos', 'dificil', 'outro'));

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270810120000_convites_manter_contato');
