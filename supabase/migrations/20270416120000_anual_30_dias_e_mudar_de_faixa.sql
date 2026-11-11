-- Os outros jeitos de pagar os planos por faixa (claude/plano-convite-automatico-30-dias-e-anual.md, parte 2):
--   * o anual (YEARLY, 9 meses pelo ano), uma assinatura como as outras;
--   * o plano por 30 dias, sem renovar (AVULSO): uma cobrança só, que libera tudo por 30 dias a partir do pagamento;
--   * subir de faixa pagando a diferença dos dias que faltam, numa cobrança só, em qualquer ciclo;
--   * o arrependimento em 7 dias no anual e nos 30 dias (CDC, art. 49): o servidor estorna no Asaas.
-- As linhas novas dos planos nascem desligadas: o Marcelo confere os preços e liga em Admin › Pagamentos depois de
-- testar no sandbox. Pode rodar de novo.

-- ------------------------------------------------------------------ ciclos

alter table privado.planos drop constraint if exists planos_ciclo_check;
alter table privado.planos add constraint planos_ciclo_check
  check (ciclo in ('MONTHLY', 'QUARTERLY', 'YEARLY', 'AVULSO'));
alter table privado.assinaturas drop constraint if exists assinaturas_ciclo_check;
alter table privado.assinaturas add constraint assinaturas_ciclo_check
  check (ciclo in ('MONTHLY', 'QUARTERLY', 'YEARLY'));

create or replace function privado.meses_do_ciclo(p_ciclo text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_ciclo when 'QUARTERLY' then 3 when 'YEARLY' then 12 else 1 end
$$;

-- os dias de um período, para a conta da diferença na troca de faixa
create or replace function privado.dias_do_ciclo(p_ciclo text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_ciclo when 'QUARTERLY' then 90 when 'YEARLY' then 365 else 30 end
$$;

-- as linhas novas: o anual (9 meses) e os 30 dias (uns 25% acima do mensal), desligadas
insert into privado.planos (recurso, ciclo, valor, ligado, limite_vagas, limite_recrutadores)
select m.recurso, n.ciclo, n.valor, false, m.limite_vagas, m.limite_recrutadores
  from (values ('empresa_5', 'YEARLY', 711.00), ('empresa_20', 'YEARLY', 1791.00), ('empresa_50', 'YEARLY', 2691.00),
               ('agencia_15', 'YEARLY', 891.00), ('agencia_200', 'YEARLY', 3591.00),
               ('empresa_5', 'AVULSO', 99.00), ('empresa_20', 'AVULSO', 249.00), ('empresa_50', 'AVULSO', 369.00),
               ('agencia_15', 'AVULSO', 125.00), ('agencia_200', 'AVULSO', 499.00)) as n(recurso, ciclo, valor)
  join privado.planos m on m.recurso = n.recurso and m.ciclo = 'MONTHLY'
on conflict (recurso, ciclo) do nothing;

-- ------------------------------------------------------------------ a compra avulsa

create table if not exists privado.compras_avulsas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.perfis(id) on delete cascade,
  -- 'trinta_dias': o plano por 30 dias; 'faixa': a diferença para a faixa de cima de uma assinatura
  tipo text not null check (tipo in ('trinta_dias', 'faixa')),
  plano_id uuid references privado.planos(id) on delete set null,
  recurso text not null,
  valor numeric(10,2) not null check (valor > 0),
  forma text not null check (forma in ('cartao', 'pix')),
  -- na troca de faixa: a assinatura, a faixa de antes, o valor novo da renovação e os dias que faltavam
  assinatura_id uuid references privado.assinaturas(id) on delete set null,
  de_recurso text,
  valor_renovacao numeric(10,2),
  dias integer,
  asaas_id text unique,
  checkout_id text unique,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'paga', 'cancelada', 'estornada')),
  sandbox boolean not null default false,
  criada_em timestamptz not null default now(),
  paga_em timestamptz,
  -- até quando o plano de 30 dias vale (marcado quando o pagamento é confirmado)
  ate timestamptz,
  devolvida_em timestamptz,
  aviso_3_dias_em timestamptz,
  aviso_fim_em timestamptz
);
create index if not exists compras_avulsas_conta on privado.compras_avulsas (conta_id, criada_em desc);
alter table privado.compras_avulsas enable row level security;

alter table privado.cobrancas add column if not exists compra_id uuid references privado.compras_avulsas(id) on delete set null;

-- ------------------------------------------------------------------ liberar sem a folga

