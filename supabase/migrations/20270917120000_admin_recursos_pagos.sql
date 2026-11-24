-- Admin › Recursos pagos (23/11/2026; Marcelo: "Quero ver quem usa as features pagas, que habilitaram"). Numa tela só:
--   * quem tem cada recurso pago liberado (Triagem, Teste Prático, Entrevista em vídeo, Automações, Salários,
--     Contato no convite, Visões), e como: a assinatura, os 15 dias grátis ou liberado pelo Publike; as contas de
--     teste (privado.pagamentos_teste) vêm marcadas;
--   * as assinaturas (todas as que não são do sandbox, e as do sandbox à parte);
--   * quem usa o grátis do mês (a Triagem e as entrevistas gravadas, neste mês de Goiânia) e quem já chegou ao limite;
--   * os impulsos dos últimos 60 dias por conta (comprados, crédito, cortesia ou dados pela equipe).
-- Só lê. Pode rodar de novo.

create or replace function public.admin_recursos_pagos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inicio timestamptz := privado.gratis_inicio_do_mes();
  v_lim_triagem integer := coalesce((select c.gratis_triagem_mes from privado.config_pagamentos c where c.id), 5);
  v_lim_gravadas integer := coalesce((select c.gratis_gravadas_mes from privado.config_pagamentos c where c.id), 5);
  v jsonb;
