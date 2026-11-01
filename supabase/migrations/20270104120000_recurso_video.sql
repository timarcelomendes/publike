-- A Entrevista em vídeo vira o terceiro recurso pago, com 15 dias grátis e a assinatura pelo Asaas, como a Triagem
-- com IA e o Teste Prático (claude/plano-recursos-concorrentes.md, parte 1). O combo continua Triagem + Teste
-- Prático: não libera o vídeo. E o histórico das etapas começa a gravar, para os números do processo (parte 6).
-- Pode rodar de novo.

-- 1. O recurso ------------------------------------------------------------------------------------
create table if not exists privado.video_contas (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  liberado_em timestamptz not null default now(),
  -- null: sem prazo (liberado pelo Admin); com data: os dias grátis ou o período pago
  ate timestamptz
);
alter table privado.video_contas enable row level security;
revoke all on privado.video_contas from public, anon, authenticated;

alter table privado.experimentos drop constraint if exists experimentos_recurso_check;
alter table privado.experimentos add constraint experimentos_recurso_check check (recurso in ('copiloto', 'testes', 'video'));
alter table privado.planos drop constraint if exists planos_recurso_check;
alter table privado.planos add constraint planos_recurso_check check (recurso in ('copiloto', 'testes', 'combo', 'video'));
alter table privado.assinaturas drop constraint if exists assinaturas_recurso_check;
alter table privado.assinaturas add constraint assinaturas_recurso_check check (recurso in ('copiloto', 'testes', 'combo', 'video'));
alter table privado.cobrancas drop constraint if exists cobrancas_recurso_check;
alter table privado.cobrancas add constraint cobrancas_recurso_check check (recurso in ('copiloto', 'testes', 'combo', 'video'));

-- o preço fica no Admin (desligado e sem valor até o Admin pôr)
insert into privado.planos (recurso, ciclo) values ('video', 'MONTHLY'), ('video', 'QUARTERLY')
on conflict (recurso, ciclo) do nothing;

create or replace function privado.video_liberado(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.video_contas v
                  where v.conta_id = p_conta and (v.ate is null or v.ate > now()))
$$;

create or replace function privado.exigir_video()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.video_liberado(public.conta_atual()) then
    raise exception 'A Entrevista em vídeo é um recurso pago. Experimente 15 dias grátis em Painel › Entrevista em vídeo.'
      using errcode = 'P0001', hint = 'video_fechado';
  end if;
end
$$;

create or replace function public.video_liberado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and privado.video_liberado(public.conta_atual())
$$;

create or replace function public.admin_liberar_video(p_conta uuid, p_liberar boolean)
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
    insert into privado.video_contas (conta_id) values (p_conta)
    on conflict (conta_id) do update set ate = null;
  else
    delete from privado.video_contas where conta_id = p_conta;
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
  foreach r in array array['copiloto', 'testes', 'video'] loop
    if r = 'copiloto' then
      select true, c.ate into tem, ate_ from privado.copiloto_contas c where c.conta_id = conta;
    elsif r = 'video' then
      select true, v.ate into tem, ate_ from privado.video_contas v where v.conta_id = conta;
    else
      select true, t.ate into tem, ate_ from privado.testes_contas t where t.conta_id = conta;
    end if;
    select * into e from privado.experimentos x where x.conta_id = conta and x.recurso = r;
    assina := exists (select 1 from privado.assinaturas a
                       where a.conta_id = conta and a.situacao = 'ativa'
                         and (a.recurso = r or (a.recurso = 'combo' and r <> 'video')));
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
      'pode_assinar', pagar and not assina and not (combo and r <> 'video') and not (coalesce(tem, false) and ate_ is null)
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
  if p_recurso not in ('copiloto', 'testes', 'video') then
    raise exception 'Pedido inválido.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.perfis p where p.id = conta and p.tipo in ('comercio', 'empresa', 'agencia')) then
    raise exception 'Os 15 dias grátis são para contas de comércio, empresa ou agência.' using errcode = 'P0001';
  end if;
  if (p_recurso = 'copiloto' and privado.copiloto_liberado(conta))
     or (p_recurso = 'testes' and privado.testes_liberado(conta))
     or (p_recurso = 'video' and privado.video_liberado(conta)) then
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
      'video', exists (select 1 from privado.video_contas v where v.conta_id = p_conta and v.ate is null)),
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
           else 'Teste Prático' end
$function$;

revoke all on function privado.video_liberado(uuid), privado.exigir_video() from public, anon, authenticated;
revoke all on function public.video_liberado() from public, anon;
grant execute on function public.video_liberado() to authenticated;
revoke all on function public.admin_liberar_video(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_liberar_video(uuid, boolean) to service_role;

-- 2. O histórico das etapas ------------------------------------------------------------------------
-- Cada mudança de etapa (no quadro) e de curtida (aceitar, dispensar, desfazer) vira uma linha. Os números do
-- processo (tempo até a primeira resposta, até a entrevista, até contratar) saem daqui.
create table if not exists privado.historico_etapas (
  id bigint generated always as identity primary key,
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  -- 'curtida:<status>' (pendente, match, dispensada, desfeito) ou 'etapa:<etapa>'
  o_que text not null,
  em timestamptz not null default now()
);
create index if not exists historico_etapas_vaga on privado.historico_etapas (anuncio_id, perfil_id, em);
alter table privado.historico_etapas enable row level security;
revoke all on privado.historico_etapas from public, anon, authenticated;

create or replace function privado.historico_da_curtida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into privado.historico_etapas (anuncio_id, perfil_id, o_que) values (new.anuncio_id, new.perfil_id, 'curtida:' || new.status);
  end if;
  return null;
end
$$;
drop trigger if exists curtidas_historico on public.curtidas;
create trigger curtidas_historico after insert or update of status on public.curtidas
  for each row execute function privado.historico_da_curtida();

create or replace function privado.historico_da_etapa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.etapa is distinct from old.etapa then
    insert into privado.historico_etapas (anuncio_id, perfil_id, o_que) values (new.anuncio_id, new.perfil_id, 'etapa:' || new.etapa);
  end if;
  return null;
end
$$;
drop trigger if exists etapas_historico on public.etapas_candidatos;
create trigger etapas_historico after insert or update of etapa on public.etapas_candidatos
  for each row execute function privado.historico_da_etapa();

notify pgrst, 'reload schema';
