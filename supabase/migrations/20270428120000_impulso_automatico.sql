-- Impulso automático do Publike (12/11/2026, claude/plano-alcance-e-cadastros.md; pedido do Marcelo: "melhorar o
-- alcance, mais pessoas cadastrarem, ser mais assertivo no público" e "não gosto de nada manual"). O robô dos impulsos
-- escolhe sozinho as vagas paradas (no ar há 5 dias ou mais, sem curtida nos últimos 5: é onde falta gente) e as
-- impulsiona no Google com a verba do Publike, dentro do teto do mês. É o mesmo impulso pelo admin (origem 'admin',
-- valor 0), marcado como automático: não gasta o impulso grátis do cliente, e a vaga que sai do ar não vira crédito.
-- Cada vaga ganha no máximo um impulso automático. O cliente recebe o aviso no sino e, no fim, o relatório: quem vê o
-- resultado volta pagando. Nasce desligado: liga em Admin › Impulsos. Pode rodar de novo.

alter table privado.config_impulso
  add column if not exists auto_ligado boolean not null default false,
  add column if not exists auto_verba_mes numeric(10,2) not null default 300 check (auto_verba_mes between 0 and 20000),
  add column if not exists auto_dias smallint not null default 5 check (auto_dias between 1 and 15),
  add column if not exists auto_verba numeric(10,2) not null default 20 check (auto_verba between 1 and 500),
  add column if not exists auto_simultaneos smallint not null default 5 check (auto_simultaneos between 1 and 50),
  add column if not exists auto_avisar boolean not null default true;

alter table privado.impulsos add column if not exists automatico boolean not null default false;
create index if not exists impulsos_automaticos on privado.impulsos (criado_em) where automatico;

-- o que o automático já usou no mês (de São Paulo): o gasto de verdade nos que acabaram, o teto nos que correm
create or replace function privado.verba_automatica_do_mes()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when i.situacao in ('encerrado', 'credito') and i.gasto is not null then i.gasto
                           else i.verba end), 0)
    from privado.impulsos i
   where i.automatico and i.situacao <> 'devolvido'
     and i.criado_em >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
$$;

-- Escolhe e cria os impulsos automáticos desta volta. Devolve quantos criou.
--   * vaga no ar, de empresa, comércio ou agência (conta não suspensa), não preenchida, que fica no ar até o fim do
--     impulso, parada (privado.vaga_parada), sem impulso correndo e sem impulso automático antes;
--   * primeiro as que mostram o salário (o anúncio rende mais), depois as com menos curtidas, depois as mais novas;
--   * no máximo `auto_simultaneos` correndo ao mesmo tempo e o teto `auto_verba_mes` no mês.
create or replace function privado.criar_impulsos_automaticos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
  v_vagas integer;
  v integer := 0;
  r record;
  v_id uuid;
begin
  select * into c from privado.config_impulso where id;
  if c.id is null or not c.auto_ligado then
    return 0;
  end if;
  -- uma volta de cada vez (duas filas ao mesmo tempo não passam do teto)
  perform pg_advisory_xact_lock(hashtext('impulsos_automaticos'));
  v_vagas := least(
    c.auto_simultaneos - (select count(*)::integer from privado.impulsos i
                           where i.automatico and i.situacao in ('pago', 'em_revisao', 'no_ar')),
    floor((c.auto_verba_mes - privado.verba_automatica_do_mes()) / c.auto_verba)::integer);
  if v_vagas <= 0 then
    return 0;
  end if;
  for r in
    select a.id, a.autor_id, a.titulo
      from public.anuncios a
      join public.perfis p on p.id = a.autor_id
     where a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
       and a.expira_em > now() + make_interval(days => c.auto_dias + 1)
       and p.tipo <> 'pessoa' and (p.suspenso_ate is null or p.suspenso_ate <= now())
       and privado.vaga_parada(a.id)
       and not exists (select 1 from privado.impulsos i
                        where i.anuncio_id = a.id and (i.automatico or i.situacao in ('pago', 'em_revisao', 'no_ar')))
     order by (a.pagamento_valor is not null) desc,
              (select count(*) from public.curtidas k where k.anuncio_id = a.id),
              a.criado_em desc
     limit v_vagas
  loop
    insert into privado.impulsos (conta_id, anuncio_id, titulo, origem, dias, valor, verba, automatico)
    values (r.autor_id, r.id, r.titulo, 'admin', c.auto_dias, 0, c.auto_verba, true)
    returning id into v_id;
    v := v + 1;
    if c.auto_avisar then
      perform privado.avisar_pagamento(r.autor_id,
        'O Publike vai impulsionar a vaga "' || left(r.titulo, 80) || '" no Google por ' || c.auto_dias
        || case when c.auto_dias = 1 then ' dia' else ' dias' end
        || ', sem custo para você, para chegar a mais gente perto da vaga. Depois que o Google aprovar, acompanhe '
        || 'quantos viram, clicaram e curtiram.',
        '/painel/impulsionar/' || r.id);
    end if;
  end loop;
  return v;
end
$$;