begin
  if not privado.eh_admin() then
    raise exception 'Só o admin vê os recursos pagos.' using errcode = '42501';
  end if;

  with lib as (
    select 'copiloto'::text recurso, x.conta_id, x.liberado_em desde, x.ate, null::uuid pessoa_id from privado.copiloto_contas x
    union all select 'testes', x.conta_id, x.liberado_em, x.ate, null from privado.testes_contas x
    union all select 'video', x.conta_id, x.liberado_em, x.ate, null from privado.video_contas x
    union all select 'automacoes', x.conta_id, x.liberado_em, x.ate, null from privado.automacoes_contas x
    union all select 'salarios', x.conta_id, x.liberado_em, x.ate, null from privado.salarios_contas x
    union all select 'contato_no_convite', x.conta_id, x.inicio, x.ate, x.pessoa_id from privado.contato_no_convite_contas x
    union all select 'visoes', x.conta_id, x.inicio, x.ate, x.pessoa_id from privado.visoes_contas x
  ), lib_como as (
    select l.*,
           -- a assinatura que cobre o recurso e valeu junto com a liberação
           (select a.id from privado.assinaturas a
             where a.conta_id = l.conta_id
               and (a.recurso = l.recurso
                    or (a.recurso = 'combo' and l.recurso in ('copiloto', 'testes'))
                    or (a.recurso in ('completo', 'empresa_5', 'empresa_20', 'empresa_50', 'agencia_15', 'agencia_200')
                        and l.recurso in ('copiloto', 'testes', 'video', 'automacoes', 'salarios')))
               and a.situacao in ('ativa', 'cancelada')
               and a.criada_em <= coalesce(l.ate, now()) + interval '1 day'
               and (a.cancelada_em is null or a.cancelada_em >= l.desde - interval '1 day')
             order by (a.situacao = 'ativa') desc, a.criada_em desc limit 1) assinatura_id,
           -- os 15 dias: o experimento que acaba junto com a liberação (Visões e Contato no convite: pedidos pela pessoa)
           exists (select 1 from privado.experimentos e
                    where e.conta_id = l.conta_id and e.recurso = l.recurso and l.ate is not null
                      and e.fim between l.ate - interval '1 day' and l.ate + interval '1 day')
             or (l.recurso in ('visoes', 'contato_no_convite') and l.pessoa_id is not null and l.ate is not null) quinze
      from lib l
  ), liberados as (
    select l.recurso, l.conta_id, p.nome, p.tipo, l.desde, l.ate,
           (l.ate is null or l.ate > now()) ativo,
           case when l.quinze then '15_dias' when l.assinatura_id is not null then 'assinatura' else 'publike' end como,
           a.sandbox, a.valor, a.ciclo, a.situacao situacao_assinatura,
           exists (select 1 from privado.pagamentos_teste t where t.conta_id = l.conta_id) conta_de_teste,
           case l.recurso
             when 'copiloto' then (select count(*) from privado.copiloto_avaliacoes x join public.anuncios n on n.id = x.anuncio_id
                                    where n.autor_id = l.conta_id and x.criado_em >= v_inicio)
             when 'video' then (select count(*) from public.entrevistas_video e join public.anuncios n on n.id = e.anuncio_id
                                 where n.autor_id = l.conta_id and e.pedida_em >= v_inicio)
           end uso_no_mes
      from lib_como l
      join public.perfis p on p.id = l.conta_id
      left join privado.assinaturas a on a.id = l.assinatura_id and not l.quinze
  ), triagem as (
    select n.autor_id conta_id, count(*) lidos
      from privado.copiloto_avaliacoes x join public.anuncios n on n.id = x.anuncio_id
     where x.origem = 'candidato' and x.criado_em >= v_inicio
     group by n.autor_id
  ), gravadas as (
    select n.autor_id conta_id, count(*) pedidas, count(*) filter (where e.enviada_em is not null) enviadas
      from public.entrevistas_video e join public.anuncios n on n.id = e.anuncio_id
     where e.pedida_em >= v_inicio
     group by n.autor_id
  ), gratis as (
    select coalesce(t.conta_id, g.conta_id) conta_id, coalesce(t.lidos, 0) lidos,
           coalesce(g.pedidas, 0) pedidas, coalesce(g.enviadas, 0) enviadas
      from triagem t full join gravadas g on g.conta_id = t.conta_id
  ), gratis_contas as (
    select g.conta_id, p.nome, p.tipo,
           case when privado.copiloto_liberado(g.conta_id) then null else g.lidos end lidos,
           case when privado.video_liberado(g.conta_id) then null else g.pedidas end pedidas,
           g.enviadas,
           exists (select 1 from privado.pagamentos_teste t where t.conta_id = g.conta_id) conta_de_teste
      from gratis g join public.perfis p on p.id = g.conta_id
     where privado.contrata(g.conta_id)
  ), impulsos as (
    select i.conta_id, p.nome, p.tipo, count(*) total,
           count(*) filter (where i.origem = 'compra') compra,
           count(*) filter (where i.origem = 'credito') credito,
           count(*) filter (where i.origem = 'cortesia') cortesia,
           count(*) filter (where i.origem = 'admin') admin,
           count(*) filter (where i.automatico) automaticos,
           coalesce(sum(i.valor) filter (where not i.sandbox and i.origem = 'compra'), 0) valor,
           coalesce(sum(i.gasto), 0) gasto,
           max(i.criado_em) ultimo
      from privado.impulsos i join public.perfis p on p.id = i.conta_id
     where i.criado_em > now() - interval '60 days'
     group by i.conta_id, p.nome, p.tipo
  )
  select jsonb_build_object(
    'mes_desde', v_inicio,
    'limite_triagem', v_lim_triagem,
    'limite_gravadas', v_lim_gravadas,
    'liberados', coalesce((select jsonb_agg(to_jsonb(l) order by l.ativo desc, l.desde desc) from liberados l), '[]'::jsonb),
    'assinaturas', coalesce((select jsonb_agg(jsonb_build_object(
                                'conta_id', a.conta_id, 'nome', p.nome, 'recurso', a.recurso, 'ciclo', a.ciclo,
                                'valor', a.valor, 'forma', a.forma, 'situacao', a.situacao, 'sandbox', a.sandbox,
                                'criada_em', a.criada_em, 'cancelada_em', a.cancelada_em,
                                'conta_de_teste', exists (select 1 from privado.pagamentos_teste t where t.conta_id = a.conta_id))
                              order by (a.situacao = 'ativa') desc, a.sandbox, a.criada_em desc)
                               from (select * from privado.assinaturas order by criada_em desc limit 200) a
                               join public.perfis p on p.id = a.conta_id), '[]'::jsonb),
    'gratis', coalesce((select jsonb_agg(to_jsonb(g) order by coalesce(g.lidos, 0) + coalesce(g.pedidas, 0) desc, g.nome)
                          from gratis_contas g
                         where coalesce(g.lidos, 0) > 0 or coalesce(g.pedidas, 0) > 0), '[]'::jsonb),
    'impulsos', coalesce((select jsonb_agg(to_jsonb(i) order by i.total desc, i.ultimo desc) from impulsos i), '[]'::jsonb)
  ) into v;
  return v;
end
$$;
revoke execute on function public.admin_recursos_pagos() from public, anon, authenticated;
grant execute on function public.admin_recursos_pagos() to service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270917120000_admin_recursos_pagos');
