-- A garantia da verba do impulso (14/11/2026, claude/plano-campanha-mae-dos-impulsos.md, Fase 1). Pedido do Marcelo:
-- "Mas preciso que seja uma funcionalidade boa para os clientes". Antes, o impulso acabava na data, gastando ou não: a
-- vaga com pouca busca terminava com quase toda a verba sem uso, e ela não voltava (só virava crédito quando a vaga
-- fechava antes do fim).
--   * No fim do prazo, se o Google usou menos de 80% da verba, o impulso segue no ar sozinho pelo mesmo número de dias,
--     sem custo, e acaba antes se a verba acabar (privado.garantia_da_verba, a cada volta do robô, no começo de
--     servidor_impulsos_para_cuidar: estende antes de o robô receber o "encerrar"). Uma vez por impulso. O cliente
--     recebe o aviso no sino com a data nova. Vale para o impulso pago, o de crédito, o grátis e a campanha do cliente
--     (o presente); o automático do Publike acaba na data, para dar lugar a outra vaga parada.
--   * No fim (com extensão ou sem), o que o Google não usou vira crédito para outra vaga, por 90 dias: em reais inteiros,
--     com ao menos R$ 10 por dia (menos não vale a pena, 13/11/2026) e no máximo os dias do impulso. Vale para o pago, o
--     de crédito e o grátis, como o crédito da vaga que fecha antes (o do admin não vira crédito).
--   * A vaga que fecha com o anúncio no ar: o crédito passa a ser também o que o Google não usou. Antes eram os dias que
--     faltavam, que davam mais do que sobrou quando o Google gastava adiantado (e, na extensão, dias que já eram de
--     graça) e nada quando a vaga fechava no último dia. Antes de ir ao ar, segue tudo virando crédito, como antes.
-- O robô quase não muda: a medida seguinte (medido_em volta a null) leva o fim novo ao Google (acertarCampanha), e o
-- ajuste diário espalha o que sobrou pelos dias novos; na campanha do cliente, a verba do dia é refeita
-- (verba_no_google volta a null, e privado.verba_dia_da_campanha divide o que falta pelos dias que faltam). No código,
-- o "pausar" mede antes de tirar a campanha, para o crédito sair com o gasto do dia.
-- impulso_da_vaga e admin_impulsos passam a dizer a extensão (estendido_em, ate_original) e o crédito que o impulso
-- deixou. Pode rodar de novo.

alter table privado.impulsos
  add column if not exists estendido_em timestamptz,
  add column if not exists ate_original timestamptz;
alter table privado.impulso_campanhas
  add column if not exists estendido_em timestamptz,
  add column if not exists ate_original timestamptz;

