-- O ajuste diário do impulso, em beta (13/11/2026, claude/plano-impulsionar-vaga.md). Pedido do Marcelo: "um motor que
-- olha o resultado e ajusta as velas automaticamente para melhorar o desempenho do impulso"; a cada hora não vale (o
-- Google traz os números com horas de atraso e, com R$ 4 por dia, uma hora quase não tem dado), então é uma vez por
-- dia, de manhã, com o dia anterior inteiro. "Entra como BETA, será cobrado depois": no beta vale para todo impulso
-- no ar, sem custo; o admin liga e desliga em Admin › Impulsos › Regras.
--
-- Toda manhã, para cada campanha no ar no Google (o impulso de uma vaga ou a campanha do cliente), o robô
-- (src/lib/servidor/impulso-ajuste.ts) lê os números e:
-- 1. a verba do dia: o que sobrou vai para os dias que faltam (e o que passou sai deles), sem passar da verba;
-- 2. o lance: perdia buscas por lance baixo e sobrava verba, o clique pode custar mais (até o teto); a verba acabava
--    cedo, o clique custa menos e rende mais cliques;
-- 3. as buscas: a IA lê as buscas de verdade de quem viu o anúncio e tira as que não são desta vaga (palavra negativa
--    exata no grupo da vaga: só aquela busca, nada mais);
-- 4. o raio: com poucas buscas perto da vaga e a verba sobrando, 5 km a mais em volta (até o máximo das Regras).
-- Cada manhã fica no diário do impulso (privado.impulso_ajustes): o cliente vê na página do impulso e o admin em
-- Admin › Impulsos. Pode rodar de novo.

-- ------------------------------------------------------------------ as regras e o que fica em cada impulso

alter table privado.config_impulso
  add column if not exists motor_ligado boolean not null default true,
  -- o lance nunca passa disso (o de partida é R$ 2 por clique)
  add column if not exists motor_teto_clique numeric(6,2) not null default 3.50
    check (motor_teto_clique between 1 and 10),
  -- quantos km o ajuste pode pôr a mais no raio da vaga
  add column if not exists motor_raio_max smallint not null default 10 check (motor_raio_max between 0 and 30);

alter table privado.impulsos
  add column if not exists ajuste_em timestamptz,
  -- os km que o ajuste pôs a mais no raio (o robô soma ao raio da vaga)
  add column if not exists raio_extra smallint not null default 0 check (raio_extra between 0 and 30),
  -- as buscas de verdade que a IA tirou do grupo da vaga (negativas exatas) e as que ela viu e deixou
  add column if not exists buscas_excluidas text[] not null default '{}',
  add column if not exists buscas_vistas text[] not null default '{}';

alter table privado.impulso_campanhas
  add column if not exists ajuste_em timestamptz,
  add column if not exists raio_extra smallint not null default 0 check (raio_extra between 0 and 30);

-- o diário: uma linha por manhã de cada campanha (a de uma vaga ou a do cliente), com o que o robô viu e mudou
create table if not exists privado.impulso_ajustes (
  id uuid primary key default gen_random_uuid(),
  impulso_id uuid references privado.impulsos(id) on delete cascade,
  campanha_cliente_id uuid references privado.impulso_campanhas(id) on delete cascade,
  dia date not null,
  feito_em timestamptz not null default now(),
  -- o que o robô viu (os números da janela, a verba, o lance, o raio)
  numeros jsonb not null default '{}'::jsonb,
  -- o que mudou: [{tipo: verba|lance|raio|buscas|pausa|nada, impulso_id?, antes, depois, texto, porque}]
  mudancas jsonb not null default '[]'::jsonb,
  erro text,
  check (num_nonnulls(impulso_id, campanha_cliente_id) = 1)
);
create unique index if not exists impulso_ajustes_do_impulso on privado.impulso_ajustes (impulso_id, dia)
  where impulso_id is not null;
create unique index if not exists impulso_ajustes_da_campanha on privado.impulso_ajustes (campanha_cliente_id, dia)
  where campanha_cliente_id is not null;
create index if not exists impulso_ajustes_recentes on privado.impulso_ajustes (feito_em desc);
alter table privado.impulso_ajustes enable row level security;
revoke all on privado.impulso_ajustes from public, anon, authenticated;

-- ------------------------------------------------------------------ o robô: o que ajustar hoje

