-- A vaga que saiu do ar leva para as parecidas (12/11/2026, claude/plano-alcance-e-cadastros.md). Quem abre o link de
-- uma vaga pausada, encerrada ou vencida (pelo Google, por um grupo de WhatsApp, por um e-mail antigo) caía no "não
-- encontrado" e ia embora; o Google também perdia a página. Agora o site manda para "Vagas de frentista em Goiânia"
-- (ou a área, ou a cidade), com o aviso de que aquela vaga foi encerrada.
--
-- Esta função só diz o tipo, a cidade, a área e a função de um anúncio que já esteve no ar, nada de quem publicou nem
-- do texto. Anúncio em análise (que nunca foi público) ou removido pela moderação não volta nada: segue o 404.
-- Pode rodar de novo.

create or replace function public.destino_do_anuncio_fora_do_ar(p_id uuid)
returns table (tipo text, cidade text, categoria text, cbo text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.tipo, a.cidade, a.categoria,
         (select f.cbo from privado.funcoes_das_vagas f where f.anuncio_id = a.id and f.cbo is not null limit 1)
    from public.anuncios a
   where a.id = p_id
     and (a.status in ('pausado', 'encerrado', 'expirado') or (a.status = 'ativo' and a.expira_em <= now()))
$$;

revoke execute on function public.destino_do_anuncio_fora_do_ar(uuid) from public;
grant execute on function public.destino_do_anuncio_fora_do_ar(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
