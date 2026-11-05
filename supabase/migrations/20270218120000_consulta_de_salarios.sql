-- A consulta de salários para quem contrata (05/11/2026; claude/plano-consulta-de-salarios.md, parte 1): a faixa do
-- Novo Caged de uma função nas praças e em Goiás, o que as vagas do Publike oferecem (agregado) e a sugestão de valor.
-- Cada conta que contrata (comércio, empresa, agência) ganha 5 consultas de boas-vindas e mais 2 a cada 5 vagas novas
-- que forem ao ar (contadas uma vez, depois de 24 horas no Publike; da estreia desta migração em diante). A mesma
-- função de novo em 30 dias não gasta; função sem dados não gasta. Quem assina a Consulta de salários (R$ 29,90 por
-- mês, o recurso pago 'salarios') ou o Plano Completo consulta sem limite. Rode depois de
-- 20270217120000_banner_em_varios_formatos.sql (e da 20270131120000_salarios_do_mercado.sql). Pode rodar de novo.

-- 1. O recurso pago --------------------------------------------------------------------------------------------------
create table if not exists privado.salarios_contas (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  liberado_em timestamptz not null default now(),
  -- null: sem prazo (liberado pelo Publike); com data: o período pago
  ate timestamptz
);
alter table privado.salarios_contas enable row level security;
revoke all on privado.salarios_contas from public, anon, authenticated;

alter table privado.planos drop constraint if exists planos_recurso_check;
alter table privado.planos add constraint planos_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo', 'salarios'));
alter table privado.assinaturas drop constraint if exists assinaturas_recurso_check;
alter table privado.assinaturas add constraint assinaturas_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo', 'salarios'));
alter table privado.cobrancas drop constraint if exists cobrancas_recurso_check;
alter table privado.cobrancas add constraint cobrancas_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo', 'salarios'));

-- o mensal já com o preço (R$ 29,90, decisão de 05/11/2026), desligado: liga em Admin › Pagamentos
insert into privado.planos (recurso, ciclo, valor) values ('salarios', 'MONTHLY', 29.90), ('salarios', 'QUARTERLY', null)
on conflict (recurso, ciclo) do nothing;

create or replace function privado.salarios_liberado(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.salarios_contas v
                  where v.conta_id = p_conta and (v.ate is null or v.ate > now()))
$$;

-- nos avisos de pagamento: "Assinatura do recurso Consulta de salários feita com o cartão."
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
           when 'salarios' then 'recurso Consulta de salários'
           when 'video' then 'recurso Entrevista em vídeo'
           when 'automacoes' then 'recurso Automações personalizadas'
           else 'Teste Prático' end
$function$;

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
    perform privado.recalcular_recurso_pago(p_conta, 'salarios');
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
  elsif p_recurso = 'salarios' then
    insert into privado.salarios_contas (conta_id, liberado_em, ate) values (p_conta, now(), v_novo)
    on conflict (conta_id) do update set ate = excluded.ate;
  else
    insert into privado.testes_contas (conta_id, liberado_em, ate) values (p_conta, now(), v_novo)
    on conflict (conta_id) do update set ate = excluded.ate;
  end if;
end
$function$;

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
  foreach r in array array['copiloto', 'testes', 'video', 'automacoes', 'salarios'] loop
    if r = 'copiloto' then
      select true, c.ate into tem, ate_ from privado.copiloto_contas c where c.conta_id = conta;
    elsif r = 'video' then
      select true, v.ate into tem, ate_ from privado.video_contas v where v.conta_id = conta;
    elsif r = 'automacoes' then
      select true, v.ate into tem, ate_ from privado.automacoes_contas v where v.conta_id = conta;
    elsif r = 'salarios' then
      select true, v.ate into tem, ate_ from privado.salarios_contas v where v.conta_id = conta;
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
      -- a Consulta de salários não tem dias grátis: tem as consultas grátis (as de boas-vindas e as das vagas)
      'pode_experimentar', coalesce(contrata, false) and e.conta_id is null and r <> 'salarios'
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
    v_recurso := case when v_desc like '%sal_rio%' then 'salarios'
                      when v_desc like '%completo%' then 'completo'
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

