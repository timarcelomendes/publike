-- O modo de teste também fora dos números reais (18/11/2026). Marcelo, com a foto das mensagens "não saiu: o envio
-- estava só para os números de teste": "esse de teste nao obedeceu os filtros". Eram avisos de pessoas de verdade,
-- da época do modo de teste (até 17/11, 16h37), que o robô descartou porque o envio estava só para os números de
-- teste. Agora contam como teste: o filtro "Sem teste" tira a mensagem para um número de teste e a descartada pelo
-- modo de teste; "Só teste" mostra as duas. As contas do alto seguem só pelo número.
-- Pode rodar de novo.

-- 1. a mensagem da fila no filtro: o número de teste ou o descarte do modo de teste
create or replace function privado.whatsapp_da_fila_no_filtro(p_numero text, p_motivo text, p_numeros text, p_teste text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_numeros
           when 'reais' then not (coalesce(privado.chave_do_numero(p_numero) = any (p_teste), false)
                                  or p_motivo is not distinct from 'modo de teste')
           when 'teste' then coalesce(privado.chave_do_numero(p_numero) = any (p_teste), false)
                             or p_motivo is not distinct from 'modo de teste'
           else true
         end
$$;
revoke all on function privado.whatsapp_da_fila_no_filtro(text, text, text, text[]) from public;

-- 2. o resumo (Admin › WhatsApp) ---------------------------------------------------------------------------------------

create or replace function public.admin_whatsapp(p_numeros text default 'todos')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
  v_inicio timestamptz := privado.whatsapp_inicio_do_mes();
  v_numeros text := case when p_numeros in ('reais', 'teste') then p_numeros else 'todos' end;
  v_teste text[] := privado.whatsapp_chaves_de_teste();
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  select * into cfg from privado.config_whatsapp where id;
  return jsonb_build_object(
    'config', jsonb_build_object(
      'ativo', cfg.ativo, 'para_todos', cfg.para_todos, 'numeros_teste', to_jsonb(cfg.numeros_teste),
      'limite_dia', cfg.limite_dia, 'limite_mes', cfg.limite_mes, 'por_conta_dia', cfg.por_conta_dia, 'tipos_desligados', to_jsonb(cfg.tipos_desligados),
      'modelos', cfg.modelos, 'modelos_conferidos_em', cfg.modelos_conferidos_em, 'atualizado_em', cfg.atualizado_em,
      'hora_inicio', cfg.hora_inicio, 'hora_fim', cfg.hora_fim, 'por_conta_dia_empresa', cfg.por_conta_dia_empresa,
      'juntar_minutos', cfg.juntar_minutos, 'intervalo_vaga_horas', cfg.intervalo_vaga_horas,
      'mensagem_minutos', cfg.mensagem_minutos, 'intervalo_conversa_horas', cfg.intervalo_conversa_horas,
      'validade_horas', cfg.validade_horas,
      'limite_mes_gratis', cfg.limite_mes_gratis, 'limite_mes_plano', cfg.limite_mes_plano),
    'numeros', v_numeros,
    -- as contas que recebem, pelo número de hoje; `de_teste`: as dos números de teste (de qualquer filtro)
    'aceites', (select jsonb_build_object(
                  'pessoas', count(*) filter (where p.tipo = 'pessoa' and privado.whatsapp_no_filtro(n.numero, v_numeros, v_teste)),
                  'empresas', count(*) filter (where p.tipo <> 'pessoa' and privado.whatsapp_no_filtro(n.numero, v_numeros, v_teste)),
                  'de_teste', count(*) filter (where privado.whatsapp_no_filtro(n.numero, 'teste', v_teste)),
                  'pararam_7_dias', (select count(*) from privado.whatsapp_permissoes w2
                                      where w2.cancelado_por = 'whatsapp' and w2.cancelado_em > now() - interval '7 days'
                                        and privado.whatsapp_no_filtro(w2.numero, v_numeros, v_teste)))
                  from privado.whatsapp_permissoes w
                  join public.perfis p on p.id = w.conta_id
                  cross join lateral (select privado.numero_do_whatsapp(w.conta_id) as numero) n
                 where w.cancelado_em is null),
    'pendentes', (select count(*) from privado.fila_whatsapp f where f.situacao in ('pendente', 'enviando')),
    'semana', (select jsonb_build_object(
                 'entraram', count(*),
                 'enviadas', count(*) filter (where f.enviada_em is not null),
                 'entregues', count(*) filter (where f.entregue_em is not null),
                 'lidas', count(*) filter (where f.lida_em is not null),
                 'respondidas', count(*) filter (where f.resposta is not null),
                 'falharam', count(*) filter (where f.situacao = 'falhou'),
                 'descartadas', count(*) filter (where f.situacao = 'descartada'),
                 'cobradas', count(*) filter (where f.cobrada))
                 from privado.fila_whatsapp f where f.criado_em > now() - interval '7 days'),
    'por_tipo', coalesce((select jsonb_agg(jsonb_build_object('tipo', x.tipo, 'enviadas', x.enviadas, 'lidas', x.lidas,
                                                             'respondidas', x.respondidas) order by x.enviadas desc)
                            from (select f.tipo,
                                         count(*) filter (where f.enviada_em is not null) as enviadas,
                                         count(*) filter (where f.lida_em is not null) as lidas,
                                         count(*) filter (where f.resposta is not null) as respondidas
                                    from privado.fila_whatsapp f where f.criado_em > now() - interval '30 days'
                                   group by f.tipo) x), '[]'::jsonb),
    'motivos', coalesce((select jsonb_agg(jsonb_build_object('situacao', x.situacao, 'motivo', x.motivo, 'quantas', x.n)
                                          order by x.n desc)
                           from (select f.situacao, f.motivo, count(*) as n from privado.fila_whatsapp f
                                  where f.criado_em > now() - interval '7 days' and f.situacao in ('falhou', 'descartada')
                                  group by f.situacao, f.motivo order by count(*) desc limit 12) x), '[]'::jsonb),
    'respostas', coalesce((select jsonb_agg(jsonb_build_object('tipo', x.tipo, 'resposta', x.resposta, 'quantas', x.n)
                                            order by x.tipo, x.n desc)
                             from (select f.tipo, f.resposta, count(*) as n from privado.fila_whatsapp f
                                    where f.respondida_em > now() - interval '30 days'
                                    group by f.tipo, f.resposta) x), '[]'::jsonb),
    'cobradas_30_dias', (select count(*) from privado.fila_whatsapp f
                          where f.cobrada and f.enviada_em > now() - interval '30 days'),
    -- o limite do mês conta todas, com as de teste
    'enviadas_no_mes', (select count(*) from privado.fila_whatsapp f where f.enviada_em >= v_inicio),
    -- a estimativa de cada aviso: quantos o Publike gerou em 30 dias (para quem já aceitou e para todos)
    'estimativa', coalesce((select jsonb_object_agg(x.tipo, jsonb_build_object('todos', x.todos, 'aceitaram', x.aceitaram))
                              from (select n.tipo, count(*) as todos,
                                           count(*) filter (where w.conta_id is not null
                                                              and not (n.tipo = any (w.tipos_desligados))) as aceitaram
                                      from public.notificacoes n
                                      left join privado.whatsapp_permissoes w
                                        on w.conta_id = n.destinatario_id and w.cancelado_em is null
                                     where n.criado_em > now() - interval '30 days'
                                       and n.tipo in ('match', 'entrevista', 'entrevista_lembrete', 'te_respondeu',
                                                      'conquista_pergunta', 'dispensada', 'curtida', 'lembrete_curtida',
                                                      'ainda_espera', 'conquista_confirmar', 'interesse_local', 'mensagem')
                                     group by n.tipo) x), '{}'::jsonb),
    -- quantas pessoas com o WhatsApp ligado desligaram cada aviso (Preferências)
    'desligados_por_tipo', coalesce((select jsonb_object_agg(x.tipo, x.n)
                                       from (select t.tipo, count(*) as n
                                               from privado.whatsapp_permissoes w
                                               cross join lateral unnest(w.tipos_desligados) as t(tipo)
                                              where w.cancelado_em is null
                                              group by t.tipo) x), '{}'::jsonb),
    -- quem contrata neste mês (desde o dia 1º): os avisos que saíram, o limite e os que o limite segurou, no filtro dos
    -- números. `contas` e `no_limite` contam todas; a lista traz as 30 que mais receberam.
    'quem_contrata_no_mes', (
      with uso as (
        select f.conta_id,
               count(*) filter (where f.enviada_em >= v_inicio and f.situacao <> 'falhou') as usadas,
               count(*) filter (where f.criado_em >= v_inicio and f.situacao = 'descartada'
                                  and f.motivo in ('limite do mês do grátis', 'limite do mês do plano')) as seguradas
          from privado.fila_whatsapp f
          join public.perfis p on p.id = f.conta_id and p.tipo <> 'pessoa'
         where f.criado_em >= v_inicio - interval '3 days'
           and privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, v_numeros, v_teste)
         group by f.conta_id
      ),
      contas as (
        select u.conta_id, p.nome, p.tipo, u.usadas, u.seguradas, x.plano,
               case when x.plano then cfg.limite_mes_plano else cfg.limite_mes_gratis end as limite
          from uso u
          join public.perfis p on p.id = u.conta_id
          cross join lateral (select privado.whatsapp_com_plano(u.conta_id) as plano) x
         where u.usadas > 0 or u.seguradas > 0
      )
      select jsonb_build_object(
               'contas', (select count(*) from contas),
               'no_limite', (select count(*) from contas c where c.usadas >= c.limite or c.seguradas > 0),
               'lista', coalesce((select jsonb_agg(to_jsonb(y) order by y.usadas desc, y.seguradas desc, y.nome)
                                    from (select * from contas c order by c.usadas desc, c.seguradas desc, c.nome
                                           limit 30) y), '[]'::jsonb))));
