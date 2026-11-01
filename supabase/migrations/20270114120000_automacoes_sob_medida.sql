-- O fluxo de contratar e as automações sob medida (claude/plano-fluxo-contratar.md, partes 5 e 6). Pode rodar de
-- novo. Rode depois de 20270113120000_contas_apagadas.sql.
--   * "Automações sob medida" vira o quarto recurso pago (15 dias grátis, preço no Admin, assinatura pelo Asaas), como
--     a Triagem com IA, o Teste Prático e a Entrevista em vídeo. Sem ele, as automações prontas continuam: cada regra
--     liga e desliga com o texto e os prazos do Publike. Com ele: o texto do recado, os prazos, a mensagem por etapa,
--     as regras com condição (a pergunta eliminatória, a Triagem) e copiar as regras para as outras vagas e as novas.
--     O banco confere ao salvar (o site também esconde).
--   * A regra nova (grátis, desligada por padrão): marcar a vaga como preenchida quando o número de contratados
--     chega ao "Quantas pessoas" da vaga. Quem se candidatou recebe o aviso de vaga preenchida, como no botão.

-- 1. O recurso ------------------------------------------------------------------------------------
create table if not exists privado.automacoes_contas (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  liberado_em timestamptz not null default now(),
  -- null: sem prazo (liberado pelo Admin); com data: os dias grátis ou o período pago
  ate timestamptz
);
alter table privado.automacoes_contas enable row level security;
revoke all on privado.automacoes_contas from public, anon, authenticated;

alter table privado.experimentos drop constraint if exists experimentos_recurso_check;
alter table privado.experimentos add constraint experimentos_recurso_check
  check (recurso in ('copiloto', 'testes', 'video', 'automacoes'));
alter table privado.planos drop constraint if exists planos_recurso_check;
alter table privado.planos add constraint planos_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes'));
alter table privado.assinaturas drop constraint if exists assinaturas_recurso_check;
alter table privado.assinaturas add constraint assinaturas_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes'));
alter table privado.cobrancas drop constraint if exists cobrancas_recurso_check;
alter table privado.cobrancas add constraint cobrancas_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes'));

-- o preço fica no Admin (desligado e sem valor até o Admin pôr)
insert into privado.planos (recurso, ciclo) values ('automacoes', 'MONTHLY'), ('automacoes', 'QUARTERLY')
on conflict (recurso, ciclo) do nothing;

create or replace function privado.automacoes_liberado(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.automacoes_contas v
                  where v.conta_id = p_conta and (v.ate is null or v.ate > now()))
$$;

create or replace function public.admin_liberar_automacoes(p_conta uuid, p_liberar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_liberar then
    if not exists (select 1 from public.perfis p where p.id = p_conta) then
      raise exception 'Conta não encontrada.' using errcode = 'P0001';
    end if;
    insert into privado.automacoes_contas (conta_id) values (p_conta)
    on conflict (conta_id) do update set ate = null;
  else
    delete from privado.automacoes_contas where conta_id = p_conta;
  end if;
end
$$;

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
  select max(c.periodo_ate) + interval '3 days' into v_pago
    from privado.cobrancas c
   where c.conta_id = p_conta and c.recurso in (p_recurso, 'combo') and c.situacao = 'paga';
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
                         and (a.recurso = r or (a.recurso = 'combo' and r in ('copiloto', 'testes'))));
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
      'pode_assinar', pagar and not assina and not (combo and r in ('copiloto', 'testes'))
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