-- R$ 1.234,56 (para os avisos)
create or replace function privado.reais_br(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'R$ ' || translate(to_char(round(coalesce(p, 0), 2), 'FM999,999,990.00'), ',.', '.,')
$$;

-- O que o Google não usou do impulso vira crédito para outra vaga, por 90 dias: em reais inteiros (o gasto do último dia
-- ainda sobe uns centavos na medida da manhã seguinte), com ao menos R$ 10 por dia e no máximo os dias do impulso. Só
-- no pago, no de crédito e no grátis, fora da campanha do cliente, e uma vez por impulso. Devolve o crédito (dias,
-- verba e até quando vale) ou null.
create or replace function privado.impulso_sobra_vira_credito(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
  v_sobra numeric;
  v_dias integer;
  v_ate timestamptz;
begin
  select * into i from privado.impulsos where id = p_id;
  if i.id is null or i.origem not in ('compra', 'credito', 'cortesia') or i.campanha_cliente_id is not null
     or exists (select 1 from privado.creditos_impulso c where c.de_impulso = i.id) then
    return null;
  end if;
  v_sobra := floor(i.verba - least(coalesce(i.gasto, 0), i.verba));
  v_dias := least(i.dias, floor(v_sobra / 10))::integer;
  if v_dias < 1 then
    return null;
  end if;
  insert into privado.creditos_impulso (conta_id, dias, verba, de_impulso)
  values (i.conta_id, v_dias, v_sobra, i.id)
  returning ate into v_ate;
  return jsonb_build_object('dias', v_dias, 'verba', v_sobra, 'ate', v_ate);
end
$$;

-- A garantia da verba, a cada volta do robô:
--   1. a extensão que já usou a verba toda acaba agora (o robô encerra na mesma volta);
--   2. o impulso de uma vaga que chegou ao fim com menos de 80% da verba usada segue no ar pelo mesmo número de dias;
--   3. a campanha do cliente, do mesmo jeito, com as vagas dela (a verba é uma só para todas).
-- Não estendem: a vaga que fechou ou saiu do ar (pausar), o automático do Publike e o que nem chegou ao Google.
create or replace function privado.garantia_da_verba()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
  k privado.impulso_campanhas;
  v_gasto numeric;
  v record;
begin
  -- uma volta de cada vez: duas filas juntas não estendem nem avisam duas vezes
  perform pg_advisory_xact_lock(hashtext('garantia_da_verba'));

  -- 1. a verba acabou durante a extensão
  update privado.impulsos
     set ate = now()
   where situacao = 'no_ar' and estendido_em is not null and campanha_cliente_id is null
     and ate > now() and coalesce(gasto, 0) >= verba;
  for k in select c.* from privado.impulso_campanhas c
            where c.situacao = 'no_ar' and c.estendido_em is not null and c.ate > now()
              and (select coalesce(sum(x.gasto), 0) from privado.impulsos x where x.campanha_cliente_id = c.id) >= c.verba
  loop
    update privado.impulso_campanhas set ate = now() where id = k.id;
    update privado.impulsos set ate = now()
     where campanha_cliente_id = k.id and situacao = 'no_ar' and ate > now();
  end loop;

  -- 2. o impulso de uma vaga
  for i in select x.* from privado.impulsos x
             join public.anuncios a on a.id = x.anuncio_id
            where x.situacao = 'no_ar' and x.ate <= now() and x.estendido_em is null and not x.pausar
              and x.campanha_cliente_id is null and not x.automatico and x.campanha_id is not null
              and coalesce(x.gasto, 0) < 0.8 * x.verba
              and a.status = 'ativo' and a.preenchida_em is null and coalesce(a.expira_em > now(), true)
  loop
    update privado.impulsos
       set ate_original = ate, ate = ate + make_interval(days => dias), estendido_em = now(), medido_em = null
     where id = i.id and estendido_em is null
    returning * into i;
    continue when i.id is null;
    perform privado.avisar_pagamento(i.conta_id,
      'A vaga "' || left(i.titulo, 60) || '" teve menos busca no Google do que o esperado: o anúncio usou '
      || privado.reais_br(least(coalesce(i.gasto, 0), i.verba)) || ' dos ' || privado.reais_br(i.verba)
      || '. Pela garantia da verba, ele segue no ar até ' || privado.data_br(i.ate)
      || case when i.origem in ('compra', 'credito') then ', sem custo a mais.' else ', sem custo para você.' end
      || case when i.origem in ('compra', 'credito', 'cortesia') then ' O que sobrar no fim vira crédito.' else '' end,
      '/painel/impulsionar/' || i.anuncio_id);
  end loop;

  -- 3. a campanha do cliente
  for k in select c.* from privado.impulso_campanhas c
            where c.situacao = 'no_ar' and c.ate <= now() and c.estendido_em is null
              and (select coalesce(sum(x.gasto), 0) from privado.impulsos x where x.campanha_cliente_id = c.id)
                  < 0.8 * c.verba
              and exists (select 1 from privado.impulsos x join public.anuncios a on a.id = x.anuncio_id
                           where x.campanha_cliente_id = c.id and x.situacao = 'no_ar' and not x.pausar
                             and a.status = 'ativo' and a.preenchida_em is null
                             and coalesce(a.expira_em > now(), true))
  loop
    select coalesce(sum(x.gasto), 0) into v_gasto from privado.impulsos x where x.campanha_cliente_id = k.id;
    update privado.impulso_campanhas
       set ate_original = ate, ate = ate + make_interval(days => dias), estendido_em = now(), verba_no_google = null
     where id = k.id and estendido_em is null
    returning * into k;
    continue when k.id is null;
    -- as vagas no ar acompanham a campanha; a que ainda espera o Google ganha o fim novo quando for aprovada
    update privado.impulsos
       set ate_original = ate, ate = k.ate, estendido_em = now(), medido_em = null
     where campanha_cliente_id = k.id and situacao = 'no_ar' and not pausar;
    if k.avisar then
      select count(*) as vagas, (array_agg(x.titulo order by x.criado_em))[1] as titulo,
             (array_agg(x.anuncio_id order by x.criado_em))[1] as anuncio
        into v
        from privado.impulsos x
       where x.campanha_cliente_id = k.id and x.situacao = 'no_ar' and not x.pausar;
      perform privado.avisar_pagamento(k.conta_id,
        case when v.vagas = 1
             then 'A vaga "' || left(v.titulo, 60) || '" teve menos busca no Google do que o esperado: o anúncio usou '
             else 'As suas ' || v.vagas || ' vagas tiveram menos busca no Google do que o esperado: os anúncios usaram '
        end
        || privado.reais_br(least(v_gasto, k.verba)) || ' dos ' || privado.reais_br(k.verba)
        || case when v.vagas = 1 then '. Pela garantia da verba, ele segue no ar até '
                else '. Pela garantia da verba, eles seguem no ar até ' end
        || privado.data_br(k.ate) || ', sem custo para você.',
        case when v.vagas = 1 then '/painel/impulsionar/' || v.anuncio else '/painel/anuncios' end);
    end if;
  end loop;
end
$$;

revoke execute on function privado.reais_br(numeric), privado.impulso_sobra_vira_credito(uuid),
  privado.garantia_da_verba() from public, anon, authenticated;

-- acabou: o relatório para quem contratou, e o que o Google não usou vira crédito (14/11/2026). A vaga da campanha do
-- cliente acaba calada (o relatório vai um só, no fim da campanha) e acaba também se a campanha terminou antes de o
-- Google aprovar o anúncio dela. O resto é o de 20270430120000.
create or replace function public.servidor_impulso_encerrado(p_chave text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
  t record;
  v_credito jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.impulsos
     set situacao = 'encerrado', encerrado_em = now(),
         motivo = case when situacao <> 'no_ar' then 'O impulso do cliente acabou antes de o Google aprovar este anúncio.'
                       else motivo end
   where id = p_id
     and (situacao = 'no_ar' or (campanha_cliente_id is not null and situacao in ('pago', 'em_revisao')))
  returning * into i;
  if i.id is null or i.campanha_cliente_id is not null then
    return;
  end if;
  select coalesce(sum(d.impressoes), 0) as impressoes, coalesce(sum(d.cliques), 0) as cliques,
         coalesce(sum(d.curtidas), 0) as curtidas
    into t from privado.impulso_dias d where d.impulso_id = i.id;
  v_credito := privado.impulso_sobra_vira_credito(i.id);
  if v_credito is null then
    perform privado.avisar_pagamento(i.conta_id,
      'O impulso da vaga "' || left(i.titulo, 80) || '" terminou: o anúncio apareceu ' || t.impressoes
      || case when t.impressoes = 1 then ' vez' else ' vezes' end || ', ' || t.cliques
      || case when t.cliques = 1 then ' pessoa clicou' else ' pessoas clicaram' end || ' e ' || t.curtidas
      || case when t.curtidas = 1 then ' curtiu' else ' curtiram' end || ' a vaga. Veja o relatório.',
      '/painel/impulsionar/' || i.anuncio_id);
  else
    perform privado.avisar_pagamento(i.conta_id,
      'O impulso da vaga "' || left(i.titulo, 60) || '" terminou: ' || t.impressoes
      || case when t.impressoes = 1 then ' vista, ' else ' vistas, ' end || t.cliques
      || case when t.cliques = 1 then ' clique e ' else ' cliques e ' end || t.curtidas
      || case when t.curtidas = 1 then ' curtida. Os ' else ' curtidas. Os ' end
      || privado.reais_br((v_credito ->> 'verba')::numeric) || ' que o Google não usou viraram '
      || (v_credito ->> 'dias') || case when (v_credito ->> 'dias')::integer = 1 then ' dia' else ' dias' end
      || ' de crédito para impulsionar outra vaga até ' || privado.data_br((v_credito ->> 'ate')::timestamptz) || '.',
      '/painel/impulsionar/' || i.anuncio_id);
  end if;
end
$$;

-- a vaga saiu do ar no meio, menos no impulso do admin (era um teste do Publike):
--   * com o anúncio no ar, o que o Google não usou vira crédito (14/11/2026; antes, os dias que faltavam). Fica como
--     "credito" o que parou antes do fim e deixou crédito; o que estava na extensão da garantia fica como terminado
--     (correu o prazo inteiro);
--   * antes de ir ao ar, os dias e a verba inteiros viram crédito, como antes (o resto é o de 20270424120000).
create or replace function public.servidor_impulso_pausado(p_chave text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
  v_credito jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  select * into i from privado.impulsos where id = p_id and pausar and situacao in ('pago', 'em_revisao', 'no_ar')
    for update;
  if i.id is null then
    return;
  end if;
  if i.situacao = 'no_ar' then
    v_credito := privado.impulso_sobra_vira_credito(i.id);
    update privado.impulsos
       set situacao = case when v_credito is not null and i.estendido_em is null then 'credito' else 'encerrado' end,
           pausar = false, encerrado_em = now(),
           campanha_removida = campanha_removida or campanha_id is null,
           motivo = coalesce(i.motivo, 'A vaga saiu do ar ou foi preenchida.')
     where id = p_id;
    if v_credito is not null then
      perform privado.avisar_pagamento(i.conta_id,
        'A vaga "' || left(i.titulo, 80) || '" saiu do ar, e o anúncio no Google parou. Os '
        || privado.reais_br((v_credito ->> 'verba')::numeric) || ' que o Google não usou viraram '
        || (v_credito ->> 'dias') || case when (v_credito ->> 'dias')::integer = 1 then ' dia' else ' dias' end
        || ' de crédito para impulsionar outra vaga até ' || privado.data_br((v_credito ->> 'ate')::timestamptz) || '.',
        '/painel/anuncios');
    end if;
    return;
  end if;
  update privado.impulsos
     set situacao = case when i.origem = 'admin' then 'encerrado' else 'credito' end,
         pausar = false, encerrado_em = now(),
         campanha_removida = campanha_removida or campanha_id is null,
         motivo = coalesce(i.motivo, 'A vaga saiu do ar ou foi preenchida.')
   where id = p_id;
  if i.origem <> 'admin' then
    insert into privado.creditos_impulso (conta_id, dias, verba, de_impulso)
    values (i.conta_id, i.dias, i.verba, i.id);
    perform privado.avisar_pagamento(i.conta_id,
      'A vaga "' || left(i.titulo, 80) || '" saiu do ar, e o anúncio no Google parou. ' || i.dias
      || case when i.dias = 1 then ' dia ficou' else ' dias ficaram' end
      || ' como crédito para impulsionar outra vaga até ' || privado.data_br(now() + interval '90 days') || '.',
      '/painel/anuncios');
  end if;
end
$$;

-- a lista do robô: antes de tudo, a garantia da verba (estende o que gastou pouco antes de o "encerrar" sair). O resto
-- é o de 20270517120000.
create or replace function public.servidor_impulsos_para_cuidar(p_chave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_hoje_3h timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + time '03:00') at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_servidor(p_chave);
  -- a garantia da verba (14/11/2026): o que chegou ao fim gastando pouco ganha os dias novos antes do "encerrar" abaixo
  perform privado.garantia_da_verba();
  return coalesce((select jsonb_agg(t) from (
    select jsonb_build_object(
      'id', i.id, 'codigo', i.codigo, 'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'verba', i.verba,
      -- o automático do Publike (o nome da campanha no Google diz de onde o impulso veio)
      'automatico', i.automatico,
      -- o nome do cliente, para o nome da campanha no Google (13/11/2026, lib/impulso-nomes.ts)
      'cliente', (select left(p.nome, 60) from public.perfis p where p.id = i.conta_id),
      'campanha_id', i.campanha_id, 'grupo_id', i.grupo_id, 'anuncio_google_id', i.anuncio_google_id,
      'conta_google', i.conta_google,
      'texto_simples', i.texto_simples, 'sandbox', i.sandbox, 'ate', i.ate, 'aprovado_em', i.aprovado_em,
      'acao', case
        -- primeiro sai do Google, depois o dinheiro volta
        when i.situacao in ('devolvido', 'credito') and i.campanha_id is not null and not i.campanha_removida then 'remover'
        when i.situacao = 'devolvido' and i.origem = 'compra' and i.estorno_pedido_em is null then 'estornar'
        when i.situacao in ('pago', 'em_revisao', 'no_ar') and i.pausar then 'pausar'
        -- a campanha do cliente acabou antes de o Google aprovar esta vaga
        when i.situacao in ('pago', 'em_revisao') and k.ate is not null and k.ate <= now() then 'encerrar'
        when i.situacao = 'pago' then 'criar'
        when i.situacao = 'em_revisao' then 'olhar'
        when i.situacao = 'no_ar' and i.ate <= now() then 'encerrar'
        else 'medir' end,
      -- a vaga: para criar e olhar o anúncio e, no ar, para conferir o raio (12/11/2026), com o raio a mais do ajuste
      'vaga', case when i.situacao in ('pago', 'em_revisao', 'no_ar') then (
        select jsonb_build_object('id', a.id, 'titulo', a.titulo, 'cidade', a.cidade, 'bairro', a.bairro,
                                  'categoria', a.categoria, 'regime', a.regime, 'jornada', a.jornada,
                                  'modelo', a.modelo, 'pagamento_valor', a.pagamento_valor,
                                  'pagamento_ate', a.pagamento_ate, 'pagamento_unidade', a.pagamento_unidade,
                                  'comissao', a.comissao, 'vagas', a.vagas, 'lat', a.geo_lat, 'lng', a.geo_lng,
                                  'cbo', (select f.cbo from privado.funcoes_das_vagas f where f.anuncio_id = a.id),
                                  'raio', least(privado.raio_da_vaga(a.titulo, a.cidade) + i.raio_extra, 65))
          from public.anuncios a where a.id = i.anuncio_id) end,
      -- as buscas que a IA tirou do grupo da vaga (negativas exatas, 13/11/2026)
      'excluidas', case when i.situacao in ('pago', 'em_revisao', 'no_ar') then to_jsonb(i.buscas_excluidas) end,
      -- a campanha do cliente em que a vaga é um grupo (a conta e a campanha do Google vêm dela)
      'campanha_cliente', case when k.id is not null then
        jsonb_build_object('id', k.id, 'codigo', k.codigo, 'campanha_id', k.campanha_id, 'conta_google', k.conta_google)
        end,
      -- o lugar da vaga ainda não está na campanha do cliente: o grupo acrescenta o ponto dela (arredondado como os
      -- da campanha, para não repetir)
      'novo_lugar', case when k.id is not null and i.situacao = 'pago' then (
        select jsonb_build_object('lat', round(a.geo_lat::numeric, 4), 'lng', round(a.geo_lng::numeric, 4),
                                  'raio', least(privado.raio_da_vaga(a.titulo, a.cidade) + k.raio_extra, 65))
          from public.anuncios a
         where a.id = i.anuncio_id and a.geo_lat is not null and a.geo_lng is not null
           and not exists (select 1 from jsonb_array_elements(k.lugares) l
                            where (l ->> 'lat')::numeric = round(a.geo_lat::numeric, 4)
                              and (l ->> 'lng')::numeric = round(a.geo_lng::numeric, 4))) end,
      -- na campanha do cliente, o ponto da vaga no ar e o raio que ele deve ter: o maior das vagas que correm nele
      -- (um ponto serve a todas as vagas do mesmo lugar, como na criação da campanha), mais o raio a mais do ajuste
      'lugar', case when k.id is not null and i.situacao = 'no_ar' then (
        select jsonb_build_object('lat', round(a.geo_lat::numeric, 4), 'lng', round(a.geo_lng::numeric, 4),
                                  'raio', least((select max(privado.raio_da_vaga(b.titulo, b.cidade))
                                                   from privado.impulsos j join public.anuncios b on b.id = j.anuncio_id
                                                  where j.campanha_cliente_id = k.id
                                                    and j.situacao in ('pago', 'em_revisao', 'no_ar')
                                                    and round(b.geo_lat::numeric, 4) = round(a.geo_lat::numeric, 4)
                                                    and round(b.geo_lng::numeric, 4) = round(a.geo_lng::numeric, 4))
                                                + k.raio_extra, 65))
          from public.anuncios a
         where a.id = i.anuncio_id and a.geo_lat is not null and a.geo_lng is not null) end,
      -- medir: do dia em que entrou no ar até hoje
      'medir_desde', ((coalesce(i.aprovado_em, i.no_google_em, i.criado_em)) at time zone 'America/Sao_Paulo')::date,
      'compra', case when i.origem = 'compra' then
        (select jsonb_build_object('asaas_id', c.asaas_id, 'sandbox', c.sandbox, 'valor', c.valor)
           from privado.compras_avulsas c where c.id = i.compra_id) end) as t,
      i.criado_em
    from privado.impulsos i
    left join privado.impulso_campanhas k on k.id = i.campanha_cliente_id
    where (i.proxima_tentativa is null or i.proxima_tentativa <= now())
      and (
        (i.situacao = 'devolvido' and i.origem = 'compra' and i.estorno_pedido_em is null)
        or (i.situacao in ('devolvido', 'credito') and i.campanha_id is not null and not i.campanha_removida)
        or (i.situacao in ('pago', 'em_revisao', 'no_ar') and i.pausar)
        or (i.situacao in ('pago', 'em_revisao') and k.ate is not null and k.ate <= now())
        -- a vaga da campanha do cliente espera a campanha nascer no Google
        or (i.situacao = 'pago' and (k.id is null or k.campanha_id is not null))
        or (i.situacao = 'em_revisao' and (i.olhado_em is null or i.olhado_em < now() - interval '25 minutes'))
        or (i.situacao = 'no_ar' and i.ate <= now())
        -- os números até hoje, a cada 2 horas; o raio mudou no admin (ou no ajuste): medido_em volta a null, e a
        -- medida sai na volta seguinte
        or (i.situacao = 'no_ar' and (i.medido_em is null or i.medido_em < now() - interval '2 hours'))
        or (i.situacao = 'encerrado' and i.encerrado_em > now() - interval '2 days'
            and (i.medido_em is null or i.medido_em < v_hoje_3h) and now() >= v_hoje_3h))
    order by i.criado_em
    limit 25) q), '[]'::jsonb);
end
$function$
;

-- a página do impulso da vaga: a extensão da garantia (a da campanha, na vaga do cliente) e o crédito que o impulso
-- deixou. O resto é o de 20270516120000.
create or replace function public.impulso_da_vaga(p_anuncio uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  conta uuid := public.conta_atual();
  a public.anuncios;
begin
  if (select auth.uid()) is null or conta is null then
    return null;
  end if;
  select * into a from public.anuncios where id = p_anuncio and autor_id = conta and tipo = 'vaga';
  if a.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'vaga', jsonb_build_object('id', a.id, 'titulo', a.titulo, 'cidade', a.cidade, 'bairro', a.bairro,
                               'status', a.status, 'preenchida', a.preenchida_em is not null,
                               'pagamento_valor', a.pagamento_valor, 'pagamento_ate', a.pagamento_ate,
                               'pagamento_unidade', a.pagamento_unidade, 'regime', a.regime, 'jornada', a.jornada),
    'motivo', privado.impulso_motivo_vaga(conta, a.id),
    'pode_pagar', privado.pode_pagar(conta),
    'precos', coalesce((select jsonb_agg(jsonb_build_object('dias', p.dias, 'valor', p.valor, 'verba', p.verba, 'dias_rapido', p.dias_rapido)
                                         order by p.dias)
                          from privado.precos_impulso p where p.ligado), '[]'::jsonb),
    'credito', privado.dias_de_credito(conta),
    'cortesia', case when privado.impulso_cortesia_disponivel(conta, a.id)
                     then (select jsonb_build_object('dias', c.cortesia_dias) from privado.config_impulso c where c.id) end,
    'raio', privado.raio_da_vaga(a.titulo, a.cidade),
    'ajuste_ligado', coalesce((select c.motor_ligado from privado.config_impulso c where c.id), false),
    -- na campanha do cliente, a verba é uma só para as vagas dele: o cliente vê a da campanha e quantas vagas ela tem
    'impulsos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'valor', i.valor,
        'verba', coalesce(k.verba, i.verba),
        'gasto', case when k.id is not null
                      then least((select coalesce(sum(x.gasto), 0) from privado.impulsos x where x.campanha_cliente_id = k.id),
                                 k.verba)
                      else least(i.gasto, i.verba) end,
        'campanha_vagas', case when k.id is not null
                               then (select count(*) from privado.impulsos x where x.campanha_cliente_id = k.id) end,
        'motivo', i.motivo, 'criado_em', i.criado_em, 'aprovado_em', i.aprovado_em,
        'ate', i.ate, 'encerrado_em', i.encerrado_em, 'pausar', i.pausar,
        -- a garantia da verba (14/11/2026): quando o prazo foi estendido e qual era o fim antes; na vaga do cliente, os
        -- da campanha. E o crédito que o impulso deixou (o que o Google não usou, a vaga que fechou, o cancelado).
        'estendido_em', case when k.id is not null then k.estendido_em else i.estendido_em end,
        'ate_original', case when k.id is not null then k.ate_original else i.ate_original end,
        'virou_credito', (select jsonb_build_object('dias', c.dias, 'verba', c.verba)
                            from privado.creditos_impulso c where c.de_impulso = i.id
                           order by c.criado_em desc limit 1),
        'totais', (select jsonb_build_object('impressoes', coalesce(sum(d.impressoes), 0),
                                             'cliques', coalesce(sum(d.cliques), 0),
                                             'visitas', coalesce(sum(d.visitas), 0),
                                             'curtidas', coalesce(sum(d.curtidas), 0))
                     from privado.impulso_dias d where d.impulso_id = i.id),
        'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', d.dia, 'impressoes', d.impressoes,
                                                                 'cliques', d.cliques, 'visitas', d.visitas,
                                                                 'curtidas', d.curtidas) order by d.dia)
                               from privado.impulso_dias d where d.impulso_id = i.id), '[]'::jsonb),
        -- o ajuste diário (beta): as manhãs com o que mudou, as mais novas primeiro
        'ajustes', coalesce((select jsonb_agg(jsonb_build_object('dia', j.dia, 'mudancas', j.mudancas) order by j.dia desc)
                               from (select z.dia,
                                            (select coalesce(jsonb_agg(m), '[]'::jsonb) from jsonb_array_elements(z.mudancas) m
                                              where m ->> 'impulso_id' is null or m ->> 'impulso_id' = i.id::text) as mudancas
                                       from privado.impulso_ajustes z
                                      where z.erro is null
                                        and (z.impulso_id = i.id
                                             or (i.campanha_cliente_id is not null
                                                 and z.campanha_cliente_id = i.campanha_cliente_id))
                                      order by z.dia desc limit 20) j), '[]'::jsonb))
        order by i.criado_em desc)
      from privado.impulsos i
      left join privado.impulso_campanhas k on k.id = i.campanha_cliente_id
     where i.anuncio_id = a.id and i.conta_id = conta), '[]'::jsonb),
    -- a compra paga esperando virar impulso (o aviso do pagamento chega em segundos) ou o Pix gerado
    'compra_pendente', (select jsonb_build_object('id', k.id, 'situacao', k.situacao, 'dias', k.dias,
                                                  'cobranca', (select c.id from privado.cobrancas c where c.compra_id = k.id
                                                                order by c.criada_em desc limit 1))
                          from privado.compras_avulsas k
                         where k.anuncio_id = a.id and k.conta_id = conta and k.tipo = 'impulso'
                           and k.situacao = 'pendente' and k.asaas_id is not null
                           and k.criada_em > now() - interval '1 day'
                         order by k.criada_em desc limit 1));
