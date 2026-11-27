-- A agenda de entrevistas pelo WhatsApp vira recurso pago (27/11/2026; Marcelo: "essa feature vai ser paga mas deve
-- dar gratuitamente 3 vagas no mes com todos os candidatos"; recurso novo, R$ 49 por mês; todos os planos liberam).
--
-- `agenda` ("Entrevistas pelo WhatsApp"): como a Consulta de salários, sem os 15 dias grátis. O grátis de cada mês são
-- 3 vagas com agenda aberta pela conta (Admin › Pagamentos, `config_pagamentos.gratis_agenda_mes`), cada uma com todos
-- os candidatos; abrir de novo na mesma vaga, no mesmo mês, não gasta. As agendas montadas pela equipe não contam.
-- A assinatura sozinha, os planos por faixa e o Plano Completo liberam sem limite.

-- 1. A liberação da conta (o mesmo jeito das outras)
create table if not exists privado.agenda_contas (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  liberado_em timestamptz not null default now(),
  ate timestamptz,
  promocao_ate timestamptz,
  promocao_avisada_em timestamptz
);
alter table privado.agenda_contas enable row level security;

alter table privado.config_pagamentos add column if not exists gratis_agenda_mes integer not null default 3;

-- 2. O produto nas assinaturas, nas cobranças e nos preços
do $$
declare
  r record;
  v_def text;
begin
  for r in select c.conrelid::regclass as tabela, c.conname, pg_get_constraintdef(c.oid) as def
             from pg_constraint c
            where c.conrelid in ('privado.planos'::regclass, 'privado.assinaturas'::regclass, 'privado.cobrancas'::regclass)
              and c.contype = 'c' and pg_get_constraintdef(c.oid) ~ '''salarios''::text'
              and pg_get_constraintdef(c.oid) !~ '''agenda''::text' loop
    v_def := replace(r.def, '''salarios''::text', '''salarios''::text, ''agenda''::text');
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
    execute format('alter table %s add constraint %I %s', r.tabela, r.conname, v_def);
  end loop;
end
$$;

insert into privado.planos (recurso, ciclo, valor, ligado)
select 'agenda', c, case c when 'MONTHLY' then 49.00 end, c = 'MONTHLY'
  from unnest(array['MONTHLY', 'QUARTERLY']) c
 where not exists (select 1 from privado.planos p where p.recurso = 'agenda' and p.ciclo = c);

-- 3. As funções dos recursos pagos: o `agenda` junto do `salarios`
do $$
declare
  t record;
  v_def text;
  v_novo text;
begin
  for t in
    select * from (values
      -- recalcular: os planos que liberam tudo e a liberação da conta
      ('privado.recalcular_recurso_pago(uuid,text)'::regprocedure,
       $a$    perform privado.recalcular_recurso_pago(p_conta, 'salarios');
    return;$a$,
       $a$    perform privado.recalcular_recurso_pago(p_conta, 'salarios');
    perform privado.recalcular_recurso_pago(p_conta, 'agenda');
    return;$a$),
      ('privado.recalcular_recurso_pago(uuid,text)'::regprocedure,
       $a$  elsif p_recurso = 'salarios' then
    select true, v.ate into v_tem, v_ate from privado.salarios_contas v where v.conta_id = p_conta;$a$,
       $a$  elsif p_recurso = 'salarios' then
    select true, v.ate into v_tem, v_ate from privado.salarios_contas v where v.conta_id = p_conta;
  elsif p_recurso = 'agenda' then
    select true, v.ate into v_tem, v_ate from privado.agenda_contas v where v.conta_id = p_conta;$a$),
      ('privado.recalcular_recurso_pago(uuid,text)'::regprocedure,
       $a$  elsif p_recurso = 'salarios' then
    insert into privado.salarios_contas (conta_id, liberado_em, ate) values (p_conta, now(), v_novo)
    on conflict (conta_id) do update set ate = excluded.ate;$a$,
       $a$  elsif p_recurso = 'salarios' then
    insert into privado.salarios_contas (conta_id, liberado_em, ate) values (p_conta, now(), v_novo)
    on conflict (conta_id) do update set ate = excluded.ate;
  elsif p_recurso = 'agenda' then
    insert into privado.agenda_contas (conta_id, liberado_em, ate) values (p_conta, now(), v_novo)
    on conflict (conta_id) do update set ate = excluded.ate;$a$),
      ('privado.liberacao_do_recurso(uuid,text)'::regprocedure,
       $a$  elsif p_recurso = 'salarios' then$a$,
       $a$  elsif p_recurso = 'agenda' then
    select true, x.ate, x.promocao_ate into existe, ate, promocao_ate from privado.agenda_contas x where x.conta_id = p_conta;
  elsif p_recurso = 'salarios' then$a$),
      ('privado.nome_do_recurso(text)'::regprocedure,
       $a$           when 'salarios' then 'recurso Consulta de salários'$a$,
       $a$           when 'salarios' then 'recurso Consulta de salários'
           when 'agenda' then 'recurso Entrevistas pelo WhatsApp'$a$),
      ('privado.nome_do_recurso_pago(text)'::regprocedure,
       $a$           when 'salarios' then 'a Consulta de salários'$a$,
       $a$           when 'salarios' then 'a Consulta de salários'
           when 'agenda' then 'as Entrevistas pelo WhatsApp'$a$),
      -- a volta do checkout acha o produto pela descrição: "Entrevistas pelo WhatsApp" antes de "entrevista" (a
      -- Entrevista em vídeo)
      ('public.servidor_pagamento_vincular(text,jsonb)'::regprocedure,
       $a$                      when v_desc like '%sal_rio%' then 'salarios'$a$,
       $a$                      when v_desc like '%sal_rio%' then 'salarios'
                      when v_desc like '%whatsapp%' then 'agenda'$a$),
      ('public.servidor_pagamento_contexto(text,uuid)'::regprocedure,
       $a$      'salarios', exists (select 1 from privado.salarios_contas v where v.conta_id = p_conta and v.ate is null),$a$,
       $a$      'salarios', exists (select 1 from privado.salarios_contas v where v.conta_id = p_conta and v.ate is null),
      'agenda', exists (select 1 from privado.agenda_contas v where v.conta_id = p_conta and v.ate is null),$a$),
      ('public.recursos_pagos()'::regprocedure,
       $a$array['copiloto', 'testes', 'video', 'automacoes', 'salarios']$a$,
       $a$array['copiloto', 'testes', 'video', 'automacoes', 'salarios', 'agenda']$a$),
      ('public.recursos_pagos()'::regprocedure,
       $a$    elsif r = 'salarios' then$a$,
       $a$    elsif r = 'agenda' then
      select true, v.ate, v.promocao_ate into tem, ate_, promo_ from privado.agenda_contas v where v.conta_id = conta;
    elsif r = 'salarios' then$a$),
      ('public.recursos_pagos()'::regprocedure,
       $a$e.conta_id is null and r <> 'salarios'$a$,
       $a$e.conta_id is null and r not in ('salarios', 'agenda')$a$),
      ('public.recursos_pagos()'::regprocedure,
       $a$  return saida;
end$a$,
       $a$  -- as Entrevistas pelo WhatsApp (migração 20271015120000): as vagas grátis do mês, sem o recurso liberado
  if coalesce(contrata, false) and not privado.agenda_liberada(conta) then
    saida := jsonb_set(saida, '{agenda,gratis}', jsonb_build_object(
      'limite', privado.gratis_do_mes(conta, 'agenda'),
      'usados', privado.agenda_vagas_no_mes(conta, null),
      'renova_em', privado.gratis_renova_em()));
  end if;
  return saida;
end$a$),
      ('privado.gravar_promocao(uuid,text,timestamptz)'::regprocedure,
       $a$  elsif p_recurso = 'salarios' then$a$,
       $a$  elsif p_recurso = 'agenda' then
    insert into privado.agenda_contas as x (conta_id, ate, promocao_ate) values (p_conta, p_fim, p_fim)
    on conflict (conta_id) do update set ate = p_fim, promocao_ate = p_fim, promocao_avisada_em = null,
      liberado_em = case when x.ate is not null and x.ate <= now() then now() else x.liberado_em end;
  elsif p_recurso = 'salarios' then$a$),
      ('public.equipe_liberar_promocao(uuid,text[],date)'::regprocedure,
       $a$('copiloto', 'testes', 'video', 'automacoes', 'salarios', 'visoes', 'contato_no_convite')$a$,
       $a$('copiloto', 'testes', 'video', 'automacoes', 'salarios', 'agenda', 'visoes', 'contato_no_convite')$a$),
      ('public.equipe_tirar_promocao(uuid,text)'::regprocedure,
       $a$  elsif p_recurso = 'salarios' then$a$,
       $a$  elsif p_recurso = 'agenda' then
    update privado.agenda_contas x set ate = now(), promocao_ate = now()
     where x.conta_id = p_conta and x.promocao_ate = x.ate and x.ate > now();
  elsif p_recurso = 'salarios' then$a$)
    ) as v(fn, de, para)
  loop
    v_def := pg_get_functiondef(t.fn);
    if position(t.para in v_def) > 0 then
      continue; -- já está (a migração rodou antes)
    end if;
    if position(t.de in v_def) = 0 then
      raise exception 'A migração 20271015120000 não achou o trecho em %: %', t.fn, left(t.de, 80);
    end if;
    v_novo := replace(v_def, t.de, t.para);
    execute v_novo;
  end loop;
end
$$;

-- 4. O grátis de cada mês: o número das Entrevistas pelo WhatsApp
create or replace function privado.gratis_do_mes(p_conta uuid, p_o_que text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p_conta is null or not privado.contrata(p_conta) then 0
           else coalesce(
             (select case p_o_que when 'triagem' then c.gratis_triagem_mes
                                  when 'gravadas' then c.gratis_gravadas_mes
                                  when 'ao_vivo' then c.gratis_ao_vivo_mes
                                  when 'agenda' then c.gratis_agenda_mes end
                from privado.config_pagamentos c where c.id),
             case p_o_que when 'triagem' then 5 when 'gravadas' then 5 when 'ao_vivo' then 1 when 'agenda' then 3 else 0 end)
         end
$$;

-- A conta tem as Entrevistas pelo WhatsApp liberadas (a assinatura, um plano, a promoção ou o Publike).
create or replace function privado.agenda_liberada(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.agenda_contas x where x.conta_id = p_conta and (x.ate is null or x.ate > now()))
$$;

-- As vagas da conta com agenda aberta por ela neste mês (o de Goiânia), sem `p_menos` (a vaga de agora).
create or replace function privado.agenda_vagas_no_mes(p_conta uuid, p_menos uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct g.anuncio_id)::integer
    from privado.agendas g
    join public.anuncios a on a.id = g.anuncio_id
   where a.autor_id = p_conta and not g.pela_equipe
     and g.criada_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
     and (p_menos is null or g.anuncio_id <> p_menos)
$$;

-- Abrir a agenda: a equipe sempre; a conta com o recurso liberado ou dentro das vagas grátis do mês.
create or replace function privado.exigir_agenda_gratis(p_anuncio uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conta uuid;
  v_limite integer;
begin
  if privado.eh_admin() or privado.equipe_publike() then
    return;
  end if;
  select a.autor_id into v_conta from public.anuncios a where a.id = p_anuncio;
  if v_conta is null or privado.agenda_liberada(v_conta) then
    return;
  end if;
  v_limite := privado.gratis_do_mes(v_conta, 'agenda');
  if privado.agenda_vagas_no_mes(v_conta, p_anuncio) >= v_limite then
    raise exception '%', case when v_limite = 0
        then 'As entrevistas pelo WhatsApp são da assinatura Entrevistas pelo WhatsApp.'
        when v_limite = 1
        then 'A vaga grátis deste mês já tem agenda. Para marcar as entrevistas pelo WhatsApp em mais vagas, assine as Entrevistas pelo WhatsApp (sem limite de vagas).'
        else format('As %s vagas grátis deste mês já têm agenda. Para marcar as entrevistas pelo WhatsApp em mais vagas, assine as Entrevistas pelo WhatsApp (sem limite de vagas).', v_limite) end
      using errcode = 'P0001', hint = 'agenda_sem_gratis';
  end if;
end
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.admin_agenda_criar(uuid,timestamptz[],text,text,text,integer)'::regprocedure);
  v_de text := 'perform privado.exigir_agenda(p_anuncio);';
begin
  if position('exigir_agenda_gratis' in v_def) > 0 then
    return;
  end if;
  if position(v_de in v_def) = 0 then
    raise exception 'A migração 20271015120000 não achou o exigir_agenda em admin_agenda_criar.';
  end if;
  execute replace(v_def, v_de, v_de || E'\n  perform privado.exigir_agenda_gratis(p_anuncio);');
end
$$;

-- A agenda da vaga, no painel: também o que a conta tem (liberada, ou as vagas grátis do mês e se esta já conta)
create or replace function public.agenda_da_vaga(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conta uuid;
  v_liberada boolean;
begin
  perform privado.exigir_agenda(p_anuncio);
  select a.autor_id into v_conta from public.anuncios a where a.id = p_anuncio;
  v_liberada := privado.agenda_liberada(v_conta);
  return jsonb_build_object(
    'aberta', (select g.id from privado.agendas g
                where g.anuncio_id = p_anuncio and g.encerrada_em is null order by g.criada_em desc limit 1),
    'antes', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'criada_em', g.criada_em,
                                                           'encerrada_em', g.encerrada_em) order by g.criada_em desc),
                              '[]'::jsonb)
                from privado.agendas g where g.anuncio_id = p_anuncio and g.encerrada_em is not null),
    'com_whatsapp', (select count(*) from public.curtidas k
                      where k.anuncio_id = p_anuncio and k.status in ('pendente', 'match')
                        and privado.numero_do_whatsapp(k.perfil_id) is not null),
    'candidatos', (select count(*) from public.curtidas k
                    where k.anuncio_id = p_anuncio and k.status in ('pendente', 'match')),
    'ao_vivo', (select privado.limite_ao_vivo(v_conta) > 0),
    'liberada', v_liberada,
    'gratis', case when v_liberada then null else jsonb_build_object(
      'limite', privado.gratis_do_mes(v_conta, 'agenda'),
      'usados', privado.agenda_vagas_no_mes(v_conta, null),
      -- esta vaga já teve agenda aberta pela conta neste mês: abrir de novo não gasta
      'esta_conta', privado.agenda_vagas_no_mes(v_conta, null) > privado.agenda_vagas_no_mes(v_conta, p_anuncio),
      'renova_em', privado.gratis_renova_em()) end,
    'pode_assinar', not v_liberada and privado.pode_pagar(v_conta)
                    and exists (select 1 from privado.planos pl where pl.recurso = 'agenda' and pl.ligado and pl.valor is not null));
end
$$;

-- Admin › Pagamentos: as vagas grátis do mês (0 desliga)
create or replace function public.admin_gratis_agenda(p_vagas integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_vagas is null or p_vagas not between 0 and 100 then
    raise exception 'Use de 0 a 100 vagas.' using errcode = '22023';
  end if;
  update privado.config_pagamentos set gratis_agenda_mes = p_vagas, atualizado_em = now() where id;
end
$$;
revoke all on function public.admin_gratis_agenda(integer) from public, anon, authenticated;
grant execute on function public.admin_gratis_agenda(integer) to service_role;

revoke execute on function privado.agenda_liberada(uuid), privado.agenda_vagas_no_mes(uuid, uuid),
  privado.exigir_agenda_gratis(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271015120000_entrevistas_pelo_whatsapp_paga');