end
$$;
revoke execute on function public.admin_whatsapp(text) from public, anon;
grant execute on function public.admin_whatsapp(text) to authenticated, service_role;

-- 3. os resultados do período (as abas Resultados e Erros) -------------------------------------------------------------

create or replace function public.admin_whatsapp_resultados(p_dias integer default 7, p_numeros text default 'todos')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dias integer := least(greatest(coalesce(p_dias, 7), 0), 90);
  -- dias do calendário de Brasília: 0 ou 1 é hoje, desde a meia-noite; 7 é hoje e os 6 dias antes
  v_desde timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
                         - make_interval(days => greatest(v_dias - 1, 0));
  v_numeros text := case when p_numeros in ('reais', 'teste') then p_numeros else 'todos' end;
  v_teste text[] := privado.whatsapp_chaves_de_teste();
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'desde', v_desde,
    'filtro', v_numeros,
    -- quantas entraram no período de cada lado do filtro (os chips da tela)
    'numeros', (select jsonb_build_object(
                  'reais', count(*) filter (where privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, 'reais', v_teste)),
                  'teste', count(*) filter (where privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, 'teste', v_teste)),
                  'todos', count(*))
                  from privado.fila_whatsapp f where f.criado_em >= v_desde),
    'funil', (select jsonb_build_object(
                'entraram', count(*),
                'enviadas', count(*) filter (where f.enviada_em is not null),
                'entregues', count(*) filter (where f.entregue_em is not null),
                'lidas', count(*) filter (where f.lida_em is not null),
                'respondidas', count(*) filter (where f.resposta is not null),
                'falharam', count(*) filter (where f.situacao = 'falhou'),
                'descartadas', count(*) filter (where f.situacao = 'descartada'),
                'esperando', count(*) filter (where f.situacao in ('pendente', 'enviando')),
                'cobradas', count(*) filter (where f.cobrada))
                from privado.fila_whatsapp f
               where f.criado_em >= v_desde and privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, v_numeros, v_teste)),
    'na_fila', (select count(*) from privado.fila_whatsapp f
                 where f.situacao in ('pendente', 'enviando') and privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, v_numeros, v_teste)),
    -- as que saíram nas últimas 24 horas (o limite do dia do Admin conta assim, com as de teste)
    'enviadas_24h', (select count(*) from privado.fila_whatsapp f where f.enviada_em > now() - interval '24 hours'),
    'por_tipo', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.entraram desc, x.tipo)
        from (select f.tipo,
                     count(*) as entraram,
                     count(*) filter (where f.enviada_em is not null) as enviadas,
                     count(*) filter (where f.entregue_em is not null) as entregues,
                     count(*) filter (where f.lida_em is not null) as lidas,
                     count(*) filter (where f.resposta is not null) as respondidas,
                     count(*) filter (where f.situacao = 'falhou') as falharam,
                     count(*) filter (where f.situacao = 'descartada') as descartadas
                from privado.fila_whatsapp f
               where f.criado_em >= v_desde and privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, v_numeros, v_teste)
               group by f.tipo) x), '[]'::jsonb),
    'por_dia', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.dia)
        from (select to_char(f.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia,
                     count(*) as entraram,
                     count(*) filter (where f.enviada_em is not null) as enviadas,
                     count(*) filter (where f.lida_em is not null) as lidas,
                     count(*) filter (where f.situacao = 'falhou') as falharam
                from privado.fila_whatsapp f
               where f.criado_em >= v_desde and privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, v_numeros, v_teste)
               group by 1) x), '[]'::jsonb),
    -- os erros do período: o que falhou, por motivo (a Meta recusou o envio ou não entregou)
    'falhas', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.quantas desc, x.ultima desc)
        from (select coalesce(f.motivo, 'sem motivo') as motivo,
                     count(*) as quantas,
                     max(coalesce(f.enviada_em, f.criado_em)) as ultima,
                     array_agg(distinct f.tipo) as tipos
                from privado.fila_whatsapp f
               where f.situacao = 'falhou' and f.criado_em >= v_desde
                 and privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, v_numeros, v_teste)
               group by 1
               order by count(*) desc
               limit 20) x), '[]'::jsonb),
    -- parado agora na fila por um problema (de qualquer dia: ainda não saiu)
    'parados', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.quantas desc)
        from (select f.motivo, count(*) as quantas, min(f.criado_em) as desde
                from privado.fila_whatsapp f
               where f.situacao in ('pendente', 'enviando') and f.motivo is not null
                 and privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, v_numeros, v_teste)
               group by 1
               order by count(*) desc
               limit 20) x), '[]'::jsonb),
    -- saiu há mais de uma hora e a Meta não disse se entregou (o webhook pode não estar chegando)
    'sem_entrega', (select count(*) from privado.fila_whatsapp f
                     where f.situacao = 'enviada' and f.enviada_em < now() - interval '1 hour'
                       and f.criado_em >= v_desde and privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, v_numeros, v_teste)),
    -- por que não saíram (as regras: já viu no Publike, o limite, o modo de teste, venceu...)
    'descartes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.quantas desc)
        from (select coalesce(f.motivo, 'sem motivo') as motivo, count(*) as quantas
                from privado.fila_whatsapp f
               where f.situacao = 'descartada' and f.criado_em >= v_desde
                 and privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, v_numeros, v_teste)
               group by 1
               order by count(*) desc
               limit 12) x), '[]'::jsonb),
    'respostas', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.tipo, x.quantas desc)
        from (select f.tipo, f.resposta, count(*) as quantas
                from privado.fila_whatsapp f
               where f.respondida_em >= v_desde and f.resposta is not null
                 and privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, v_numeros, v_teste)
               group by 1, 2) x), '[]'::jsonb),
    -- as últimas do período, com o nome da conta (nunca o número)
    'ultimas', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.criado_em desc)
        from (select f.id, f.criado_em, f.tipo, f.modelo, f.situacao, f.motivo, f.resposta, f.quantos,
                     f.enviar_depois_de, f.enviada_em, f.entregue_em, f.lida_em, f.respondida_em, f.conta_id,
                     p.nome as conta, p.tipo as conta_tipo
                from privado.fila_whatsapp f
                left join public.perfis p on p.id = f.conta_id
               where f.criado_em >= v_desde and privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, v_numeros, v_teste)
               order by f.criado_em desc
               limit 50) x), '[]'::jsonb)
  );