create or replace function public.servidor_pagamento_contexto(p_chave text, p_conta uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform privado.exigir_servidor(p_chave);
  return jsonb_build_object(
    'pode', privado.pode_pagar(p_conta),
    'sandbox', coalesce((select t.sandbox from privado.pagamentos_teste t where t.conta_id = p_conta), false),
    'nome', (select p.nome from public.perfis p where p.id = p_conta),
    'email', (select u.email from auth.users u where u.id = p_conta),
    'cliente', (select jsonb_build_object('asaas_id', c.asaas_id, 'cpf_cnpj', c.cpf_cnpj, 'nome', c.nome,
                                          'email', c.email, 'sandbox', c.sandbox)
                  from privado.clientes_pagamento c where c.conta_id = p_conta),
    'planos', coalesce((select jsonb_agg(jsonb_build_object('id', pl.id, 'recurso', pl.recurso, 'ciclo', pl.ciclo,
                                                           'valor', pl.valor))
                          from privado.planos pl where pl.ligado and pl.valor is not null), '[]'::jsonb),
    'ativas', coalesce((select jsonb_agg(a.recurso) from privado.assinaturas a
                         where a.conta_id = p_conta
                           and (a.situacao = 'ativa' or (a.situacao = 'pendente' and a.asaas_id is not null))),
                       '[]'::jsonb),
    'sem_prazo', jsonb_build_object(
      'copiloto', exists (select 1 from privado.copiloto_contas c where c.conta_id = p_conta and c.ate is null),
      'testes', exists (select 1 from privado.testes_contas t where t.conta_id = p_conta and t.ate is null),
      'video', exists (select 1 from privado.video_contas v where v.conta_id = p_conta and v.ate is null),
      'automacoes', exists (select 1 from privado.automacoes_contas v where v.conta_id = p_conta and v.ate is null),
      'salarios', exists (select 1 from privado.salarios_contas v where v.conta_id = p_conta and v.ate is null)),
    'testes_ate', (select jsonb_object_agg(x.recurso, x.fim) from privado.experimentos x
                    where x.conta_id = p_conta and x.fim > now()),
    -- até quando já está pago (assinar de novo, ou trocar o cartão, começa a cobrar daí)
    'pago_ate', (select jsonb_object_agg(q.recurso, q.ate)
                   from (select c.recurso, max(c.periodo_ate) as ate from privado.cobrancas c
                          where c.conta_id = p_conta and c.situacao = 'paga' group by c.recurso) q
                  where q.ate > now()),
    'nota', (select jsonb_build_object('servico', c.servico_nota, 'e_codigo', c.servico_nota_e_codigo,
                                       'descricao', c.descricao_nota)
               from privado.config_pagamentos c where c.id and c.servico_nota is not null)
  );
end
$function$;

-- 2. As consultas e os créditos --------------------------------------------------------------------------------------
-- a estreia: só as vagas criadas daqui para frente rendem consultas
create table if not exists privado.config_salarios (
  id boolean primary key default true check (id),
  inicio timestamptz not null default now()
);
alter table privado.config_salarios enable row level security;
revoke all on privado.config_salarios from public, anon, authenticated;
insert into privado.config_salarios (id) values (true) on conflict (id) do nothing;

create table if not exists privado.creditos_salario (
  id bigint generated always as identity primary key,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  quantos integer not null check (quantos between 1 and 1000),
  -- boas_vindas: as 5 do começo; vagas: 2 a cada 5 vagas novas; admin: dadas pela equipe
  motivo text not null check (motivo in ('boas_vindas', 'vagas', 'admin')),
  criado_em timestamptz not null default now()
);
create unique index if not exists creditos_salario_boas_vindas on privado.creditos_salario (conta_id)
  where motivo = 'boas_vindas';
create index if not exists creditos_salario_conta on privado.creditos_salario (conta_id);
alter table privado.creditos_salario enable row level security;
revoke all on privado.creditos_salario from public, anon, authenticated;

-- as vagas que já entraram na conta das consultas (cada uma uma vez; sem chave para o anúncio: apagar a vaga depois
-- não devolve nem tira nada)
create table if not exists privado.vagas_contadas_salario (
  anuncio_id uuid primary key,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  contada_em timestamptz not null default now()
);
create index if not exists vagas_contadas_salario_conta on privado.vagas_contadas_salario (conta_id);
alter table privado.vagas_contadas_salario enable row level security;
revoke all on privado.vagas_contadas_salario from public, anon, authenticated;

-- cada consulta aberta: gastou (uma das consultas) ou não (quem assina, ou a mesma função em 30 dias)
create table if not exists privado.consultas_salario (
  id bigint generated always as identity primary key,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  -- quem da conta abriu (a pessoa da equipe, na agência)
  pessoa_id uuid,
  cbo text not null check (cbo ~ '^[0-9]{6}$'),
  gastou boolean not null,
  criado_em timestamptz not null default now()
);
create index if not exists consultas_salario_conta on privado.consultas_salario (conta_id, cbo, criado_em desc);
alter table privado.consultas_salario enable row level security;
revoke all on privado.consultas_salario from public, anon, authenticated;

create or replace function privado.contrata(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfis p where p.id = p_conta and p.tipo in ('comercio', 'empresa', 'agencia'))
$$;

create or replace function privado.saldo_salario(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, coalesce((select sum(c.quantos) from privado.creditos_salario c where c.conta_id = p_conta), 0)
                     - (select count(*) from privado.consultas_salario q where q.conta_id = p_conta and q.gastou))::integer
$$;

create or replace function privado.salario_consultado(p_conta uuid, p_cbo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.consultas_salario q
                  where q.conta_id = p_conta and q.cbo = p_cbo and q.criado_em > now() - interval '30 days')
$$;

-- o saldo e o que a tela mostra (dá as 5 de boas-vindas na primeira vez). Null: sem login ou conta que não contrata.
create or replace function public.salarios_da_conta()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  contadas integer;
begin
  if (select auth.uid()) is null or conta is null or not privado.contrata(conta) then
    return null;
  end if;
  insert into privado.creditos_salario (conta_id, quantos, motivo) values (conta, 5, 'boas_vindas')
  on conflict (conta_id) where motivo = 'boas_vindas' do nothing;
  select count(*) into contadas from privado.vagas_contadas_salario v where v.conta_id = conta;
  return jsonb_build_object(
    'saldo', privado.saldo_salario(conta),
    'assinante', privado.salarios_liberado(conta),
    -- quantas vagas faltam para as próximas 2
    'vagas_faltam', 5 - (contadas % 5),
    'consultadas', coalesce((select jsonb_agg(jsonb_build_object('cbo', q.cbo, 'em', q.em) order by q.em desc)
                               from (select c.cbo, max(c.criado_em) as em from privado.consultas_salario c
                                      where c.conta_id = conta and c.criado_em > now() - interval '30 days'
                                      group by c.cbo) q), '[]'::jsonb));
end
$$;
revoke execute on function public.salarios_da_conta() from public, anon;
grant execute on function public.salarios_da_conta() to authenticated;

-- abrir a consulta de uma função: gasta uma (sem assinatura e sem ter aberto a mesma em 30 dias). Um de cada vez por
-- conta: dois cliques juntos gastam uma só.
create or replace function public.consultar_salario(p_cbo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  assina boolean;
  repetida boolean;
  saldo integer;
begin
  if (select auth.uid()) is null or conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if not privado.contrata(conta) then
    raise exception 'A consulta de salários é para quem contrata.' using errcode = '42501';
  end if;
  if p_cbo is null or p_cbo !~ '^[0-9]{6}$' then
    raise exception 'Função inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('salario:' || conta::text));
  insert into privado.creditos_salario (conta_id, quantos, motivo) values (conta, 5, 'boas_vindas')
  on conflict (conta_id) where motivo = 'boas_vindas' do nothing;
  -- sem dados (menos de 30 contratações em Goiás): não gasta
  if not exists (select 1 from privado.salarios_mercado s where s.cbo = p_cbo) then
    return jsonb_build_object('ok', false, 'motivo', 'sem_dados', 'saldo', privado.saldo_salario(conta));
  end if;
  assina := privado.salarios_liberado(conta);
  repetida := privado.salario_consultado(conta, p_cbo);
  saldo := privado.saldo_salario(conta);
  if not assina and not repetida and saldo <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'sem_saldo', 'saldo', 0);
  end if;
  insert into privado.consultas_salario (conta_id, pessoa_id, cbo, gastou)
  values (conta, (select auth.uid()), p_cbo, not assina and not repetida);
  return jsonb_build_object('ok', true, 'gastou', not assina and not repetida,
                            'saldo', privado.saldo_salario(conta));
end
$$;
revoke execute on function public.consultar_salario(text) from public, anon;
grant execute on function public.consultar_salario(text) to authenticated;

-- a consulta completa de uma função (só para quem assina ou abriu a função nos últimos 30 dias; senão, null): as
-- faixas de cada região e o que as vagas do Publike das cidades pedidas oferecem por mês, nos últimos 90 dias, só
-- com 5 vagas ou mais de 3 contas ou mais (ninguém descobre o salário de uma empresa)
create or replace function public.consulta_de_salario(p_cbo text, p_cidades text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  pub jsonb;
begin
  if (select auth.uid()) is null or conta is null or p_cbo is null then
    return null;
  end if;
  if not (privado.salarios_liberado(conta) or privado.salario_consultado(conta, p_cbo)) then
    return null;
  end if;
  select case when count(*) >= 5 and count(distinct a.autor_id) >= 3 then
           jsonb_build_object('n', count(*), 'contas', count(distinct a.autor_id),
             'p25', round(percentile_cont(0.25) within group (order by a.pagamento_valor)::numeric, 2),
             'p50', round(percentile_cont(0.5) within group (order by a.pagamento_valor)::numeric, 2),
             'p75', round(percentile_cont(0.75) within group (order by a.pagamento_valor)::numeric, 2))
         end
    into pub
    from public.anuncios a
    join privado.funcoes_das_vagas f on f.anuncio_id = a.id
   where f.cbo = p_cbo and a.tipo = 'vaga' and a.status in ('ativo', 'pausado', 'encerrado', 'expirado')
     and a.criado_em > now() - interval '90 days'
     and a.pagamento_valor is not null and a.pagamento_unidade = 'mes'
     and lower(a.cidade) = any (select lower(x) from unnest(coalesce(p_cidades, '{}')) x);
  return jsonb_build_object(
    'regioes', coalesce((select jsonb_agg(jsonb_build_object('regiao', s.regiao, 'cbo', s.cbo, 'de', s.de, 'ate', s.ate,
                                                             'n', s.n, 'p25', s.p25, 'p50', s.p50, 'p75', s.p75))
                           from privado.salarios_mercado s where s.cbo = p_cbo), '[]'::jsonb),
    'publike', pub);
end
$$;
revoke execute on function public.consulta_de_salario(text, text[]) from public, anon;
grant execute on function public.consulta_de_salario(text, text[]) to authenticated;

-- as experiências das pessoas da aba Talentos nas cidades pedidas (sem nome nem contato: o site só conta quantas
-- combinam com a função). Só para quem contrata.
create or replace function public.experiencias_da_vitrine(p_cidades text[])
returns table (perfil_id uuid, experiencias jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
begin
  if (select auth.uid()) is null or conta is null or not privado.contrata(conta) then
    return;
  end if;
  return query
  select c.perfil_id, c.experiencias
    from public.curriculo_na_vitrine v
    join public.curriculos c on c.perfil_id = v.perfil_id
    join public.perfis p on p.id = v.perfil_id
   where p.tipo = 'pessoa'
     and (p.suspenso_ate is null or p.suspenso_ate < now())
     and lower(p.cidade) = any (select lower(x) from unnest(coalesce(p_cidades, '{}')) x)
     and not privado.ha_bloqueio(conta, p.id)
   order by c.atualizado_em desc
   limit 1000;
end
$$;
revoke execute on function public.experiencias_da_vitrine(text[]) from public, anon;
grant execute on function public.experiencias_da_vitrine(text[]) to authenticated;

-- 3. As consultas pelas vagas (o robô das filas, a cada 5 minutos) ---------------------------------------------------
-- conta as vagas novas que estão no Publike há 24 horas (no ar, pausadas, encerradas ou vencidas: passaram pela
-- moderação; as removidas e as em análise não) e dá 2 consultas a cada 5, com o aviso no sino (e no e-mail, como as
-- funcionalidades liberadas). Devolve quantas contas ganharam.
create or replace function public.servidor_creditos_salario(p_chave text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  devidos integer;
  ja integer;
  ganharam integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.vagas_contadas_salario (anuncio_id, conta_id)
  select a.id, a.autor_id
    from public.anuncios a
   where a.tipo = 'vaga' and a.status in ('ativo', 'pausado', 'encerrado', 'expirado')
     and a.criado_em >= (select c.inicio from privado.config_salarios c where c.id)
     and a.criado_em <= now() - interval '24 hours'
     and privado.contrata(a.autor_id)
  on conflict (anuncio_id) do nothing;
  for r in select v.conta_id, count(*)::integer as n from privado.vagas_contadas_salario v group by v.conta_id loop
    devidos := (r.n / 5) * 2;
    select coalesce(sum(c.quantos), 0) into ja from privado.creditos_salario c
     where c.conta_id = r.conta_id and c.motivo = 'vagas';
    if devidos > ja then
      insert into privado.creditos_salario (conta_id, quantos, motivo) values (r.conta_id, devidos - ja, 'vagas');
      insert into public.notificacoes (destinatario_id, tipo, texto, link)
      values (r.conta_id, 'liberacao',
              'Você ganhou ' || (devidos - ja) || ' consultas de salário por publicar vagas no Publike. Veja quanto o mercado paga para cada função.',
              '/painel/salarios');
      ganharam := ganharam + 1;
    end if;
  end loop;
  return ganharam;
end
$$;
revoke execute on function public.servidor_creditos_salario(text) from public;
grant execute on function public.servidor_creditos_salario(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