-- a vaga como o robô usa (o anúncio, a IA e as buscas já julgadas)
create or replace function privado.vaga_do_ajuste(p_impulso uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'impulso_id', i.id, 'codigo', i.codigo, 'grupo_id', i.grupo_id, 'texto_simples', i.texto_simples,
           'excluidas', to_jsonb(i.buscas_excluidas), 'vistas', to_jsonb(i.buscas_vistas),
           'vaga', jsonb_build_object('id', a.id, 'titulo', a.titulo, 'cidade', a.cidade, 'bairro', a.bairro,
                                      'categoria', a.categoria, 'regime', a.regime, 'jornada', a.jornada,
                                      'modelo', a.modelo, 'pagamento_valor', a.pagamento_valor,
                                      'pagamento_ate', a.pagamento_ate, 'pagamento_unidade', a.pagamento_unidade,
                                      'comissao', a.comissao, 'vagas', a.vagas, 'lat', a.geo_lat, 'lng', a.geo_lng,
                                      'cbo', (select f.cbo from privado.funcoes_das_vagas f where f.anuncio_id = a.id),
                                      'raio', privado.raio_da_vaga(a.titulo, a.cidade)))
    from privado.impulsos i join public.anuncios a on a.id = i.anuncio_id
   where i.id = p_impulso
$$;

-- As campanhas para ajustar agora: com o ajuste ligado, depois das 6h, uma vez por dia cada. A campanha no ar há pelo
-- menos 18 horas (o primeiro dia já tem números) e que não acaba nas próximas 6 (não vale mexer). Até 3 por vez.
create or replace function public.servidor_ajustes_para_fazer(p_chave text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_hoje_6h timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + time '06:00') at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.config_impulso where id;
  if c.id is null or not c.motor_ligado or now() < v_hoje_6h then
    return jsonb_build_object('itens', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'hoje', v_hoje,
    'teto_clique', c.motor_teto_clique,
    'raio_max', c.motor_raio_max,
    'itens', coalesce((select jsonb_agg(x.t order by x.em nulls first, x.criado) from (
      select * from (
        -- o impulso de uma vaga: a campanha é só dele
        select jsonb_build_object(
                 'tipo', 'impulso', 'id', i.id, 'codigo', i.codigo, 'campanha_id', i.campanha_id,
                 'conta_google', i.conta_google, 'verba', i.verba, 'dias', i.dias, 'gasto', i.gasto,
                 'aprovado_em', i.aprovado_em, 'ate', i.ate, 'raio_extra', i.raio_extra,
                 'raio', privado.raio_da_vaga(a.titulo, a.cidade),
                 'vagas', jsonb_build_array(privado.vaga_do_ajuste(i.id))) as t,
               i.ajuste_em as em, i.criado_em as criado
          from privado.impulsos i join public.anuncios a on a.id = i.anuncio_id
         where i.situacao = 'no_ar' and i.campanha_cliente_id is null and i.campanha_id is not null and not i.pausar
           and i.aprovado_em <= now() - interval '18 hours' and i.ate > now() + interval '6 hours'
           and (i.ajuste_em is null or i.ajuste_em < v_hoje_6h)
           and (i.proxima_tentativa is null or i.proxima_tentativa <= now())
        union all
        -- a campanha do cliente: a verba, o lance e o raio são dela; as buscas, de cada vaga (o grupo dela)
        select jsonb_build_object(
                 'tipo', 'cliente', 'id', k.id, 'codigo', k.codigo, 'campanha_id', k.campanha_id,
                 'conta_google', k.conta_google, 'verba', k.verba, 'dias', k.dias,
                 'gasto', (select coalesce(sum(j.gasto), 0) from privado.impulsos j where j.campanha_cliente_id = k.id),
                 'aprovado_em', k.aprovado_em, 'ate', k.ate, 'raio_extra', k.raio_extra,
                 'raio', (select max(privado.raio_da_vaga(b.titulo, b.cidade))
                            from privado.impulsos j join public.anuncios b on b.id = j.anuncio_id
                           where j.campanha_cliente_id = k.id and j.situacao in ('pago', 'em_revisao', 'no_ar')),
                 'vagas', coalesce((select jsonb_agg(privado.vaga_do_ajuste(j.id) order by j.criado_em)
                                      from privado.impulsos j
                                     where j.campanha_cliente_id = k.id and j.situacao = 'no_ar' and not j.pausar
                                       and j.grupo_id is not null and j.anuncio_id is not null), '[]'::jsonb)),
               k.ajuste_em, k.criado_em
          from privado.impulso_campanhas k
         where k.situacao = 'no_ar' and k.campanha_id is not null
           and k.aprovado_em <= now() - interval '18 hours' and k.ate > now() + interval '6 hours'
           and (k.ajuste_em is null or k.ajuste_em < v_hoje_6h)
           and (k.proxima_tentativa is null or k.proxima_tentativa <= now())
           and exists (select 1 from privado.impulsos j where j.campanha_cliente_id = k.id and j.situacao = 'no_ar')
      ) y order by y.em nulls first, y.criado limit 3) x), '[]'::jsonb));
end
$$;

