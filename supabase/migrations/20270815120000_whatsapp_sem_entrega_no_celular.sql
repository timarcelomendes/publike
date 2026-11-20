-- O aviso "Saíram há mais de 1 hora e a Meta não disse se entregou" (20/11/2026, Marcelo: "nao achei nada" em Ligação
-- e teste). Eram 2 avisos "te respondeu" para uma pessoa cujo celular nunca recebeu nada do Publike, e o webhook
-- chegava normal: a Meta tinha avisado que as duas saíram (o status "sent" traz o preço, que vira a coluna cobrada).
--
-- Separa as que saíram há mais de 1 hora sem a entrega em duas:
--   sem notícia nenhuma da Meta (cobrada nula: nem o "sent" chegou)  -> o webhook pode não estar chegando
--   a Meta avisou que saiu, mas o celular ainda não recebeu           -> desligado, sem internet ou número fora de uso
-- Toda mensagem que saiu nos 60 dias antes desta migração tinha a cobrada preenchida (true ou false), então a nula é
-- mesmo "nenhum status chegou".
--
-- Função à parte (a admin_whatsapp_resultados continua igual): entre a publicação e esta migração, a tela usa o aviso
-- de antes.

create or replace function public.admin_whatsapp_sem_entrega(p_dias integer default 7, p_numeros text default 'todos')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dias integer := least(greatest(coalesce(p_dias, 7), 0), 90);
  -- o mesmo período da admin_whatsapp_resultados (dias do calendário de Brasília)
  v_desde timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
                         - make_interval(days => greatest(v_dias - 1, 0));
  v_numeros text := case when p_numeros in ('reais', 'teste') then p_numeros else 'todos' end;
  v_teste text[] := privado.whatsapp_chaves_de_teste();
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
             -- nem o "saiu" a Meta avisou: o webhook pode não estar chegando
             'sem_noticia', count(*) filter (where f.cobrada is null),
             -- a Meta avisou que saiu, mas o celular de quem recebe ainda não recebeu
             'no_celular', count(*) filter (where f.cobrada is not null),
             'pessoas_no_celular', count(distinct f.numero) filter (where f.cobrada is not null),
             'ultima_no_celular', max(f.enviada_em) filter (where f.cobrada is not null),
             -- a última notícia que chegou pelo webhook: entrega, leitura, resposta de botão ou mensagem recebida
             'ultima_noticia', greatest(
               (select max(greatest(g.entregue_em, g.lida_em, g.respondida_em)) from privado.fila_whatsapp g
                 where g.criado_em >= now() - interval '30 days'),
               (select max(m.criado_em) from privado.whatsapp_conversa_mensagens m
                 where m.de = 'pessoa' and m.criado_em >= now() - interval '30 days')))
      from privado.fila_whatsapp f
     where f.situacao = 'enviada' and f.enviada_em < now() - interval '1 hour'
       and f.criado_em >= v_desde and privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, v_numeros, v_teste)
  );
end
$$;
revoke execute on function public.admin_whatsapp_sem_entrega(integer, text) from public, anon;
grant execute on function public.admin_whatsapp_sem_entrega(integer, text) to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270815120000_whatsapp_sem_entrega_no_celular');
