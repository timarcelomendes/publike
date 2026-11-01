-- O Plano Completo (pedido do usuário, 01/11/2026): a Triagem com IA, o Teste Prático, a Entrevista em vídeo e as
-- Automações personalizadas numa assinatura só, mensal ou a cada 3 meses, com o preço posto no Admin (sem preço e
-- desligado até lá). Como o combo: a cobrança paga libera os quatro, e quem assina o Plano Completo não assina os
-- recursos separados ao mesmo tempo (nem o combo); cancela um para assinar o outro, e o que já foi pago continua
-- valendo. Junto: o pago do combo deixa de contar para a Entrevista em vídeo e as Automações (o combo é só a
-- Triagem e o Teste Prático). Pode rodar de novo. Rode depois de 20270115120000_regras_personalizadas.sql.

-- 1. O Plano Completo nas tabelas e o plano (sem preço, desligado) ---------------------------------------------
alter table privado.planos drop constraint if exists planos_recurso_check;
alter table privado.planos add constraint planos_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo'));
alter table privado.assinaturas drop constraint if exists assinaturas_recurso_check;
alter table privado.assinaturas add constraint assinaturas_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo'));
alter table privado.cobrancas drop constraint if exists cobrancas_recurso_check;
alter table privado.cobrancas add constraint cobrancas_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo'));

insert into privado.planos (recurso, ciclo) values ('completo', 'MONTHLY'), ('completo', 'QUARTERLY')
on conflict (recurso, ciclo) do nothing;