create or replace function public.experimentar_recurso(p_recurso text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  conta uuid := public.conta_atual();
  v_fim timestamptz := now() + interval '15 days';
begin
  perform privado.exigir_conta_ativa();
  if p_recurso not in ('copiloto', 'testes', 'video', 'automacoes') then
    raise exception 'Pedido inválido.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.perfis p where p.id = conta and p.tipo in ('comercio', 'empresa', 'agencia')) then
    raise exception 'Os 15 dias grátis são para contas de comércio, empresa ou agência.' using errcode = 'P0001';
  end if;
  if (p_recurso = 'copiloto' and privado.copiloto_liberado(conta))
     or (p_recurso = 'testes' and privado.testes_liberado(conta))
     or (p_recurso = 'video' and privado.video_liberado(conta))
     or (p_recurso = 'automacoes' and privado.automacoes_liberado(conta)) then
    raise exception 'Este recurso já está liberado para a sua conta.' using errcode = 'P0001';
  end if;
  if exists (select 1 from privado.experimentos x where x.conta_id = conta and x.recurso = p_recurso) then
    raise exception 'Sua conta já usou os 15 dias grátis. Toque em “Quero continuar” e a gente fala com você.'
      using errcode = 'P0001', hint = 'ja_experimentou';
  end if;
  insert into privado.experimentos (conta_id, recurso, fim, pessoa_id)
  values (conta, p_recurso, v_fim, (select p.id from public.perfis p where p.id = (select auth.uid())));
  if p_recurso = 'copiloto' then
    insert into privado.copiloto_contas (conta_id, liberado_em, ate) values (conta, now(), v_fim)
    on conflict (conta_id) do update set liberado_em = now(), ate = excluded.ate;
  elsif p_recurso = 'video' then
    insert into privado.video_contas (conta_id, liberado_em, ate) values (conta, now(), v_fim)
    on conflict (conta_id) do update set liberado_em = now(), ate = excluded.ate;
  elsif p_recurso = 'automacoes' then
    insert into privado.automacoes_contas (conta_id, liberado_em, ate) values (conta, now(), v_fim)
    on conflict (conta_id) do update set liberado_em = now(), ate = excluded.ate;
  else
    insert into privado.testes_contas (conta_id, liberado_em, ate) values (conta, now(), v_fim)
    on conflict (conta_id) do update set liberado_em = now(), ate = excluded.ate;
  end if;
  return v_fim;
end
$function$;

create or replace function public.admin_recursos_da_conta(p_conta uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'copiloto', (select jsonb_build_object('ate', c.ate, 'liberado', c.ate is null or c.ate > now())
                   from privado.copiloto_contas c where c.conta_id = p_conta),
    'testes', (select jsonb_build_object('ate', t.ate, 'liberado', t.ate is null or t.ate > now())
                 from privado.testes_contas t where t.conta_id = p_conta),
    'video', (select jsonb_build_object('ate', v.ate, 'liberado', v.ate is null or v.ate > now())
                from privado.video_contas v where v.conta_id = p_conta),
    'automacoes', (select jsonb_build_object('ate', v.ate, 'liberado', v.ate is null or v.ate > now())
                     from privado.automacoes_contas v where v.conta_id = p_conta),
    'experimentos', coalesce((select jsonb_agg(jsonb_build_object('recurso', e.recurso, 'inicio', e.inicio,
                                'fim', e.fim, 'quer_continuar_em', e.quer_continuar_em) order by e.inicio)
                                from privado.experimentos e where e.conta_id = p_conta), '[]'::jsonb))
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
    'nome', (select p.nome from public.perfis p where p.id = p_conta),
    'email', (select u.email from auth.users u where u.id = p_conta),
    'cliente', (select jsonb_build_object('asaas_id', c.asaas_id, 'cpf_cnpj', c.cpf_cnpj, 'nome', c.nome,
                                          'email', c.email)
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
      'automacoes', exists (select 1 from privado.automacoes_contas v where v.conta_id = p_conta and v.ate is null)),
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
    v_recurso := case when v_desc like '%combo%' then 'combo'
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

create or replace function privado.nome_do_recurso(p_recurso text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_recurso
           when 'copiloto' then 'recurso Triagem com IA'
           when 'combo' then 'combo Triagem + Teste Prático'
           when 'video' then 'recurso Entrevista em vídeo'
           when 'automacoes' then 'recurso Automações sob medida'
           else 'Teste Prático' end
$function$;

-- 2. A regra nova e as prontas --------------------------------------------------------------------------------
alter table public.automacoes_vaga
  add column if not exists preencher_ao_completar boolean not null default false;

alter table privado.automacoes_feitas drop constraint if exists automacoes_feitas_regra_check;
alter table privado.automacoes_feitas add constraint automacoes_feitas_regra_check
  check (regra in ('dispensar', 'mensagem', 'parado', 'recado', 'triagem', 'encerrar', 'preenchida', 'horarios',
                   'completa'));

create or replace function privado.regras_em_json(r public.automacoes_vaga)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'dispensar_eliminados', coalesce(r.dispensar_eliminados, false),
    'mensagens', coalesce(r.mensagens, '{}'::jsonb),
    'parado_dias', r.parado_dias,
    'recado', r.recado,
    'triagem_para_analise', coalesce(r.triagem_para_analise, false),
    'encerrar_dias', r.encerrar_dias,
    'encerrar_ao_preencher', coalesce(r.encerrar_ao_preencher, false),
    'horarios', r.horarios,
    'preencher_ao_completar', coalesce(r.preencher_ao_completar, false))
$$;

-- o que as automações prontas usam (o texto e os prazos do Publike); o resto é das Automações sob medida
create or replace function privado.recado_pronto()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Oi, {nome}! Aqui é {empresa}: recebemos a sua candidatura para {vaga}. Vamos olhar com atenção e responder em até 5 dias.'::text
$$;

-- confere e grava as regras de uma vaga. p_estrito: um erro para o que não vale (a tela); sem ele, o que não vale
-- fica de fora (o padrão aplicado numa vaga nova, quando uma mensagem pronta já foi apagada). Sem as Automações sob
-- medida, só as prontas: o recado com o texto do Publike, o lembrete em 5 dias, o retorno em 7, sem mensagem por
-- etapa e sem as regras com condição.
create or replace function privado.aplicar_automacoes(p_anuncio uuid, p_conta uuid, p_eu uuid, p_regras jsonb,
                                                     p_estrito boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb := coalesce(p_regras, '{}'::jsonb);
  v_mensagens jsonb := '{}'::jsonb;
  k text;
  v text;
  v_parado integer;
  v_encerrar integer;
  v_recado text := nullif(btrim(coalesce(r ->> 'recado', '')), '');
  v_horarios jsonb;
  v_formato text;
  v_local text;
  v_duracao integer;
  v_medida boolean := privado.automacoes_liberado(p_conta);
  v_dispensar boolean := coalesce((r ->> 'dispensar_eliminados')::boolean, false);
  v_triagem boolean := coalesce((r ->> 'triagem_para_analise')::boolean, false);
  x public.automacoes_vaga;
begin
  if jsonb_typeof(r) <> 'object' then
    raise exception 'Confira as automações.' using errcode = '22023';
  end if;
  -- a mensagem pronta por etapa: as de hoje e as próprias da conta
  if jsonb_typeof(r -> 'mensagens') = 'object' then
    for k, v in select * from jsonb_each_text(r -> 'mensagens') loop
      continue when coalesce(v, '') = '';
      if not (k in ('analise', 'entrevista', 'contratado')
              or (k ~ '^sub:[0-9a-f-]{36}$'
                  and exists (select 1 from public.etapas_da_conta e
                               where e.id::text = substr(k, 5) and e.conta_id = p_conta)))
         or v !~ '^[0-9a-f-]{36}$'
         or not exists (select 1 from public.modelos_mensagem m
                         where m.id::text = v and m.autor_id in (p_eu, p_conta)) then
        if p_estrito then
          raise exception 'Mensagem pronta não encontrada.' using errcode = '22023';
        end if;
        continue;
      end if;
      v_mensagens := v_mensagens || jsonb_build_object(k, v);
    end loop;
  end if;
  v_parado := nullif(r ->> 'parado_dias', '')::integer;
  if v_parado is not null and v_parado not between 2 and 30 then
    if p_estrito then raise exception 'O lembrete vai de 2 a 30 dias.' using errcode = '22023'; end if;
    v_parado := null;
  end if;
  v_encerrar := nullif(r ->> 'encerrar_dias', '')::integer;
  if v_encerrar is not null and v_encerrar not between 3 and 60 then
    if p_estrito then raise exception 'O retorno automático vai de 3 a 60 dias.' using errcode = '22023'; end if;
    v_encerrar := null;
  end if;
  if v_recado is not null and char_length(v_recado) not between 10 and 400 then
    if p_estrito then raise exception 'O recado tem de 10 a 400 letras.' using errcode = '22023'; end if;
    v_recado := null;
  end if;
  -- sem as Automações sob medida (só na tela; a cópia e o padrão das vagas novas já pedem o recurso): as prontas,
  -- do jeito do Publike. O que a vaga já tinha antes fica como estava (dá para salvar de novo sem mexer).
  if p_estrito and not v_medida then
    select * into x from public.automacoes_vaga y where y.anuncio_id = p_anuncio;
    if (v_mensagens <> '{}'::jsonb and v_mensagens is distinct from coalesce(x.mensagens, '{}'::jsonb))
       or (v_dispensar and not coalesce(x.dispensar_eliminados, false))
       or (v_triagem and not coalesce(x.triagem_para_analise, false))
       or (v_recado is not null and v_recado <> privado.recado_pronto() and v_recado is distinct from x.recado)
       or (coalesce(v_parado, 5) <> 5 and v_parado is distinct from x.parado_dias)
       or (coalesce(v_encerrar, 7) <> 7 and v_encerrar is distinct from x.encerrar_dias) then
      raise exception 'Personalizar as automações é das Automações sob medida. Experimente 15 dias grátis na aba Automações.'
        using errcode = 'P0001', hint = 'automacoes_fechado';
    end if;
  end if;
  if jsonb_typeof(r -> 'horarios') = 'object' then
    v_formato := r -> 'horarios' ->> 'formato';
    v_local := nullif(left(btrim(coalesce(r -> 'horarios' ->> 'local', '')), 300), '');
    v_duracao := coalesce(nullif(r -> 'horarios' ->> 'duracao', '')::integer, 30);
    if v_formato not in ('presencial', 'telefone', 'video', 'publike') or v_duracao not between 15 and 180
       or (v_formato = 'presencial' and v_local is null)
       or (v_formato = 'video' and coalesce(v_local, '') !~* '^https://') then
      if p_estrito then
        raise exception 'Confira como vai ser a entrevista: o endereço ou o link da chamada.' using errcode = '22023';
      end if;
    else
      v_horarios := jsonb_build_object('formato', v_formato, 'local', v_local, 'duracao', v_duracao);
    end if;
  end if;
  insert into public.automacoes_vaga (anuncio_id, dispensar_eliminados, mensagens, parado_dias, recado,
                                      triagem_para_analise, encerrar_dias, encerrar_ao_preencher, horarios,
                                      preencher_ao_completar, atualizado_em)
  values (p_anuncio, v_dispensar, v_mensagens, v_parado, v_recado, v_triagem, v_encerrar,
          coalesce((r ->> 'encerrar_ao_preencher')::boolean, false), v_horarios,
          coalesce((r ->> 'preencher_ao_completar')::boolean, false), now())
  on conflict (anuncio_id) do update
    set dispensar_eliminados = excluded.dispensar_eliminados, mensagens = excluded.mensagens,
        parado_dias = excluded.parado_dias, recado = excluded.recado,
        triagem_para_analise = excluded.triagem_para_analise, encerrar_dias = excluded.encerrar_dias,
        encerrar_ao_preencher = excluded.encerrar_ao_preencher, horarios = excluded.horarios,
        preencher_ao_completar = excluded.preencher_ao_completar, atualizado_em = now();
end
$$;

-- copiar as regras para as outras vagas e usar nas novas: das Automações sob medida
create or replace function public.copiar_automacoes(p_anuncio uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_automacao(p_anuncio);
  x public.automacoes_vaga;
  v record;
  n integer := 0;
begin
  perform privado.exigir_conta_ativa();
  if not privado.automacoes_liberado(a.autor_id) then
    raise exception 'Copiar as regras para as outras vagas é das Automações sob medida.'
      using errcode = 'P0001', hint = 'automacoes_fechado';
  end if;
  select * into x from public.automacoes_vaga y where y.anuncio_id = a.id;
  for v in
    select o.id from public.anuncios o
     where o.autor_id = a.autor_id and o.tipo = 'vaga' and o.id <> a.id and o.status = 'ativo'
       and o.expira_em > now() and o.preenchida_em is null
  loop
    perform privado.aplicar_automacoes(v.id, a.autor_id, (select auth.uid()), privado.regras_em_json(x), false);
    n := n + 1;
  end loop;
  return n;
end
$$;

create or replace function public.usar_automacoes_nas_novas(p_anuncio uuid, p_usar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_automacao(p_anuncio);
  x public.automacoes_vaga;
begin
  perform privado.exigir_conta_ativa();
  if not coalesce(p_usar, false) then
    delete from public.automacoes_conta c where c.conta_id = a.autor_id and c.origem = a.id;
    return;
  end if;
  if not privado.automacoes_liberado(a.autor_id) then
    raise exception 'Começar as vagas novas com estas regras é das Automações sob medida.'
      using errcode = 'P0001', hint = 'automacoes_fechado';
  end if;
  select * into x from public.automacoes_vaga y where y.anuncio_id = a.id;
  insert into public.automacoes_conta (conta_id, origem, regras, atualizado_em)
  values (a.autor_id, a.id, privado.regras_em_json(x), now())
  on conflict (conta_id) do update set origem = excluded.origem, regras = excluded.regras, atualizado_em = now();
end
$$;

-- 3. Preencher a vaga quando completar (no fim da transação, depois de a etapa mudar) ----------------------------
create or replace function privado.automacao_ao_completar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
begin
  if new.etapa <> 'contratado' then
    return null;
  end if;
  select * into a from public.anuncios x where x.id = new.anuncio_id;
  if a.id is null or a.tipo <> 'vaga' or a.status <> 'ativo' or a.preenchida_em is not null
     or not coalesce((select x.preencher_ao_completar from public.automacoes_vaga x where x.anuncio_id = a.id), false)
     or (select count(*) from public.etapas_candidatos e
           join public.curtidas k on k.anuncio_id = e.anuncio_id and k.perfil_id = e.perfil_id and k.status = 'match'
          where e.anuncio_id = a.id and e.etapa = 'contratado') < greatest(coalesce(a.vagas, 1), 1) then
    return null;
  end if;
  begin
    -- o mesmo do botão "Marcar como preenchida": a data e o aviso a quem ficou
    update public.anuncios set preenchida_em = now() where id = a.id;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    select c.perfil_id, 'vaga_preenchida', a.id, a.autor_id,
           left('A vaga “' || a.titulo || '” foi preenchida. Obrigado pelo interesse! Veja outras vagas perto de você.', 300)
      from public.curtidas c
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where c.anuncio_id = a.id
       and c.status in ('pendente', 'match')
       and coalesce(e.etapa, 'novo') <> 'contratado';
    insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra)
    values (a.id, new.perfil_id, 'completa')
    on conflict do nothing;
  exception when others then
    -- nunca impede mudar a etapa
    raise warning 'Publike: a automação da vaga completa % falhou: %', a.id, sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists etapas_zz_automacao_completa on public.etapas_candidatos;
create constraint trigger etapas_zz_automacao_completa
  after insert or update of etapa on public.etapas_candidatos
  deferrable initially deferred
  for each row when (new.etapa = 'contratado')
  execute function privado.automacao_ao_completar();

-- o editor sabe se a conta tem as Automações sob medida
create or replace function public.automacoes_da_vaga(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_automacao(p_anuncio);
  r public.automacoes_vaga;
  v public.video_perguntas;
  c public.automacoes_conta;
begin
  select * into r from public.automacoes_vaga x where x.anuncio_id = a.id;
  select * into v from public.video_perguntas x where x.anuncio_id = a.id;
  select * into c from public.automacoes_conta x where x.conta_id = a.autor_id;
  return privado.regras_em_json(r) || jsonb_build_object(
    'tem_eliminatoria', exists (
      select 1 from public.vaga_triagem t, jsonb_each(t.criterios) k
       where t.anuncio_id = a.id and jsonb_typeof(k.value) = 'object'
         and coalesce((k.value ->> 'eliminatoria')::boolean, false)),
    'triagem', jsonb_build_object(
      'liberada', privado.copiloto_liberado(a.autor_id),
      'obrigatorios', (select count(*) from privado.copiloto_vagas cv, jsonb_array_elements(cv.criterios) k
                        where cv.anuncio_id = a.id and jsonb_typeof(k) = 'object'
                          and coalesce((k ->> 'obrigatorio')::boolean, false))),
    'video', jsonb_build_object(
      'liberado', privado.video_liberado(a.autor_id),
      'perguntas', coalesce(jsonb_array_length(v.perguntas), 0),
      'a_todos', coalesce(v.pedir_a_todos, false)),
    'sob_medida', privado.automacoes_liberado(a.autor_id),
    'testes', (select count(*) from privado.avaliacoes_da_vaga d where d.anuncio_id = a.id),
    'retorno_ligado', coalesce((select rc.ligado from privado.retorno_contas rc where rc.conta_id = a.autor_id), true),
    'tem_horarios', exists (select 1 from public.horarios_livres h
                             where h.conta_id = a.autor_id and jsonb_array_length(h.faixas) > 0),
    'padrao', case when c.conta_id is null then null
                   else jsonb_build_object('origem', c.origem,
                                           'titulo', (select o.titulo from public.anuncios o where o.id = c.origem)) end,
    'outras_no_ar', (select count(*) from public.anuncios o
                      where o.autor_id = a.autor_id and o.tipo = 'vaga' and o.id <> a.id and o.status = 'ativo'
                        and o.expira_em > now() and o.preenchida_em is null),
    'contagem', coalesce((select jsonb_object_agg(q.regra, q.n)
                            from (select f.regra, count(*) as n from privado.automacoes_feitas f
                                   where f.anuncio_id = a.id group by f.regra) q), '{}'::jsonb),
    'registro', coalesce((
      select jsonb_agg(jsonb_build_object('perfil_id', f.perfil_id, 'nome', p.nome, 'regra', f.regra,
                                          'detalhe', f.detalhe, 'feito_em', f.feito_em) order by f.feito_em desc)
        from (select * from privado.automacoes_feitas f where f.anuncio_id = a.id order by f.feito_em desc limit 40) f
        join public.perfis p on p.id = f.perfil_id), '[]'::jsonb));
end
$$;

-- 4. O e-mail da candidatura diz o próximo passo, sem "match" (parte 8). Só muda o texto que o Admin não mexeu.
update public.modelos_email
   set corpo = x.novo, corpo_padrao = x.novo
  from (select 'Oi, {{nome}}!

{{quem}} se interessou pelo seu anúncio “{{titulo}}” no Publike.

Abra e escolha o próximo passo com um toque. Se combinar, aceite: o WhatsApp de vocês dois aparece no painel. Se não, dispense, e a pessoa recebe o aviso para seguir procurando.'::text as novo) x
 where chave = 'curtida' and corpo = corpo_padrao;

-- 5. Permissões ---------------------------------------------------------------------------------------------------
revoke all on function privado.automacoes_liberado(uuid), privado.recado_pronto(), privado.automacao_ao_completar()
  from public, anon, authenticated;
revoke all on function public.admin_liberar_automacoes(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_liberar_automacoes(uuid, boolean) to service_role;

notify pgrst, 'reload schema';