-- o robô (lib/servidor/impulsos.ts), antes de cuidar dos impulsos, só com o Google Ads ligado
create or replace function public.servidor_impulsos_automaticos(p_chave text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return privado.criar_impulsos_automaticos();
end
$$;

create or replace function public.admin_impulsos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_impulsos_admin();
  return jsonb_build_object(
    'precos', coalesce((select jsonb_agg(jsonb_build_object('dias', p.dias, 'valor', p.valor, 'verba', p.verba,
                                                            'ligado', p.ligado) order by p.dias)
                          from privado.precos_impulso p), '[]'::jsonb),
    'config', (select to_jsonb(c) - 'id' - 'alerta_erro_em' from privado.config_impulso c where c.id),
    'mes', jsonb_build_object(
      'entrou', coalesce((select sum(k.valor) from privado.compras_avulsas k
                           where k.tipo = 'impulso' and k.situacao = 'paga' and k.paga_em >= v_mes), 0),
      'verba', coalesce((select sum(i.verba) from privado.impulsos i
                          where i.criado_em >= v_mes and i.situacao not in ('devolvido')), 0),
      'gasto', coalesce((select sum(d.custo) from privado.impulso_dias d where d.dia >= v_mes::date), 0),
      'impulsos', (select count(*) from privado.impulsos i where i.criado_em >= v_mes),
      -- o automático do Publike no mês: o que já foi separado (o gasto de verdade nos encerrados) e quantos
      'automatico_verba', privado.verba_automatica_do_mes(),
      'automaticos', (select count(*) from privado.impulsos i where i.automatico and i.criado_em >= v_mes),
      'automaticos_no_ar', (select count(*) from privado.impulsos i
                             where i.automatico and i.situacao in ('pago', 'em_revisao', 'no_ar'))),
    'impulsos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'conta', p.nome, 'conta_id', i.conta_id, 'anuncio_id', i.anuncio_id, 'titulo', i.titulo,
        'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'valor', i.valor, 'verba', i.verba,
        'gasto', i.gasto, 'campanha_id', i.campanha_id, 'criado_em', i.criado_em, 'aprovado_em', i.aprovado_em,
        'ate', i.ate, 'pausar', i.pausar, 'erro', i.ultimo_erro, 'erro_desde', i.erro_desde, 'motivo', i.motivo,
        'sandbox', i.sandbox, 'automatico', i.automatico,
        'totais', (select jsonb_build_object('impressoes', coalesce(sum(d.impressoes), 0),
                                             'cliques', coalesce(sum(d.cliques), 0),
                                             'visitas', coalesce(sum(d.visitas), 0),
                                             'curtidas', coalesce(sum(d.curtidas), 0))
                     from privado.impulso_dias d where d.impulso_id = i.id))
        order by i.criado_em desc)
      from (select * from privado.impulsos order by criado_em desc limit 100) i
      join public.perfis p on p.id = i.conta_id), '[]'::jsonb));
end
$$;

create or replace function public.admin_salvar_impulso(p_precos jsonb, p_config jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l jsonb;
begin
  perform privado.exigir_impulsos_admin();
  for l in select * from jsonb_array_elements(coalesce(p_precos, '[]'::jsonb)) loop
    update privado.precos_impulso
       set valor = (l ->> 'valor')::numeric, verba = (l ->> 'verba')::numeric, ligado = (l ->> 'ligado')::boolean
     where dias = (l ->> 'dias')::smallint;
  end loop;
  if p_config is not null then
    update privado.config_impulso
       set cortesia_ligada = coalesce((p_config ->> 'cortesia_ligada')::boolean, cortesia_ligada),
           cortesia_dias = coalesce((p_config ->> 'cortesia_dias')::smallint, cortesia_dias),
           cortesia_verba = coalesce((p_config ->> 'cortesia_verba')::numeric, cortesia_verba),
           raio_capital = coalesce((p_config ->> 'raio_capital')::smallint, raio_capital),
           raio_outras = coalesce((p_config ->> 'raio_outras')::smallint, raio_outras),
           auto_ligado = coalesce((p_config ->> 'auto_ligado')::boolean, auto_ligado),
           auto_verba_mes = coalesce((p_config ->> 'auto_verba_mes')::numeric, auto_verba_mes),
           auto_dias = coalesce((p_config ->> 'auto_dias')::smallint, auto_dias),
           auto_verba = coalesce((p_config ->> 'auto_verba')::numeric, auto_verba),
           auto_simultaneos = coalesce((p_config ->> 'auto_simultaneos')::smallint, auto_simultaneos),
           auto_avisar = coalesce((p_config ->> 'auto_avisar')::boolean, auto_avisar)
     where id;
  end if;
  perform privado.registrar('precos_impulso', 'config', 'impulso', 'Preços e regras do impulso',
                            jsonb_build_object('precos', p_precos, 'config', p_config));
end
$$;

revoke execute on function privado.verba_automatica_do_mes(), privado.criar_impulsos_automaticos() from public;
-- como as outras do servidor: a chave do servidor (p_chave) é quem protege
revoke execute on function public.servidor_impulsos_automaticos(text) from public;
grant execute on function public.servidor_impulsos_automaticos(text) to anon, authenticated, service_role;
revoke execute on function public.admin_impulsos(), public.admin_salvar_impulso(jsonb, jsonb) from public, anon;
grant execute on function public.admin_impulsos(), public.admin_salvar_impulso(jsonb, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