-- nos avisos: "Assinatura do Plano Completo feita com o cartão."
create or replace function privado.nome_do_recurso(p_recurso text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_recurso
           when 'copiloto' then 'recurso Triagem com IA'
           when 'combo' then 'combo Triagem + Teste Prático'
           when 'completo' then 'Plano Completo'
           when 'video' then 'recurso Entrevista em vídeo'
           when 'automacoes' then 'recurso Automações personalizadas'
           else 'Teste Prático' end
$function$;

-- 2. Liberar: a cobrança paga do Plano Completo vale para os quatro -------------------------------------------
create or replace function privado.recalcular_recurso_pago(p_conta uuid, p_recurso text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pago timestamptz;
  v_teste timestamptz;
  v_novo timestamptz;
  v_tem boolean;
  v_ate timestamptz;
begin
  if p_recurso = 'combo' then
    perform privado.recalcular_recurso_pago(p_conta, 'copiloto');
    perform privado.recalcular_recurso_pago(p_conta, 'testes');
    return;
  end if;
  if p_recurso = 'completo' then
    perform privado.recalcular_recurso_pago(p_conta, 'copiloto');
    perform privado.recalcular_recurso_pago(p_conta, 'testes');
    perform privado.recalcular_recurso_pago(p_conta, 'video');
    perform privado.recalcular_recurso_pago(p_conta, 'automacoes');
    return;
  end if;
  select max(c.periodo_ate) + interval '3 days' into v_pago
    from privado.cobrancas c
   where c.conta_id = p_conta and c.situacao = 'paga'
     and (c.recurso in (p_recurso, 'completo') or (c.recurso = 'combo' and p_recurso in ('copiloto', 'testes')));
  select x.fim into v_teste from privado.experimentos x where x.conta_id = p_conta and x.recurso = p_recurso;
  v_novo := greatest(v_pago, v_teste);
  if p_recurso = 'copiloto' then
    select true, c.ate into v_tem, v_ate from privado.copiloto_contas c where c.conta_id = p_conta;
  elsif p_recurso = 'video' then
    select true, v.ate into v_tem, v_ate from privado.video_contas v where v.conta_id = p_conta;
  elsif p_recurso = 'automacoes' then
    select true, v.ate into v_tem, v_ate from privado.automacoes_contas v where v.conta_id = p_conta;
  else
    select true, t.ate into v_tem, v_ate from privado.testes_contas t where t.conta_id = p_conta;
  end if;
  -- liberado sem prazo pelo Publike: fica como está
  if coalesce(v_tem, false) and v_ate is null then
    return;
  end if;
  if v_novo is null then
    return;
  end if;
  if p_recurso = 'copiloto' then
    insert into privado.copiloto_contas (conta_id, liberado_em, ate) values (p_conta, now(), v_novo)
    on conflict (conta_id) do update set ate = excluded.ate;
  elsif p_recurso = 'video' then
    insert into privado.video_contas (conta_id, liberado_em, ate) values (p_conta, now(), v_novo)
    on conflict (conta_id) do update set ate = excluded.ate;
  elsif p_recurso = 'automacoes' then
    insert into privado.automacoes_contas (conta_id, liberado_em, ate) values (p_conta, now(), v_novo)
    on conflict (conta_id) do update set ate = excluded.ate;
  else
    insert into privado.testes_contas (conta_id, liberado_em, ate) values (p_conta, now(), v_novo)
    on conflict (conta_id) do update set ate = excluded.ate;
  end if;
end
$function$;

-- 3. O estado dos recursos: o Plano Completo conta como assinatura dos quatro ---------------------------------
create or replace function public.recursos_pagos()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  conta uuid := public.conta_atual();
  contrata boolean;
  pagar boolean;
  r text;
  ate_ timestamptz;
  tem boolean;
  e privado.experimentos;
  assina boolean;
  combo boolean;
  completo boolean;
  saida jsonb := '{}'::jsonb;
begin
  if (select auth.uid()) is null or conta is null then
    return null;
  end if;
  select p.tipo in ('comercio', 'empresa', 'agencia') into contrata from public.perfis p where p.id = conta;
  pagar := privado.pode_pagar(conta);
  -- o combo valendo (ou o Pix do combo esperando a 1ª fatura)
  combo := exists (select 1 from privado.assinaturas a
                    where a.conta_id = conta and a.recurso = 'combo'
                      and (a.situacao = 'ativa' or (a.situacao = 'pendente' and a.asaas_id is not null)));
  -- o Plano Completo valendo (ou o Pix dele esperando a 1ª fatura): vale pelos quatro
  completo := exists (select 1 from privado.assinaturas a
                       where a.conta_id = conta and a.recurso = 'completo'
                         and (a.situacao = 'ativa' or (a.situacao = 'pendente' and a.asaas_id is not null)));
  foreach r in array array['copiloto', 'testes', 'video', 'automacoes'] loop
    if r = 'copiloto' then
      select true, c.ate into tem, ate_ from privado.copiloto_contas c where c.conta_id = conta;
    elsif r = 'video' then
      select true, v.ate into tem, ate_ from privado.video_contas v where v.conta_id = conta;
    elsif r = 'automacoes' then
      select true, v.ate into tem, ate_ from privado.automacoes_contas v where v.conta_id = conta;
    else
      select true, t.ate into tem, ate_ from privado.testes_contas t where t.conta_id = conta;
    end if;
    select * into e from privado.experimentos x where x.conta_id = conta and x.recurso = r;
    assina := exists (select 1 from privado.assinaturas a
                       where a.conta_id = conta and a.situacao = 'ativa'
                         and (a.recurso in (r, 'completo') or (a.recurso = 'combo' and r in ('copiloto', 'testes'))));
    saida := saida || jsonb_build_object(r, jsonb_build_object(
      'liberado', coalesce(tem, false) and (ate_ is null or ate_ > now()),
      'ate', case when coalesce(tem, false) then ate_ end,
      'experimentou', e.conta_id is not null,
      'fim_experimento', e.fim,
      'quer_continuar', e.quer_continuar_em is not null,
      'pode_experimentar', coalesce(contrata, false) and e.conta_id is null
                           and not (coalesce(tem, false) and (ate_ is null or ate_ > now())),
      'assinante', assina,
      -- assinar: quem pode pagar, sem a liberação sem prazo e sem assinatura valendo (nem o combo), com plano à venda
      'pode_assinar', pagar and not assina and not (combo and r in ('copiloto', 'testes')) and not completo
                      and not (coalesce(tem, false) and ate_ is null)
                      -- o Pix já assinado, esperando a 1ª fatura
                      and not exists (select 1 from privado.assinaturas a
                                       where a.conta_id = conta and a.recurso = r and a.situacao = 'pendente'
                                         and a.asaas_id is not null)
                      and exists (select 1 from privado.planos pl
                                   where pl.recurso = r and pl.ligado and pl.valor is not null)));
    tem := null; ate_ := null; e := null;
  end loop;
  return saida;
end
$function$;

-- 4. Ligar a assinatura do checkout do cartão: o Plano Completo pelo nome ("Publike · Plano Completo") ---------
create or replace function public.servidor_pagamento_vincular(p_chave text, p_sub jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a privado.assinaturas;
  v_conta uuid;
  v_recurso text;
  v_desc text := lower(coalesce(p_sub ->> 'description', ''));
  v_trocadas jsonb := '[]'::jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  -- o aviso e a volta do checkout chegam juntos: um de cada vez por cliente
  perform pg_advisory_xact_lock(hashtext('pagamento:' || coalesce(p_sub ->> 'customer', p_sub ->> 'id')));
  select * into a from privado.assinaturas where asaas_id = p_sub ->> 'id';
  if a.id is null then
    select c.conta_id into v_conta from privado.clientes_pagamento c where c.asaas_id = p_sub ->> 'customer';
    if v_conta is null then
      return null;
    end if;
    v_recurso := case when v_desc like '%completo%' then 'completo'
                      when v_desc like '%combo%' then 'combo'
                      when v_desc like '%automa%' then 'automacoes'
                      when v_desc like '%copiloto%' or v_desc like '%triagem%' then 'copiloto'
                      when v_desc like '%entrevista%' or v_desc like '%vídeo%' or v_desc like '%video%' then 'video'
                      when v_desc like '%teste%' then 'testes' end;
    select * into a from privado.assinaturas s
     where s.conta_id = v_conta and s.asaas_id is null and s.forma = 'cartao' and s.situacao = 'pendente'
       and (v_recurso is null or s.recurso = v_recurso)
     order by s.criada_em desc limit 1;
    if a.id is null then
      return null;
    end if;
    update privado.assinaturas set asaas_id = p_sub ->> 'id' where id = a.id returning * into a;
  end if;
  -- o cartão passou no checkout: a assinatura vale desde já (no teste grátis, a 1ª cobrança vem no fim dele);
  -- a do mesmo recurso que estava valendo (troca de ciclo ou de cartão) deixa de valer
  if a.forma = 'cartao' and a.situacao = 'pendente' and not coalesce((p_sub ->> 'deleted')::boolean, false)
     and upper(coalesce(p_sub ->> 'status', 'ACTIVE')) = 'ACTIVE' then
    with t as (
      update privado.assinaturas set situacao = 'cancelada', cancelada_em = now()
       where conta_id = a.conta_id and recurso = a.recurso and situacao in ('ativa', 'pendente') and id <> a.id
         and asaas_id is not null
      returning asaas_id)
    select coalesce(jsonb_agg(t.asaas_id), '[]'::jsonb) into v_trocadas from t;
    update privado.assinaturas set situacao = 'ativa' where id = a.id returning * into a;
    perform privado.avisar_pagamento(a.conta_id,
      case when jsonb_array_length(v_trocadas) > 0
           then 'Cartão do ' || privado.nome_do_recurso(a.recurso) || ' trocado.'
           else 'Assinatura do ' || privado.nome_do_recurso(a.recurso) || ' feita com o cartão.' end,
      '/painel/assinatura');
  end if;
  if p_sub ->> 'nextDueDate' is not null and a.situacao <> 'cancelada' then
    update privado.assinaturas set proxima_cobranca = (p_sub ->> 'nextDueDate')::date where id = a.id;
  end if;
  return jsonb_build_object('assinatura_id', a.id, 'conta', a.conta_id, 'recurso', a.recurso,
                            'situacao', a.situacao, 'nota_configurada', a.nota_configurada,
                            'asaas_id', a.asaas_id, 'trocadas', v_trocadas);
end
$function$;