end
$$;
revoke execute on function public.admin_whatsapp_resultados(integer, text) from public, anon;
grant execute on function public.admin_whatsapp_resultados(integer, text) to authenticated, service_role;

-- 4. o custo pela categoria de cada modelo --------------------------------------------------------------------------

create or replace function public.admin_whatsapp_cobradas_por_modelo(p_dias integer, p_numeros text default 'todos')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_numeros text := case when p_numeros in ('reais', 'teste') then p_numeros else 'todos' end;
  v_teste text[] := privado.whatsapp_chaves_de_teste();
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike vê o WhatsApp.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(x.modelo, x.n)
      from (select coalesce(f.modelo, '?') as modelo, count(*) as n from privado.fila_whatsapp f
             where f.cobrada and f.criado_em > now() - make_interval(days => least(greatest(coalesce(p_dias, 7), 1), 400))
               and privado.whatsapp_da_fila_no_filtro(f.numero, f.motivo, v_numeros, v_teste)
             group by 1) x), '{}'::jsonb);
end
$$;
revoke execute on function public.admin_whatsapp_cobradas_por_modelo(integer, text) from public, anon;
grant execute on function public.admin_whatsapp_cobradas_por_modelo(integer, text) to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270721120000_whatsapp_modo_de_teste_no_filtro');