-- a cobrança da assinatura tem 3 dias de folga (a fatura atrasada); a compra avulsa, não
create or replace function privado.recalcular_recurso_pago(p_conta uuid, p_recurso text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago timestamptz;
  v_teste timestamptz;
  v_novo timestamptz;
  v_tem boolean;
  v_ate timestamptz;
begin
  if p_recurso = 'carreiras' then
    return; -- a Página de carreiras olha as cobranças pagas direto (privado.pagina_de_vagas_liberada)
  end if;
  if p_recurso = 'combo' then
    perform privado.recalcular_recurso_pago(p_conta, 'copiloto');
    perform privado.recalcular_recurso_pago(p_conta, 'testes');
    return;
  end if;
  if privado.libera_tudo(p_recurso) then
    perform privado.recalcular_recurso_pago(p_conta, 'copiloto');
    perform privado.recalcular_recurso_pago(p_conta, 'testes');
    perform privado.recalcular_recurso_pago(p_conta, 'video');
    perform privado.recalcular_recurso_pago(p_conta, 'automacoes');
    perform privado.recalcular_recurso_pago(p_conta, 'salarios');
    return;
  end if;
  select max(case when c.compra_id is null then c.periodo_ate + interval '3 days' else c.periodo_ate end) into v_pago
    from privado.cobrancas c
   where c.conta_id = p_conta and c.situacao = 'paga'
     and (c.recurso = p_recurso or privado.libera_tudo(c.recurso) or (c.recurso = 'combo' and p_recurso in ('copiloto', 'testes')));
  select x.fim into v_teste from privado.experimentos x where x.conta_id = p_conta and x.recurso = p_recurso;
  v_novo := greatest(v_pago, v_teste);
  if p_recurso = 'copiloto' then
    select true, c.ate into v_tem, v_ate from privado.copiloto_contas c where c.conta_id = p_conta;
  elsif p_recurso = 'video' then
    select true, v.ate into v_tem, v_ate from privado.video_contas v where v.conta_id = p_conta;
  elsif p_recurso = 'automacoes' then
    select true, v.ate into v_tem, v_ate from privado.automacoes_contas v where v.conta_id = p_conta;
  elsif p_recurso = 'salarios' then
    select true, v.ate into v_tem, v_ate from privado.salarios_contas v where v.conta_id = p_conta;
  else
    select true, t.ate into v_tem, v_ate from privado.testes_contas t where t.conta_id = p_conta;
  end if;
  -- liberado sem prazo pelo Publike: fica como está
  if coalesce(v_tem, false) and v_ate is null then
    return;
  end if;
  if v_novo is null then
    -- o estorno (o arrependimento) fecha o que só ele liberava
    if coalesce(v_tem, false) and v_ate > now() then
      v_novo := now();
    else
      return;
    end if;
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
  elsif p_recurso = 'salarios' then
    insert into privado.salarios_contas (conta_id, liberado_em, ate) values (p_conta, now(), v_novo)
    on conflict (conta_id) do update set ate = excluded.ate;
  else
    insert into privado.testes_contas (conta_id, liberado_em, ate) values (p_conta, now(), v_novo)
    on conflict (conta_id) do update set ate = excluded.ate;
  end if;
end
$$;

-- as vagas no ar: a compra avulsa vale sem a folga
create or replace function privado.limite_no_ar(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    20,
    coalesce((select max(pl.limite_vagas)
                from privado.assinaturas a
                join privado.planos pl on pl.recurso = a.recurso and pl.ciclo = a.ciclo
               where a.conta_id = p_conta and a.situacao = 'ativa' and pl.limite_vagas is not null), 0),
    coalesce((select max(pl.limite_vagas)
                from privado.cobrancas c
                join privado.planos pl on pl.recurso = c.recurso and pl.limite_vagas is not null
               where c.conta_id = p_conta and c.situacao = 'paga'
                 and c.periodo_ate + case when c.compra_id is null then interval '3 days' else interval '0' end >= now()), 0),
    case when exists (select 1 from privado.plano_agencia_cortesia x
                       where x.conta_id = p_conta and (x.ate is null or x.ate > now())) then 200 else 0 end)
$$;

-- ------------------------------------------------------------------ a diferença da troca de faixa

-- quanto falta pagar para passar a assinatura para o plano novo (a mesma família e o mesmo ciclo, faixa maior):
-- (valor novo − valor de hoje) × dias que faltam do período pago / dias do ciclo. Sem período pago (nos dias
-- grátis ou esperando o 1º pagamento), a troca é de graça e vale na hora.
create or replace function privado.diferenca_de_faixa(p_assinatura uuid, p_recurso text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a privado.assinaturas;
  pl_atual privado.planos;
  pl_novo privado.planos;
  v_pago timestamptz;
  v_dias integer;
  v_valor numeric;
begin
  select * into a from privado.assinaturas where id = p_assinatura;
  if a.id is null or a.situacao = 'cancelada' then
    return jsonb_build_object('erro', 'Não achamos a assinatura que vale.');
  end if;
  select * into pl_atual from privado.planos where recurso = a.recurso and ciclo = a.ciclo;
  select * into pl_novo from privado.planos where recurso = p_recurso and ciclo = a.ciclo;
  if pl_atual.limite_vagas is null or pl_novo.id is null or not pl_novo.ligado or pl_novo.limite_vagas is null
     or pl_novo.valor is null then
    return jsonb_build_object('erro', 'Essa troca de faixa não está à venda.');
  end if;
  if split_part(a.recurso, '_', 1) <> split_part(p_recurso, '_', 1) then
    return jsonb_build_object('erro', 'A troca é dentro do mesmo plano (Empresa ou Agência).');
  end if;
  if pl_novo.limite_vagas <= pl_atual.limite_vagas then
    return jsonb_build_object('erro', 'Escolha uma faixa maior que a de hoje.');
  end if;
  select max(c.periodo_ate) into v_pago from privado.cobrancas c
   where c.assinatura_id = a.id and c.situacao = 'paga' and c.compra_id is null;
  v_dias := greatest(0, ceil(extract(epoch from (coalesce(v_pago, now()) - now())) / 86400)::integer);
  v_valor := round(greatest(pl_novo.valor - a.valor, 0) * v_dias / privado.dias_do_ciclo(a.ciclo), 2);
  return jsonb_build_object(
    'assinatura_id', a.id, 'de', a.recurso, 'para', p_recurso, 'ciclo', a.ciclo, 'plano_id', pl_novo.id,
    'valor_hoje', a.valor, 'valor_novo', pl_novo.valor, 'dias', v_dias, 'pago_ate', v_pago,
    -- o Asaas não cobra menos de R$ 5: abaixo disso, a troca sai de graça
    'diferenca', case when v_valor < 5 then 0 else v_valor end,
    'forma', a.forma, 'asaas_id', a.asaas_id, 'sandbox', a.sandbox);
end
$$;

-- a troca de faixa vale: a assinatura passa para o plano novo (o valor da renovação muda no Asaas pelo servidor)
create or replace function privado.aplicar_troca_de_faixa(p_assinatura uuid, p_recurso text, p_valor numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a privado.assinaturas;
begin
  select * into a from privado.assinaturas where id = p_assinatura;
  if a.id is null then
    return;
  end if;
  update privado.assinaturas
     set recurso = p_recurso, valor = p_valor,
         plano_id = (select pl.id from privado.planos pl where pl.recurso = p_recurso and pl.ciclo = a.ciclo)
   where id = a.id;
  -- o aviso de faixa da assinatura recomeça pela faixa nova
  delete from privado.avisos_de_faixa where assinatura_id = a.id;
  perform privado.recalcular_recurso_pago(a.conta_id, p_recurso);
  perform privado.avisar_pagamento(a.conta_id,
    'Pronto: a sua assinatura passou para o ' || privado.nome_do_recurso(p_recurso) || '.', '/painel/assinatura');
end
$$;

-- ------------------------------------------------------------------ o servidor: começar, gravar e devolver

-- a compra nova, antes de ir ao Asaas: confere de novo quem pode e devolve o que o servidor precisa
create or replace function public.servidor_compra_nova(p_chave text, p_conta uuid, p_tipo text, p_plano uuid,
                                                      p_assinatura uuid, p_forma text, p_sandbox boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pl privado.planos;
  d jsonb;
  v_id uuid;
begin
  perform privado.exigir_servidor(p_chave);
  if not privado.pode_pagar(p_conta) then
    return jsonb_build_object('erro', 'Os pagamentos ainda não estão abertos para a sua conta.');
  end if;
  if p_forma not in ('cartao', 'pix') then
    return jsonb_build_object('erro', 'Escolha cartão ou Pix.');
  end if;
  if p_tipo = 'trinta_dias' then
    select * into pl from privado.planos where id = p_plano and ciclo = 'AVULSO' and ligado and valor is not null;
    if pl.id is null or (pl.recurso like 'agencia%' and not privado.agencia_verificada(p_conta)) then
      return jsonb_build_object('erro', 'Esse plano não está à venda. Atualize a página.');
    end if;
    if privado.vagas_no_ar(p_conta) > pl.limite_vagas then
      return jsonb_build_object('erro', 'Você tem ' || privado.vagas_no_ar(p_conta) || ' vagas no ar, e este plano vai até '
                                        || pl.limite_vagas || '. Escolha a faixa de cima.');
    end if;
    -- quem já assina um plano (ou um recurso que se cruza com ele) não compra os 30 dias: a assinatura já cobre
    if exists (select 1 from privado.assinaturas a
                where a.conta_id = p_conta and (a.situacao = 'ativa' or (a.situacao = 'pendente' and a.asaas_id is not null))) then
      return jsonb_build_object('erro', 'Você já tem uma assinatura, e ela já cobre isso. Veja em Assinatura.');
    end if;
    insert into privado.compras_avulsas (conta_id, tipo, plano_id, recurso, valor, forma, sandbox)
    values (p_conta, 'trinta_dias', pl.id, pl.recurso, pl.valor, p_forma, coalesce(p_sandbox, false))
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'valor', pl.valor, 'recurso', pl.recurso);
  elsif p_tipo = 'faixa' then
    select * into pl from privado.planos where id = p_plano;
    if not exists (select 1 from privado.assinaturas a where a.id = p_assinatura and a.conta_id = p_conta) then
      return jsonb_build_object('erro', 'Não achamos a assinatura.');
    end if;
    d := privado.diferenca_de_faixa(p_assinatura, pl.recurso);
    if d ? 'erro' then
      return d;
    end if;
    if (d ->> 'diferenca')::numeric = 0 then
      -- nada a pagar: vale na hora
      perform privado.aplicar_troca_de_faixa(p_assinatura, pl.recurso, (d ->> 'valor_novo')::numeric);
      return d || jsonb_build_object('feito', true);
    end if;
    insert into privado.compras_avulsas (conta_id, tipo, plano_id, recurso, valor, forma, assinatura_id, de_recurso,
                                         valor_renovacao, dias, sandbox)
    values (p_conta, 'faixa', (d ->> 'plano_id')::uuid, pl.recurso, (d ->> 'diferenca')::numeric, p_forma, p_assinatura,
            d ->> 'de', (d ->> 'valor_novo')::numeric, (d ->> 'dias')::integer, coalesce(p_sandbox, false))
    returning id into v_id;
    return d || jsonb_build_object('id', v_id, 'valor', (d ->> 'diferenca')::numeric, 'recurso', pl.recurso);
  end if;
  return jsonb_build_object('erro', 'Pedido inválido.');
end
$$;

-- a troca de faixa sem nada a pagar (a assinatura ainda sem período pago): vale na hora; com algo a pagar, recusa
create or replace function public.servidor_faixa_sem_pagar(p_chave text, p_conta uuid, p_assinatura uuid, p_plano uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  if not exists (select 1 from privado.assinaturas a where a.id = p_assinatura and a.conta_id = p_conta) then
    return jsonb_build_object('erro', 'Não achamos a assinatura.');
  end if;
  d := privado.diferenca_de_faixa(p_assinatura, (select pl.recurso from privado.planos pl where pl.id = p_plano));
  if d ? 'erro' then
    return d;
  end if;
  if (d ->> 'diferenca')::numeric > 0 then
    return jsonb_build_object('erro', 'Essa troca tem uma diferença a pagar. Atualize a página.');
  end if;
  perform privado.aplicar_troca_de_faixa(p_assinatura, d ->> 'para', (d ->> 'valor_novo')::numeric);
  return d || jsonb_build_object('feito', true);
end
$$;

-- os ids do Asaas da compra (a cobrança do Pix ou o checkout do cartão)
create or replace function public.servidor_compra_asaas(p_chave text, p_compra uuid, p_asaas_id text, p_checkout_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.compras_avulsas
     set asaas_id = coalesce(nullif(p_asaas_id, ''), asaas_id),
         checkout_id = coalesce(nullif(p_checkout_id, ''), checkout_id)
   where id = p_compra;
end
$$;

-- a cobrança avulsa como o Asaas devolveu (sem assinatura): grava, e quando é paga libera o plano por 30 dias ou
-- troca a faixa. Devolve null quando a cobrança não é de uma compra do Publike.
create or replace function public.servidor_pagamento_avulsa(p_chave text, p_pag jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k privado.compras_avulsas;
  antes privado.cobrancas;
  c privado.cobrancas;
  v_status text := upper(coalesce(p_pag ->> 'status', ''));
  v_situacao text;
  v_venc date := (p_pag ->> 'dueDate')::date;
  v_pago timestamptz;
  v_forma text := case when upper(coalesce(p_pag ->> 'billingType', '')) = 'PIX' then 'pix' else 'cartao' end;
  v_link text := p_pag ->> 'invoiceUrl';
  v_ate timestamptz;
  v_ref uuid;
  v_aplicar boolean := false;
begin
  perform privado.exigir_servidor(p_chave);
  perform pg_advisory_xact_lock(hashtext('pagamento:' || coalesce(p_pag ->> 'customer', p_pag ->> 'id')));
  begin
    v_ref := (p_pag ->> 'externalReference')::uuid;
  exception when others then
    v_ref := null;
  end;
  select * into k from privado.compras_avulsas
   where asaas_id = p_pag ->> 'id'
      or (v_ref is not null and id = v_ref)
      or (p_pag ->> 'checkoutSession' is not null and checkout_id = p_pag ->> 'checkoutSession')
   order by (asaas_id = p_pag ->> 'id') desc nulls last
   limit 1;
  if k.id is null or v_venc is null then
    return null;
  end if;
  if k.asaas_id is null then
    update privado.compras_avulsas set asaas_id = p_pag ->> 'id' where id = k.id;
  end if;
  v_situacao := case
    when coalesce((p_pag ->> 'deleted')::boolean, false) then 'cancelada'
    when v_status in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH') then 'paga'
    when v_status in ('REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED',
                      'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL') then 'estornada'
    when v_status = 'OVERDUE' then 'atrasada'
    else 'pendente'
  end;
  if p_pag ->> 'publike_recusada' = 'true' and v_situacao in ('pendente', 'atrasada') then
    v_situacao := 'recusada';
  end if;
  v_pago := case when v_situacao = 'paga'
                 then (coalesce((p_pag ->> 'clientPaymentDate')::date, (p_pag ->> 'confirmedDate')::date,
                                (p_pag ->> 'paymentDate')::date, (now() at time zone 'America/Sao_Paulo')::date)
                       + interval '12 hours') at time zone 'America/Sao_Paulo' end;
  if v_link is not null and v_link !~ '^https://' then
    v_link := null;
  end if;
  select * into antes from privado.cobrancas where asaas_id = p_pag ->> 'id';

  -- até quando vale: os 30 dias contam do pagamento confirmado (agora), ou do fim dos 30 dias que já valem;
  -- a troca de faixa vale até o fim do período já pago da assinatura
  if k.tipo = 'trinta_dias' then
    if v_situacao = 'paga' and k.ate is null then
      select max(x.ate) into v_ate from privado.compras_avulsas x
       where x.conta_id = k.conta_id and x.tipo = 'trinta_dias' and x.situacao = 'paga' and x.id <> k.id;
      v_ate := greatest(now(), coalesce(v_ate, now())) + interval '30 days';
      update privado.compras_avulsas set situacao = 'paga', paga_em = now(), ate = v_ate where id = k.id;
      v_aplicar := true;
    else
      v_ate := coalesce(k.ate, now() + interval '30 days');
    end if;
  else
    select coalesce(max(x.periodo_ate), now()) into v_ate from privado.cobrancas x
     where x.assinatura_id = k.assinatura_id and x.situacao = 'paga' and x.compra_id is null;
    if v_situacao = 'paga' and k.situacao <> 'paga' then
      update privado.compras_avulsas set situacao = 'paga', paga_em = now(), ate = v_ate where id = k.id;
      v_aplicar := true;
    end if;
  end if;

  insert into privado.cobrancas (asaas_id, conta_id, assinatura_id, compra_id, recurso, valor, vencimento, situacao,
                                 forma, pago_em, periodo_ate, link_pagar)
  values (p_pag ->> 'id', k.conta_id, null, k.id, k.recurso, (p_pag ->> 'value')::numeric, v_venc, v_situacao, v_forma,
          v_pago, v_ate, v_link)
  on conflict (asaas_id) do update
    set situacao = excluded.situacao, valor = excluded.valor, vencimento = excluded.vencimento,
        pago_em = coalesce(privado.cobrancas.pago_em, excluded.pago_em),
        periodo_ate = case when privado.cobrancas.situacao = 'paga' then privado.cobrancas.periodo_ate
                           else excluded.periodo_ate end,
        link_pagar = coalesce(excluded.link_pagar, privado.cobrancas.link_pagar), forma = excluded.forma,
        compra_id = excluded.compra_id, atualizado_em = now()
  returning * into c;

  if v_situacao = 'paga' and antes.situacao is distinct from 'paga' then
    if k.tipo = 'trinta_dias' then
      perform privado.recalcular_recurso_pago(k.conta_id, k.recurso);
      perform privado.avisar_pagamento(k.conta_id,
        'Pagamento confirmado: o ' || privado.nome_do_recurso(k.recurso) || ' está liberado até '
        || privado.data_br(c.periodo_ate) || '. Ele não renova sozinho.', '/painel/assinatura');
    elsif v_aplicar then
      perform privado.aplicar_troca_de_faixa(k.assinatura_id, k.recurso, k.valor_renovacao);
    end if;
  elsif v_situacao = 'estornada' and antes.situacao is distinct from 'estornada' then
    update privado.compras_avulsas set situacao = 'estornada' where id = k.id;
    perform privado.recalcular_recurso_pago(k.conta_id, k.recurso);
    perform privado.avisar_pagamento(k.conta_id,
      'O pagamento do ' || privado.nome_do_recurso(k.recurso) || ' foi devolvido.', '/painel/faturas');
  elsif v_situacao = 'cancelada' and k.situacao = 'pendente' then
    update privado.compras_avulsas set situacao = 'cancelada' where id = k.id;
  elsif v_situacao = 'recusada' and antes.situacao is distinct from 'recusada' then
    perform privado.avisar_pagamento(k.conta_id,
      'O cartão não passou na compra do ' || privado.nome_do_recurso(k.recurso) || '. Tente com outro cartão ou com Pix.',
      '/painel/faturas');
  end if;
  return jsonb_build_object('cobranca_id', c.id, 'conta', k.conta_id, 'recurso', k.recurso, 'situacao', c.situacao,
                            'nova', antes.id is null, 'forma', c.forma, 'compra_id', k.id, 'tipo', k.tipo,
                            'tem_pix', c.pix_payload is not null,
                            'paga_agora', v_situacao = 'paga' and antes.situacao is distinct from 'paga',
                            -- a troca de faixa: o servidor muda o valor da renovação no Asaas
                            'trocar_assinatura', case when v_aplicar and k.tipo = 'faixa' then
                              (select jsonb_build_object('asaas_id', a.asaas_id, 'valor', k.valor_renovacao,
                                                         'recurso', k.recurso, 'ciclo', a.ciclo)
                                 from privado.assinaturas a where a.id = k.assinatura_id) end,
                            'sandbox', k.sandbox,
                            'nota', exists (select 1 from privado.notas_fiscais n where n.cobranca_id = c.id));
end
$$;

-- o arrependimento: a cobrança paga há até 7 dias do plano por 30 dias, ou a 1ª do anual. Devolve o que o
-- servidor precisa para estornar no Asaas (e cancelar a assinatura anual), ou o motivo de não poder.
create or replace function public.servidor_pode_devolver(p_chave text, p_conta uuid, p_cobranca uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c privado.cobrancas;
  k privado.compras_avulsas;
  a privado.assinaturas;
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.cobrancas where id = p_cobranca and conta_id = p_conta;
  if c.id is null then
    return jsonb_build_object('erro', 'Não achamos esse pagamento.');
  end if;
  if c.situacao <> 'paga' then
    return jsonb_build_object('erro', 'Só dá para pedir de volta um pagamento confirmado.');
  end if;
  if c.pago_em < now() - interval '7 days' then
    return jsonb_build_object('erro', 'O prazo para desistir é de 7 dias depois do pagamento.');
  end if;
  if c.compra_id is not null then
    select * into k from privado.compras_avulsas where id = c.compra_id;
    if k.tipo <> 'trinta_dias' then
      return jsonb_build_object('erro', 'A troca de faixa não tem devolução.');
    end if;
    return jsonb_build_object('asaas_id', c.asaas_id, 'sandbox', k.sandbox, 'assinatura', null);
  end if;
  select * into a from privado.assinaturas where id = c.assinatura_id;
  if a.ciclo <> 'YEARLY' then
    return jsonb_build_object('erro', 'A devolução em 7 dias é do plano anual e do plano por 30 dias.');
  end if;
  if exists (select 1 from privado.cobrancas x where x.assinatura_id = a.id and x.situacao = 'paga' and x.id <> c.id) then
    return jsonb_build_object('erro', 'A devolução em 7 dias vale para a 1ª compra do anual.');
  end if;
  return jsonb_build_object('asaas_id', c.asaas_id, 'sandbox', a.sandbox, 'assinatura', a.asaas_id);
end
$$;

create or replace function public.servidor_devolvida(p_chave text, p_cobranca uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c privado.cobrancas;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.cobrancas set situacao = 'estornada', atualizado_em = now() where id = p_cobranca
  returning * into c;
  if c.id is null then
    return;
  end if;
  update privado.compras_avulsas set situacao = 'estornada', devolvida_em = now() where id = c.compra_id;
  perform privado.recalcular_recurso_pago(c.conta_id, c.recurso);
  perform privado.avisar_pagamento(c.conta_id,
    'Pedido de devolução feito: o valor do ' || privado.nome_do_recurso(c.recurso)
    || ' volta pela mesma forma de pagamento.', '/painel/faturas');
end
$$;

-- o aviso do fim do plano por 30 dias: 3 dias antes e no dia (nas filas)
create or replace function public.servidor_avisar_fim_avulsas(p_chave text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  for r in
    select k.id, k.conta_id, k.recurso, k.ate, k.aviso_3_dias_em, k.aviso_fim_em
      from privado.compras_avulsas k
     where k.tipo = 'trinta_dias' and k.situacao = 'paga' and k.ate is not null
       -- só a última compra da conta (comprar de novo soma ao fim)
       and k.ate = (select max(x.ate) from privado.compras_avulsas x
                     where x.conta_id = k.conta_id and x.tipo = 'trinta_dias' and x.situacao = 'paga')
       -- quem assinou depois não precisa do aviso
       and not exists (select 1 from privado.assinaturas a where a.conta_id = k.conta_id and a.situacao = 'ativa')
       and ((k.aviso_3_dias_em is null and k.ate <= now() + interval '3 days' and k.ate > now() + interval '1 day')
            or (k.aviso_fim_em is null and k.ate <= now() + interval '1 day' and k.ate > now() - interval '1 day'))
     limit 200
  loop
    if r.aviso_fim_em is null and r.ate <= now() + interval '1 day' then
      update privado.compras_avulsas set aviso_fim_em = now(), aviso_3_dias_em = coalesce(aviso_3_dias_em, now())
       where id = r.id;
      perform privado.avisar_pagamento(r.conta_id,
        'O seu plano de 30 dias acaba hoje (' || privado.data_br(r.ate)
        || '). Compre mais 30 dias ou assine para não fechar os recursos.', '/painel/assinatura');
    else
      update privado.compras_avulsas set aviso_3_dias_em = now() where id = r.id;
      perform privado.avisar_pagamento(r.conta_id,
        'O seu plano de 30 dias acaba em ' || privado.data_br(r.ate)
        || '. Compre mais 30 dias ou assine.', '/painel/assinatura');
    end if;
    n := n + 1;
  end loop;
  return n;
end
$$;

-- ------------------------------------------------------------------ o que as telas leem

create or replace function public.pagamentos_da_conta()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
begin
  if (select auth.uid()) is null or conta is null then
    return null;
  end if;
  return jsonb_build_object(
    'pode', privado.pode_pagar(conta),
    'tipo', (select p.tipo from public.perfis p where p.id = conta),
    'planos', coalesce((select jsonb_agg(jsonb_build_object('id', pl.id, 'recurso', pl.recurso, 'ciclo', pl.ciclo,
                                                           'valor', pl.valor, 'limite_vagas', pl.limite_vagas) order by pl.recurso, pl.ciclo)
                          from privado.planos pl where pl.ligado and pl.valor is not null
                           and (pl.recurso not like 'agencia%' or privado.agencia_verificada(conta))), '[]'::jsonb),
    'assinaturas', coalesce((select jsonb_agg(jsonb_build_object(
                               'id', a.id, 'recurso', a.recurso, 'ciclo', a.ciclo, 'valor', a.valor, 'forma', a.forma,
                               'situacao', a.situacao, 'cartao_final', a.cartao_final,
                               'cartao_bandeira', a.cartao_bandeira,
                               -- a fatura em aberto mais próxima, ou a que o Asaas ainda vai gerar
                               'proxima_cobranca', case when a.situacao <> 'cancelada' then coalesce(
                                 (select min(c.vencimento) from privado.cobrancas c
                                   where c.assinatura_id = a.id and c.situacao in ('pendente', 'atrasada', 'recusada')),
                                 a.proxima_cobranca) end,
                               'criada_em', a.criada_em, 'cancelada_em', a.cancelada_em,
                               'pago_ate', (select max(c.periodo_ate) from privado.cobrancas c
                                             where c.assinatura_id = a.id and c.situacao = 'paga'),
                               -- o arrependimento do anual: a 1ª cobrança paga há até 7 dias
                               'devolver', case when a.ciclo = 'YEARLY' and a.situacao <> 'cancelada' then
                                 (select jsonb_build_object('cobranca', c.id, 'ate', c.pago_em + interval '7 days',
                                                            'valor', c.valor)
                                    from privado.cobrancas c
                                   where c.assinatura_id = a.id and c.situacao = 'paga'
                                     and c.pago_em > now() - interval '7 days'
                                     and (select count(*) from privado.cobrancas x
                                           where x.assinatura_id = a.id and x.situacao = 'paga') = 1
                                   limit 1) end)
                               order by a.criada_em desc)
                              from privado.assinaturas a
                             where a.conta_id = conta
                               and (a.situacao <> 'pendente' or a.asaas_id is not null)),
                            '[]'::jsonb),
    -- os planos de 30 dias que valem ou esperam o pagamento, e as trocas de faixa esperando
    'compras', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', k.id, 'tipo', k.tipo, 'recurso', k.recurso, 'valor', k.valor, 'forma', k.forma,
                           'situacao', k.situacao, 'ate', k.ate, 'paga_em', k.paga_em, 'criada_em', k.criada_em,
                           'cobranca', (select c.id from privado.cobrancas c where c.compra_id = k.id
                                         order by c.criada_em desc limit 1),
                           'devolver', k.tipo = 'trinta_dias' and k.situacao = 'paga'
                                       and k.paga_em > now() - interval '7 days')
                           order by k.criada_em desc)
                          from privado.compras_avulsas k
                         where k.conta_id = conta
                           and ((k.situacao = 'paga' and k.tipo = 'trinta_dias' and k.ate > now())
                                or (k.situacao = 'pendente' and k.asaas_id is not null
                                    and k.criada_em > now() - interval '3 days'))), '[]'::jsonb),
    'cliente', (select jsonb_build_object('cpf_cnpj', c.cpf_cnpj, 'nome', c.nome, 'email', c.email)
                  from privado.clientes_pagamento c where c.conta_id = conta),
    'testes_ate', (select jsonb_object_agg(x.recurso, x.fim) from privado.experimentos x
                    where x.conta_id = conta and x.fim > now()),
    'pago_ate', (select jsonb_object_agg(q.recurso, q.ate)
                   from (select c.recurso, max(c.periodo_ate) as ate from privado.cobrancas c
                          where c.conta_id = conta and c.situacao = 'paga' group by c.recurso) q
                  where q.ate > now())
  );
end
$$;

-- a diferença da troca de faixa, para a tela (a conta de quem está vendo)
create or replace function public.minha_diferenca_de_faixa(p_assinatura uuid, p_recurso text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not exists (select 1 from privado.assinaturas a where a.id = p_assinatura and a.conta_id = public.conta_atual()) then
    return null;
  end if;
  return privado.diferenca_de_faixa(p_assinatura, p_recurso);
end
$$;
revoke all on function public.minha_diferenca_de_faixa(uuid, text) from public, anon;
grant execute on function public.minha_diferenca_de_faixa(uuid, text) to authenticated;

-- a fatura: a cobrança avulsa não tem ciclo; diz o que foi comprado
create or replace function public.minha_fatura(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', c.id, 'numero', c.numero, 'recurso', c.recurso, 'valor', c.valor, 'vencimento', c.vencimento,
           'situacao', c.situacao, 'forma', c.forma, 'pago_em', c.pago_em, 'periodo_ate', c.periodo_ate,
           'link_pagar', c.link_pagar, 'pix_payload', c.pix_payload, 'pix_expira', c.pix_expira,
           'asaas_id', c.asaas_id,
           'ciclo', a.ciclo,
           'compra', (select k.tipo from privado.compras_avulsas k where k.id = c.compra_id),
           'conta', jsonb_build_object('nome', coalesce(cl.nome, p.nome), 'cpf_cnpj', cl.cpf_cnpj),
           'nota', (select jsonb_build_object('situacao', n.situacao, 'numero', n.numero, 'asaas_id', n.asaas_id)
                      from privado.notas_fiscais n where n.cobranca_id = c.id
                     order by n.atualizado_em desc limit 1))
    from privado.cobrancas c
    join public.perfis p on p.id = c.conta_id
    left join privado.assinaturas a on a.id = c.assinatura_id
    left join privado.clientes_pagamento cl on cl.conta_id = c.conta_id
   where (select auth.uid()) is not null and c.id = p_id and c.conta_id = public.conta_atual()
$$;

create or replace function public.minhas_faturas()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'numero', c.numero, 'recurso', c.recurso, 'valor', c.valor, 'vencimento', c.vencimento,
           'situacao', c.situacao, 'forma', c.forma, 'pago_em', c.pago_em, 'link_pagar', c.link_pagar,
           'compra', (select k.tipo from privado.compras_avulsas k where k.id = c.compra_id),
           'nota', (select jsonb_build_object('situacao', n.situacao, 'numero', n.numero)
                      from privado.notas_fiscais n where n.cobranca_id = c.id
                     order by n.atualizado_em desc limit 1))
           order by c.vencimento desc, c.numero desc), '[]'::jsonb)
    from privado.cobrancas c
   where (select auth.uid()) is not null and c.conta_id = public.conta_atual()
$$;

-- o Pix e a nota da fatura: a compra avulsa também diz se é do sandbox
create or replace function public.servidor_pagamento_cobranca_da_conta(p_chave text, p_conta uuid, p_cobranca uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (select jsonb_build_object('id', c.id, 'asaas_id', c.asaas_id, 'situacao', c.situacao, 'forma', c.forma,
                                    'pix_payload', c.pix_payload, 'pix_expira', c.pix_expira,
                                    'sandbox', coalesce((select a.sandbox from privado.assinaturas a
                                                          where a.id = c.assinatura_id),
                                                        (select k.sandbox from privado.compras_avulsas k
                                                          where k.id = c.compra_id), false),
                                    'nota_asaas', (select n.asaas_id from privado.notas_fiscais n
                                                    where n.cobranca_id = c.id and n.situacao = 'autorizada'
                                                    order by n.atualizado_em desc limit 1))
            from privado.cobrancas c where c.id = p_cobranca and c.conta_id = p_conta);
end
$$;

revoke all on privado.compras_avulsas from public, anon, authenticated;
revoke execute on function public.servidor_compra_nova(text, uuid, text, uuid, uuid, text, boolean),
  public.servidor_compra_asaas(text, uuid, text, text), public.servidor_pagamento_avulsa(text, jsonb),
  public.servidor_pode_devolver(text, uuid, uuid), public.servidor_devolvida(text, uuid),
  public.servidor_avisar_fim_avulsas(text), public.servidor_faixa_sem_pagar(text, uuid, uuid, uuid)
  from public;
-- como as outras do servidor: a chave do servidor (p_chave) é quem protege
grant execute on function public.servidor_compra_nova(text, uuid, text, uuid, uuid, text, boolean),
  public.servidor_compra_asaas(text, uuid, text, text), public.servidor_pagamento_avulsa(text, jsonb),
  public.servidor_pode_devolver(text, uuid, uuid), public.servidor_devolvida(text, uuid),
  public.servidor_avisar_fim_avulsas(text), public.servidor_faixa_sem_pagar(text, uuid, uuid, uuid)
  to anon, authenticated, service_role;
revoke execute on function privado.diferenca_de_faixa(uuid, text), privado.aplicar_troca_de_faixa(uuid, text, numeric),
  privado.dias_do_ciclo(text) from public;