-- O robô pega a campanha para ajustar agora: marca a manhã de hoje, só se ninguém marcou (duas voltas das filas ao
-- mesmo tempo não ajustam duas vezes; o lance subiria duas vezes). Devolve se pegou.
create or replace function public.servidor_ajuste_comecou(p_chave text, p_tipo text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje_6h timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + time '06:00') at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_servidor(p_chave);
  if p_tipo = 'impulso' then
    update privado.impulsos set ajuste_em = now() where id = p_id and (ajuste_em is null or ajuste_em < v_hoje_6h);
  elsif p_tipo = 'cliente' then
    update privado.impulso_campanhas set ajuste_em = now()
     where id = p_id and (ajuste_em is null or ajuste_em < v_hoje_6h);
  else
    return false;
  end if;
  return found;
end
$$;

-- A manhã do ajuste ficou feita: o diário do dia (de novo no mesmo dia, troca), o raio a mais (a medida seguinte leva
-- o raio novo ao Google: medido_em volta a null) e as buscas que a IA julgou ({impulso_id: {fora: [], vistas: []}}).
-- Com erro, fica o erro no diário e o ajuste volta amanhã.
create or replace function public.servidor_ajuste_feito(p_chave text, p_tipo text, p_id uuid, p_numeros jsonb,
                                                        p_mudancas jsonb, p_raio_extra integer, p_buscas jsonb,
                                                        p_erro text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_raio smallint := case when p_raio_extra is null then null else least(greatest(p_raio_extra, 0), 30)::smallint end;
  v_mudou boolean := false;
  b record;
begin
  perform privado.exigir_servidor(p_chave);
  if p_tipo = 'impulso' then
    insert into privado.impulso_ajustes (impulso_id, dia, numeros, mudancas, erro)
    values (p_id, v_hoje, coalesce(p_numeros, '{}'::jsonb), coalesce(p_mudancas, '[]'::jsonb), left(p_erro, 500))
    on conflict (impulso_id, dia) where impulso_id is not null do update
      set feito_em = now(), numeros = excluded.numeros, mudancas = excluded.mudancas, erro = excluded.erro;
    select v_raio is not null and v_raio <> i.raio_extra into v_mudou from privado.impulsos i where i.id = p_id;
    update privado.impulsos
       set ajuste_em = now(), raio_extra = coalesce(v_raio, raio_extra),
           medido_em = case when coalesce(v_mudou, false) then null else medido_em end
     where id = p_id;
  elsif p_tipo = 'cliente' then
    insert into privado.impulso_ajustes (campanha_cliente_id, dia, numeros, mudancas, erro)
    values (p_id, v_hoje, coalesce(p_numeros, '{}'::jsonb), coalesce(p_mudancas, '[]'::jsonb), left(p_erro, 500))
    on conflict (campanha_cliente_id, dia) where campanha_cliente_id is not null do update
      set feito_em = now(), numeros = excluded.numeros, mudancas = excluded.mudancas, erro = excluded.erro;
    select v_raio is not null and v_raio <> k.raio_extra into v_mudou from privado.impulso_campanhas k where k.id = p_id;
    update privado.impulso_campanhas set ajuste_em = now(), raio_extra = coalesce(v_raio, raio_extra) where id = p_id;
    if coalesce(v_mudou, false) then
      update privado.impulsos set medido_em = null where campanha_cliente_id = p_id and situacao = 'no_ar';
    end if;
  else
    raise exception 'Tipo de ajuste desconhecido.';
  end if;
  -- as buscas julgadas, só dos impulsos desta campanha (até 500 de cada lista, as mais novas primeiro)
  for b in select key::uuid as id, value as v from jsonb_each(coalesce(p_buscas, '{}'::jsonb))
            where key ~ '^[0-9a-f-]{36}$' and jsonb_typeof(value) = 'object' loop
    update privado.impulsos i
       set buscas_excluidas = (select coalesce(array_agg(x order by n), '{}') from (
                                 select x, min(n) as n from unnest(
                                   array(select left(lower(btrim(e)), 80) from jsonb_array_elements_text(
                                           case when jsonb_typeof(b.v -> 'fora') = 'array' then b.v -> 'fora'
                                                else '[]'::jsonb end) e where btrim(e) <> '')
                                   || i.buscas_excluidas) with ordinality u(x, n)
                                 group by x order by min(n) limit 500) z),
           buscas_vistas = (select coalesce(array_agg(x order by n), '{}') from (
                              select x, min(n) as n from unnest(
                                array(select left(lower(btrim(e)), 80) from jsonb_array_elements_text(
                                        case when jsonb_typeof(b.v -> 'vistas') = 'array' then b.v -> 'vistas'
                                             else '[]'::jsonb end) e where btrim(e) <> '')
                                || i.buscas_vistas) with ordinality u(x, n)
                              group by x order by min(n) limit 500) z)
     where i.id = b.id
       and ((p_tipo = 'impulso' and i.id = p_id) or (p_tipo = 'cliente' and i.campanha_cliente_id = p_id));
  end loop;
end
$$;

-- ------------------------------------------------------------------ o robô: o raio a mais e as buscas tiradas

-- A mesma de 20270504120000, com o raio a mais do ajuste (no impulso de uma vaga, no lugar novo e no ponto da
-- campanha do cliente; nunca mais de 65 km) e as buscas que a IA tirou (o grupo da vaga mantém as negativas exatas).
create or replace function public.servidor_impulsos_para_cuidar(p_chave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje_3h timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + time '03:00') at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((select jsonb_agg(t) from (
    select jsonb_build_object(
      'id', i.id, 'codigo', i.codigo, 'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'verba', i.verba,
      -- o automático do Publike (o nome da campanha no Google diz de onde o impulso veio)
      'automatico', i.automatico,
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
$$;

-- ------------------------------------------------------------------ o que o cliente vê

-- A mesma de 20270430120000, com o ajuste diário de cada impulso (só o que mudou de verdade, sem os erros; na
-- campanha do cliente, o da campanha e o do grupo desta vaga) e se o ajuste está ligado.
create or replace function public.impulso_da_vaga(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    'precos', coalesce((select jsonb_agg(jsonb_build_object('dias', p.dias, 'valor', p.valor, 'verba', p.verba)
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
$$;

-- ------------------------------------------------------------------ o que o admin vê e muda

-- o diário dos últimos 14 dias, de todas as campanhas (com os erros)
create or replace function public.admin_impulso_ajustes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_impulsos_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
           'id', j.id, 'dia', j.dia, 'feito_em', j.feito_em, 'numeros', j.numeros, 'mudancas', j.mudancas,
           'erro', j.erro,
           'tipo', case when j.impulso_id is not null then 'impulso' else 'cliente' end,
           'titulo', coalesce(i.titulo, 'Campanha de ' || k.nome),
           'conta', coalesce(p.nome, k.nome, ''),
           'anuncio_id', i.anuncio_id,
           -- na campanha do cliente, o título de cada vaga (as buscas são de um grupo)
           'vagas', case when k.id is not null then
             (select jsonb_object_agg(x.id::text, x.titulo) from privado.impulsos x where x.campanha_cliente_id = k.id) end)
           order by j.feito_em desc)
      from (select * from privado.impulso_ajustes z where z.dia >= (now() at time zone 'America/Sao_Paulo')::date - 14
             order by z.feito_em desc limit 150) j
      left join privado.impulsos i on i.id = j.impulso_id
      left join privado.impulso_campanhas k on k.id = j.campanha_cliente_id
      left join public.perfis p on p.id = i.conta_id), '[]'::jsonb);
end
$$;

-- A mesma de 20270428120000, com o ajuste diário (ligado, o teto do clique e o raio a mais)
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
           auto_avisar = coalesce((p_config ->> 'auto_avisar')::boolean, auto_avisar),
           motor_ligado = coalesce((p_config ->> 'motor_ligado')::boolean, motor_ligado),
           motor_teto_clique = coalesce((p_config ->> 'motor_teto_clique')::numeric, motor_teto_clique),
           motor_raio_max = coalesce((p_config ->> 'motor_raio_max')::smallint, motor_raio_max)
     where id;
  end if;
  perform privado.registrar('precos_impulso', 'config', 'impulso', 'Preços e regras do impulso',
                            jsonb_build_object('precos', p_precos, 'config', p_config));
end
$$;

-- ------------------------------------------------------------------ permissões

revoke execute on function privado.vaga_do_ajuste(uuid) from public, anon, authenticated;
-- como as outras do servidor: a chave do servidor (p_chave) é quem protege
revoke execute on function public.servidor_ajustes_para_fazer(text), public.servidor_ajuste_comecou(text, text, uuid),
  public.servidor_ajuste_feito(text, text, uuid, jsonb, jsonb, integer, jsonb, text),
  public.servidor_impulsos_para_cuidar(text) from public;
grant execute on function public.servidor_ajustes_para_fazer(text), public.servidor_ajuste_comecou(text, text, uuid),
  public.servidor_ajuste_feito(text, text, uuid, jsonb, jsonb, integer, jsonb, text),
  public.servidor_impulsos_para_cuidar(text) to anon, authenticated, service_role;
revoke execute on function public.impulso_da_vaga(uuid) from public, anon;
grant execute on function public.impulso_da_vaga(uuid) to authenticated;
revoke execute on function public.admin_impulso_ajustes(), public.admin_salvar_impulso(jsonb, jsonb) from public, anon;
grant execute on function public.admin_impulso_ajustes(), public.admin_salvar_impulso(jsonb, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