end
$function$
;

-- Admin › Impulsos: a extensão da garantia nas vagas e nas campanhas dos clientes. O resto é o de 20270430120000.
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
      'cliques', coalesce((select sum(d.cliques) from privado.impulso_dias d where d.dia >= v_mes::date), 0),
      'curtidas', coalesce((select sum(d.curtidas) from privado.impulso_dias d where d.dia >= v_mes::date), 0),
      'impulsos', (select count(*) from privado.impulsos i where i.criado_em >= v_mes),
      -- o automático do Publike no mês: o que já foi separado (o gasto de verdade nos encerrados) e quantos
      'automatico_verba', privado.verba_automatica_do_mes(),
      'automaticos', (select count(*) from privado.impulsos i where i.automatico and i.criado_em >= v_mes),
      'automaticos_no_ar', (select count(*) from privado.impulsos i
                             where i.automatico and i.situacao in ('pago', 'em_revisao', 'no_ar'))),
    'tipos', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'dias', t.dias,
                                                           'verba', t.verba, 'raio', t.raio) order by t.ordem, t.nome)
                         from privado.tipos_de_vaga t), '[]'::jsonb),
    -- as campanhas dos clientes: as que correm e as dos últimos 60 dias
    'campanhas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', k.id, 'conta_id', k.conta_id, 'nome', k.nome, 'situacao', k.situacao, 'dias', k.dias, 'verba', k.verba,
        'criado_em', k.criado_em, 'aprovado_em', k.aprovado_em, 'ate', k.ate, 'encerrado_em', k.encerrado_em,
        'motivo', k.motivo, 'erro', k.ultimo_erro, 'erro_desde', k.erro_desde, 'campanha_id', k.campanha_id,
        -- a garantia da verba (14/11/2026)
        'estendido_em', k.estendido_em, 'ate_original', k.ate_original)
        order by k.criado_em desc)
      from privado.impulso_campanhas k
     where k.situacao in ('pago', 'em_revisao', 'no_ar') or k.criado_em > now() - interval '60 days'), '[]'::jsonb),
    'impulsos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'conta', p.nome, 'conta_id', i.conta_id, 'anuncio_id', i.anuncio_id, 'titulo', i.titulo,
        'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'valor', i.valor, 'verba', i.verba,
        'gasto', i.gasto, 'campanha_id', i.campanha_id, 'criado_em', i.criado_em, 'aprovado_em', i.aprovado_em,
        'ate', i.ate, 'pausar', i.pausar, 'erro', i.ultimo_erro, 'erro_desde', i.erro_desde, 'motivo', i.motivo,
        'sandbox', i.sandbox, 'automatico', i.automatico, 'campanha_cliente_id', i.campanha_cliente_id,
        'estendido_em', i.estendido_em, 'ate_original', i.ate_original,
        'tipo', (select t.nome from privado.tipos_de_vaga t where t.id = privado.tipo_da_vaga(i.titulo)),
        'totais', (select jsonb_build_object('impressoes', coalesce(sum(d.impressoes), 0),
                                             'cliques', coalesce(sum(d.cliques), 0),
                                             'visitas', coalesce(sum(d.visitas), 0),
                                             'curtidas', coalesce(sum(d.curtidas), 0))
                     from privado.impulso_dias d where d.impulso_id = i.id))
        order by i.criado_em desc)
      from (select * from privado.impulsos x
             where x.situacao in ('pago', 'em_revisao', 'no_ar')
                or x.id in (select y.id from privado.impulsos y order by y.criado_em desc limit 200)) i
      join public.perfis p on p.id = i.conta_id), '[]'::jsonb),
    -- o que cada tipo rendeu nos últimos 90 dias (pelo tipo de hoje do título)
    'por_tipo', coalesce((select jsonb_agg(to_jsonb(r) order by r.gasto desc, r.tipo) from (
        select coalesce((select t.nome from privado.tipos_de_vaga t where t.id = privado.tipo_da_vaga(i.titulo)),
                        'Outros') as tipo,
               count(*) as impulsos, coalesce(sum(i.gasto), 0) as gasto,
               coalesce(sum(d.impressoes), 0) as impressoes, coalesce(sum(d.cliques), 0) as cliques,
               coalesce(sum(d.visitas), 0) as visitas, coalesce(sum(d.curtidas), 0) as curtidas
          from privado.impulsos i
          left join lateral (select sum(x.impressoes) as impressoes, sum(x.cliques) as cliques,
                                    sum(x.visitas) as visitas, sum(x.curtidas) as curtidas
                               from privado.impulso_dias x where x.impulso_id = i.id) d on true
         where i.criado_em > now() - interval '90 days' and i.situacao <> 'devolvido'
         group by 1) r), '[]'::jsonb));
end
$$;

notify pgrst, 'reload schema';
