-- O impulso da vaga (claude/plano-impulsionar-vaga.md): quem contrata paga, e o Publike anuncia aquela vaga no Google
-- para quem está perto, por 7 ou 15 dias. Uma campanha de pesquisa por vaga, criada, olhada, medida e encerrada pelo
-- robô das filas pela API do Google Ads (src/lib/servidor/impulsos.ts): nada é feito à mão.
-- Dentro do Publike nada muda (regra de 24/10): a vaga impulsionada não sobe na lista nem ganha selo para quem procura.
-- Os preços nascem desligados: o Marcelo liga em Admin › Impulsos depois de ligar o Google Ads. Pode rodar de novo.

-- ------------------------------------------------------------------ preços e configuração

create table if not exists privado.precos_impulso (
  dias smallint primary key check (dias between 1 and 60),
  valor numeric(10,2) not null check (valor > 0),
  -- quanto do valor vai para o anúncio (o resto paga a taxa, o imposto e o Publike)
  verba numeric(10,2) not null check (verba > 0),
  ligado boolean not null default false,
  check (verba < valor)
);
alter table privado.precos_impulso enable row level security;
revoke all on privado.precos_impulso from public, anon, authenticated;
insert into privado.precos_impulso (dias, valor, verba, ligado) values (7, 49.00, 30.00, false), (15, 89.00, 55.00, false)
on conflict (dias) do nothing;

create table if not exists privado.config_impulso (
  id boolean primary key default true check (id),
  -- o primeiro impulso grátis (conta conferida com vaga parada): os dias e a verba, desligado até o Marcelo ligar
  cortesia_ligada boolean not null default false,
  cortesia_dias smallint not null default 3 check (cortesia_dias between 1 and 15),
  cortesia_verba numeric(10,2) not null default 15 check (cortesia_verba between 1 and 200),
  -- o raio do anúncio em volta da vaga, em km: na capital e nas outras cidades
  raio_capital smallint not null default 10 check (raio_capital between 1 and 65),
  raio_outras smallint not null default 15 check (raio_outras between 1 and 65),
  -- o último alerta de erro da API para o Admin (no máximo um a cada 6 horas)
  alerta_erro_em timestamptz
);
alter table privado.config_impulso enable row level security;
revoke all on privado.config_impulso from public, anon, authenticated;
insert into privado.config_impulso (id) values (true) on conflict (id) do nothing;

-- ------------------------------------------------------------------ a compra avulsa aceita o impulso

alter table privado.compras_avulsas drop constraint if exists compras_avulsas_tipo_check;
alter table privado.compras_avulsas add constraint compras_avulsas_tipo_check
  check (tipo in ('trinta_dias', 'faixa', 'impulso'));
alter table privado.compras_avulsas add column if not exists anuncio_id uuid references public.anuncios(id) on delete set null;
alter table privado.compras_avulsas add column if not exists verba numeric(10,2);

alter table privado.cobrancas drop constraint if exists cobrancas_recurso_check;
alter table privado.cobrancas add constraint cobrancas_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo', 'salarios', 'carreiras',
                     'empresa_5', 'empresa_20', 'empresa_50', 'agencia_15', 'agencia_200', 'impulso'));

create or replace function privado.nome_do_recurso(p_recurso text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_recurso
           when 'copiloto' then 'recurso Triagem com IA'
           when 'combo' then 'combo Triagem + Teste Prático'
           when 'completo' then 'Plano Completo'
           when 'salarios' then 'recurso Consulta de salários'
           when 'video' then 'recurso Entrevista em vídeo'
           when 'automacoes' then 'recurso Automações personalizadas'
           when 'carreiras' then 'recurso Página de carreiras'
           when 'empresa_5' then 'Plano Empresa até 5 vagas'
           when 'empresa_20' then 'Plano Empresa até 20 vagas'
           when 'empresa_50' then 'Plano Empresa até 50 vagas'
           when 'agencia_15' then 'Plano Agência até 15 vagas'
           when 'agencia_200' then 'Plano Agência até 200 vagas'
           when 'impulso' then 'Impulso no Google'
           else 'Teste Prático' end
$$;

-- ------------------------------------------------------------------ os impulsos

create table if not exists privado.impulsos (
  id uuid primary key default gen_random_uuid(),
  -- o código curto do anúncio (utm_content): conta as visitas e as curtidas que vieram dele
  codigo text not null unique default substr(md5(gen_random_uuid()::text), 1, 10) check (codigo ~ '^[a-z0-9]{6,20}$'),
  conta_id uuid not null references public.perfis(id) on delete cascade,
  anuncio_id uuid references public.anuncios(id) on delete set null,
  -- o título da vaga na hora: o relatório continua depois que a vaga sai
  titulo text not null,
  compra_id uuid references privado.compras_avulsas(id) on delete set null,
  -- compra: pago; credito: os dias de um impulso interrompido; cortesia: o primeiro grátis
  origem text not null check (origem in ('compra', 'credito', 'cortesia')),
  dias smallint not null check (dias between 1 and 60),
  valor numeric(10,2) not null default 0,
  verba numeric(10,2) not null check (verba > 0),
  -- pago: esperando o robô criar; em_revisao: o Google revisa o anúncio; no_ar: os dias contam;
  -- encerrado: acabou; credito: interrompido (a vaga fechou), virou crédito; devolvido: o dinheiro voltou
  situacao text not null default 'pago'
    check (situacao in ('pago', 'em_revisao', 'no_ar', 'encerrado', 'credito', 'devolvido')),
  -- a vaga fechou ou foi marcada como preenchida: o robô tira do Google e transforma o resto em crédito
  pausar boolean not null default false,
  motivo text,
  -- no Google Ads (os ids, sem o "customers/…")
  campanha_id text check (campanha_id ~ '^[0-9]{1,20}$'),
  orcamento_id text check (orcamento_id ~ '^[0-9]{1,20}$'),
  grupo_id text check (grupo_id ~ '^[0-9]{1,20}$'),
  anuncio_google_id text check (anuncio_google_id ~ '^[0-9]{1,20}$'),
  campanha_removida boolean not null default false,
  -- o anúncio reprovado ganha uma segunda chance com o texto mais simples
  texto_simples boolean not null default false,
  -- os erros da API: o robô tenta de novo com espera crescente
  tentativas smallint not null default 0,
  proxima_tentativa timestamptz,
  ultimo_erro text,
  erro_desde timestamptz,
  olhado_em timestamptz,
  medido_em timestamptz,
  estorno_pedido_em timestamptz,
  sandbox boolean not null default false,
  criado_em timestamptz not null default now(),
  no_google_em timestamptz,
  aprovado_em timestamptz,
  ate timestamptz,
  encerrado_em timestamptz,
  -- o custo no Google (a soma dos dias)
  gasto numeric(10,2) not null default 0
);
create index if not exists impulsos_conta on privado.impulsos (conta_id, criado_em desc);
create index if not exists impulsos_anuncio on privado.impulsos (anuncio_id, criado_em desc);
create index if not exists impulsos_robo on privado.impulsos (situacao) where situacao in ('pago', 'em_revisao', 'no_ar');
-- um impulso valendo por vaga
create unique index if not exists impulsos_um_por_vaga on privado.impulsos (anuncio_id)
  where situacao in ('pago', 'em_revisao', 'no_ar') and anuncio_id is not null;
alter table privado.impulsos enable row level security;
revoke all on privado.impulsos from public, anon, authenticated;

-- os números de cada dia: os do Publike (visitas e curtidas que vieram do anúncio) e os do Google
create table if not exists privado.impulso_dias (
  impulso_id uuid not null references privado.impulsos(id) on delete cascade,
  dia date not null,
  visitas integer not null default 0 check (visitas >= 0),
  curtidas integer not null default 0 check (curtidas >= 0),
  impressoes integer not null default 0 check (impressoes >= 0),
  cliques integer not null default 0 check (cliques >= 0),
  custo numeric(10,2) not null default 0 check (custo >= 0),
  primary key (impulso_id, dia)
);
alter table privado.impulso_dias enable row level security;
revoke all on privado.impulso_dias from public, anon, authenticated;

-- quem chegou pelo anúncio (um código aleatório do navegador, sem nada da pessoa): uma visita por dia
create table if not exists privado.impulso_visitas (
  impulso_id uuid not null references privado.impulsos(id) on delete cascade,
  visitante text not null check (visitante ~ '^[A-Za-z0-9_-]{16,64}$'),
  dia date not null,
  primary key (impulso_id, visitante, dia)
);
alter table privado.impulso_visitas enable row level security;
revoke all on privado.impulso_visitas from public, anon, authenticated;

-- quem curtiu a vaga depois de chegar pelo anúncio (uma vez por pessoa)
create table if not exists privado.impulso_curtidas (
  impulso_id uuid not null references privado.impulsos(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (impulso_id, perfil_id)
);
alter table privado.impulso_curtidas enable row level security;
revoke all on privado.impulso_curtidas from public, anon, authenticated;

-- os dias que sobraram de um impulso interrompido (ou de uma compra que não deu para usar): valem 90 dias
create table if not exists privado.creditos_impulso (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.perfis(id) on delete cascade,
  dias smallint not null check (dias between 1 and 60),
  verba numeric(10,2) not null check (verba > 0),
  de_impulso uuid references privado.impulsos(id) on delete set null,
  de_compra uuid references privado.compras_avulsas(id) on delete set null,
  criado_em timestamptz not null default now(),
  ate timestamptz not null default now() + interval '90 days',
  usado_em timestamptz,
  usado_no_impulso uuid references privado.impulsos(id) on delete set null
);
create index if not exists creditos_impulso_conta on privado.creditos_impulso (conta_id, ate);
alter table privado.creditos_impulso enable row level security;
revoke all on privado.creditos_impulso from public, anon, authenticated;

-- ------------------------------------------------------------------ as regras

-- por que a vaga não pode ser impulsionada agora (ou null, quando pode)
create or replace function privado.impulso_motivo_vaga(p_conta uuid, p_anuncio uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
begin
  select * into a from public.anuncios where id = p_anuncio;
  if a.id is null or a.autor_id <> p_conta or a.tipo <> 'vaga' then
    return 'Não achamos a vaga.';
  elsif a.status <> 'ativo' then
    return 'A vaga precisa estar no ar para ser impulsionada.';
  elsif a.preenchida_em is not null then
    return 'A vaga está marcada como preenchida.';
  elsif exists (select 1 from privado.impulsos i
                 where i.anuncio_id = p_anuncio and i.situacao in ('pago', 'em_revisao', 'no_ar')) then
    return 'Esta vaga já está sendo impulsionada.';
  end if;
  return null;
end
$$;

-- a vaga parada: no ar há 5 dias ou mais, sem curtida nos últimos 5
create or replace function privado.vaga_parada(p_anuncio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.anuncios a
                  where a.id = p_anuncio and a.criado_em < now() - interval '5 days'
                    and not exists (select 1 from public.curtidas c
                                     where c.anuncio_id = a.id and c.criado_em > now() - interval '5 days'))
$$;

-- o primeiro impulso grátis: ligado, conta conferida, nunca usou, com a vaga parada
create or replace function privado.impulso_cortesia_disponivel(p_conta uuid, p_anuncio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.cortesia_ligada from privado.config_impulso c where c.id), false)
     and exists (select 1 from public.perfis p where p.id = p_conta and p.verificado)
     and not exists (select 1 from privado.impulsos i
                      where i.conta_id = p_conta and i.origem = 'cortesia' and i.situacao <> 'devolvido')
     and privado.vaga_parada(p_anuncio)
$$;

create or replace function privado.dias_de_credito(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(c.dias), 0)::integer from privado.creditos_impulso c
   where c.conta_id = p_conta and c.usado_em is null and c.ate > now()
$$;

-- o impulso pago: nasce para o robô criar no Google; se a vaga já saiu do ar (ou já está impulsionada), vira crédito
create or replace function privado.impulso_da_compra(p_compra uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k privado.compras_avulsas;
  v_motivo text;
  v_titulo text;
  v_id uuid;
begin
  select * into k from privado.compras_avulsas where id = p_compra and tipo = 'impulso';
  if k.id is null or exists (select 1 from privado.impulsos i where i.compra_id = k.id)
     or exists (select 1 from privado.creditos_impulso c where c.de_compra = k.id) then
    return;
  end if;
  select a.titulo into v_titulo from public.anuncios a where a.id = k.anuncio_id;
  v_motivo := case when k.anuncio_id is null then 'A vaga saiu.' else privado.impulso_motivo_vaga(k.conta_id, k.anuncio_id) end;
  if v_motivo is null then
    insert into privado.impulsos (conta_id, anuncio_id, titulo, compra_id, origem, dias, valor, verba, sandbox)
    values (k.conta_id, k.anuncio_id, v_titulo, k.id, 'compra', k.dias, k.valor,
            coalesce(k.verba, (select p.verba from privado.precos_impulso p where p.dias = k.dias), round(k.valor * 0.6, 2)),
            k.sandbox)
    returning id into v_id;
    perform privado.avisar_pagamento(k.conta_id,
      'Pagamento confirmado: o anúncio da vaga "' || left(v_titulo, 80) || '" vai para o Google. Ele entra no ar '
      || 'assim que o Google aprovar, em até 1 dia útil.', '/painel/impulsionar/' || k.anuncio_id);
  else
    insert into privado.creditos_impulso (conta_id, dias, verba, de_compra)
    values (k.conta_id, k.dias, coalesce(k.verba, round(k.valor * 0.6, 2)), k.id);
    perform privado.avisar_pagamento(k.conta_id,
      'Pagamento confirmado. ' || v_motivo || ' Os ' || k.dias || ' dias ficaram como crédito para impulsionar outra '
      || 'vaga até ' || privado.data_br(now() + interval '90 days') || '.', '/painel/anuncios');
  end if;
end
$$;

-- o pagamento do impulso foi devolvido: o impulso sai do Google (o robô remove a campanha)
create or replace function privado.impulso_estornado(p_compra uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update privado.impulsos
     set situacao = 'devolvido', motivo = coalesce(motivo, 'O pagamento foi devolvido.'), pausar = false,
         estorno_pedido_em = coalesce(estorno_pedido_em, now())
   where compra_id = p_compra and situacao in ('pago', 'em_revisao', 'no_ar')
$$;

-- devolve um impulso que ainda não rodou (o arrependimento, ou o Google que reprovou duas vezes): a compra volta pelo
-- estorno (o robô pede ao Asaas), o crédito volta como crédito, a cortesia fica livre de novo
create or replace function privado.impulso_devolver(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
begin
  update privado.impulsos set situacao = 'devolvido', motivo = left(p_motivo, 300), pausar = false
   where id = p_id and situacao in ('pago', 'em_revisao')
  returning * into i;
  if i.id is null then
    return jsonb_build_object('erro', 'Este impulso já está no ar e não pode mais ser cancelado.');
  end if;
  if i.origem = 'credito' then
    insert into privado.creditos_impulso (conta_id, dias, verba, de_impulso) values (i.conta_id, i.dias, i.verba, i.id);
  end if;
  return jsonb_build_object('ok', true, 'origem', i.origem);
end
$$;

-- ------------------------------------------------------------------ quem contrata

-- tudo do impulso de uma vaga, para quem publicou: os preços, o crédito, a cortesia e os impulsos com os números
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
    'raio', (select case when a.cidade = 'Goiânia' then c.raio_capital else c.raio_outras end
               from privado.config_impulso c where c.id),
    'impulsos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'valor', i.valor, 'verba', i.verba,
        'gasto', least(i.gasto, i.verba), 'motivo', i.motivo, 'criado_em', i.criado_em, 'aprovado_em', i.aprovado_em,
        'ate', i.ate, 'encerrado_em', i.encerrado_em, 'pausar', i.pausar,
        'totais', (select jsonb_build_object('impressoes', coalesce(sum(d.impressoes), 0),
                                             'cliques', coalesce(sum(d.cliques), 0),
                                             'visitas', coalesce(sum(d.visitas), 0),
                                             'curtidas', coalesce(sum(d.curtidas), 0))
                     from privado.impulso_dias d where d.impulso_id = i.id),
        'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', d.dia, 'impressoes', d.impressoes,
                                                                 'cliques', d.cliques, 'visitas', d.visitas,
                                                                 'curtidas', d.curtidas) order by d.dia)
                               from privado.impulso_dias d where d.impulso_id = i.id), '[]'::jsonb))
        order by i.criado_em desc)
      from privado.impulsos i where i.anuncio_id = a.id and i.conta_id = conta), '[]'::jsonb),
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

-- as vagas da conta com impulso valendo (para a lista de Vagas e o Hoje): id da vaga → até quando
create or replace function public.meus_impulsos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(i.anuncio_id, jsonb_build_object('situacao', i.situacao, 'ate', i.ate)), '{}'::jsonb)
    from privado.impulsos i
   where i.conta_id = public.conta_atual() and (select auth.uid()) is not null and i.anuncio_id is not null
     and i.situacao in ('pago', 'em_revisao', 'no_ar')
$$;

-- impulsionar sem pagar: com os dias de crédito (o mais antigo primeiro) ou o primeiro grátis
create or replace function public.impulsionar_sem_pagar(p_anuncio uuid, p_jeito text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  v_motivo text;
  c privado.creditos_impulso;
  cfg privado.config_impulso;
  v_titulo text;
  v_id uuid;
begin
  if (select auth.uid()) is null or conta is null then
    return jsonb_build_object('erro', 'Entre na conta para continuar.');
  end if;
  perform pg_advisory_xact_lock(hashtext('impulso:' || conta));
  v_motivo := privado.impulso_motivo_vaga(conta, p_anuncio);
  if v_motivo is not null then
    return jsonb_build_object('erro', v_motivo);
  end if;
  select a.titulo into v_titulo from public.anuncios a where a.id = p_anuncio;
  if p_jeito = 'credito' then
    select * into c from privado.creditos_impulso x
     where x.conta_id = conta and x.usado_em is null and x.ate > now()
     order by x.ate limit 1
     for update;
    if c.id is null then
      return jsonb_build_object('erro', 'Você não tem crédito de impulso.');
    end if;
    insert into privado.impulsos (conta_id, anuncio_id, titulo, origem, dias, verba)
    values (conta, p_anuncio, v_titulo, 'credito', c.dias, c.verba)
    returning id into v_id;
    update privado.creditos_impulso set usado_em = now(), usado_no_impulso = v_id where id = c.id;
  elsif p_jeito = 'cortesia' then
    if not privado.impulso_cortesia_disponivel(conta, p_anuncio) then
      return jsonb_build_object('erro', 'O impulso grátis não está disponível para esta vaga.');
    end if;
    select * into cfg from privado.config_impulso where id;
    insert into privado.impulsos (conta_id, anuncio_id, titulo, origem, dias, verba)
    values (conta, p_anuncio, v_titulo, 'cortesia', cfg.cortesia_dias, cfg.cortesia_verba)
    returning id into v_id;
  else
    return jsonb_build_object('erro', 'Pedido inválido.');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;

-- a visita que chegou pelo anúncio (a página da vaga com utm_campaign=impulso): uma por navegador e dia
create or replace function public.contar_visita_do_impulso(p_codigo text, p_anuncio uuid, p_visitante text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_n integer;
begin
  if p_codigo !~ '^[a-z0-9]{6,20}$' or p_visitante !~ '^[A-Za-z0-9_-]{16,64}$' then
    return false;
  end if;
  select i.id into v_id from privado.impulsos i
   where i.codigo = p_codigo and i.anuncio_id = p_anuncio
     and (i.situacao in ('em_revisao', 'no_ar') or (i.situacao = 'encerrado' and i.encerrado_em > now() - interval '2 days'));
  if v_id is null then
    return false;
  end if;
  insert into privado.impulso_visitas (impulso_id, visitante, dia) values (v_id, p_visitante, v_dia)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return false;
  end if;
  insert into privado.impulso_dias (impulso_id, dia, visitas) values (v_id, v_dia, 1)
  on conflict (impulso_id, dia) do update set visitas = privado.impulso_dias.visitas + 1;
  return true;
end
$$;

-- a curtida de quem chegou pelo anúncio nos últimos 7 dias (o mesmo navegador): conta uma vez por pessoa
create or replace function public.contar_curtida_do_impulso(p_codigo text, p_visitante text, p_anuncio uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v_id uuid;
  v_n integer;
begin
  if (select auth.uid()) is null or eu is null or p_codigo !~ '^[a-z0-9]{6,20}$'
     or p_visitante !~ '^[A-Za-z0-9_-]{16,64}$' then
    return false;
  end if;
  select i.id into v_id from privado.impulsos i
   where i.codigo = p_codigo and i.anuncio_id = p_anuncio
     and exists (select 1 from privado.impulso_visitas v
                  where v.impulso_id = i.id and v.visitante = p_visitante
                    and v.dia >= (now() at time zone 'America/Sao_Paulo')::date - 7);
  if v_id is null or not exists (select 1 from public.curtidas c where c.anuncio_id = p_anuncio and c.perfil_id = eu) then
    return false;
  end if;
  insert into privado.impulso_curtidas (impulso_id, perfil_id) values (v_id, eu) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return false;
  end if;
  insert into privado.impulso_dias (impulso_id, dia, curtidas)
  values (v_id, (now() at time zone 'America/Sao_Paulo')::date, 1)
  on conflict (impulso_id, dia) do update set curtidas = privado.impulso_dias.curtidas + 1;
  return true;
end
$$;

-- ------------------------------------------------------------------ o servidor (a chave do servidor protege)

-- a compra do impulso (como a do plano por 30 dias): devolve o id, o valor e os dias
create or replace function public.servidor_compra_impulso(p_chave text, p_conta uuid, p_anuncio uuid, p_dias integer,
                                                          p_forma text, p_sandbox boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr privado.precos_impulso;
  v_motivo text;
  v_id uuid;
begin
  perform privado.exigir_servidor(p_chave);
  if not privado.pode_pagar(p_conta) then
    return jsonb_build_object('erro', 'Os pagamentos ainda não estão abertos para a sua conta.');
  end if;
  if p_forma not in ('cartao', 'pix') then
    return jsonb_build_object('erro', 'Escolha cartão ou Pix.');
  end if;
  v_motivo := privado.impulso_motivo_vaga(p_conta, p_anuncio);
  if v_motivo is not null then
    return jsonb_build_object('erro', v_motivo);
  end if;
  select * into pr from privado.precos_impulso where dias = p_dias and ligado;
  if pr.dias is null then
    return jsonb_build_object('erro', 'Esse impulso não está à venda. Atualize a página.');
  end if;
  insert into privado.compras_avulsas (conta_id, tipo, recurso, valor, forma, dias, anuncio_id, verba, sandbox)
  values (p_conta, 'impulso', 'impulso', pr.valor, p_forma, pr.dias, p_anuncio, pr.verba, coalesce(p_sandbox, false))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'valor', pr.valor, 'dias', pr.dias,
                            'titulo', (select a.titulo from public.anuncios a where a.id = p_anuncio));
end
$$;

-- o arrependimento: cancela o impulso que ainda não entrou no ar (o robô tira do Google e pede o estorno)
create or replace function public.servidor_impulso_cancelar(p_chave text, p_conta uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if not exists (select 1 from privado.impulsos i where i.id = p_id and i.conta_id = p_conta) then
    return jsonb_build_object('erro', 'Não achamos o impulso.');
  end if;
  return privado.impulso_devolver(p_id, 'Cancelado por quem contratou antes de entrar no ar.');
end
$$;

-- o que o robô precisa fazer agora, no máximo 25 por rodada
create or replace function public.servidor_impulsos_para_cuidar(p_chave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg privado.config_impulso;
  v_hoje_3h timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + time '03:00') at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_impulso where id;
  return coalesce((select jsonb_agg(t) from (
    select jsonb_build_object(
      'id', i.id, 'codigo', i.codigo, 'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'verba', i.verba,
      'campanha_id', i.campanha_id, 'grupo_id', i.grupo_id, 'anuncio_google_id', i.anuncio_google_id,
      'texto_simples', i.texto_simples, 'sandbox', i.sandbox, 'ate', i.ate, 'aprovado_em', i.aprovado_em,
      'acao', case
        -- primeiro sai do Google, depois o dinheiro volta
        when i.situacao in ('devolvido', 'credito') and i.campanha_id is not null and not i.campanha_removida then 'remover'
        when i.situacao = 'devolvido' and i.origem = 'compra' and i.estorno_pedido_em is null then 'estornar'
        when i.situacao in ('pago', 'em_revisao', 'no_ar') and i.pausar then 'pausar'
        when i.situacao = 'pago' then 'criar'
        when i.situacao = 'em_revisao' then 'olhar'
        when i.situacao = 'no_ar' and i.ate <= now() then 'encerrar'
        else 'medir' end,
      'vaga', case when i.situacao in ('pago', 'em_revisao') then (
        select jsonb_build_object('id', a.id, 'titulo', a.titulo, 'cidade', a.cidade, 'bairro', a.bairro,
                                  'categoria', a.categoria, 'regime', a.regime, 'jornada', a.jornada,
                                  'modelo', a.modelo, 'pagamento_valor', a.pagamento_valor,
                                  'pagamento_ate', a.pagamento_ate, 'pagamento_unidade', a.pagamento_unidade,
                                  'comissao', a.comissao, 'vagas', a.vagas, 'lat', a.geo_lat, 'lng', a.geo_lng,
                                  'cbo', (select f.cbo from privado.funcoes_das_vagas f where f.anuncio_id = a.id),
                                  'raio', case when a.cidade = 'Goiânia' then cfg.raio_capital else cfg.raio_outras end)
          from public.anuncios a where a.id = i.anuncio_id) end,
      -- medir: do dia em que entrou no ar até ontem (ou hoje, no fim)
      'medir_desde', ((coalesce(i.aprovado_em, i.no_google_em, i.criado_em)) at time zone 'America/Sao_Paulo')::date,
      'compra', case when i.origem = 'compra' then
        (select jsonb_build_object('asaas_id', k.asaas_id, 'sandbox', k.sandbox, 'valor', k.valor)
           from privado.compras_avulsas k where k.id = i.compra_id) end) as t,
      i.criado_em
    from privado.impulsos i
    where (i.proxima_tentativa is null or i.proxima_tentativa <= now())
      and (
        (i.situacao = 'devolvido' and i.origem = 'compra' and i.estorno_pedido_em is null)
        or (i.situacao in ('devolvido', 'credito') and i.campanha_id is not null and not i.campanha_removida)
        or (i.situacao in ('pago', 'em_revisao', 'no_ar') and i.pausar)
        or i.situacao = 'pago'
        or (i.situacao = 'em_revisao' and (i.olhado_em is null or i.olhado_em < now() - interval '25 minutes'))
        or (i.situacao = 'no_ar' and i.ate <= now())
        -- os números de ontem, uma vez por dia depois das 3h (e os do fim, nos 2 dias depois de acabar)
        or (i.situacao = 'no_ar' and (i.medido_em is null or i.medido_em < v_hoje_3h) and now() >= v_hoje_3h)
        or (i.situacao = 'encerrado' and i.encerrado_em > now() - interval '2 days'
            and (i.medido_em is null or i.medido_em < v_hoje_3h) and now() >= v_hoje_3h))
    order by i.criado_em
    limit 25) q), '[]'::jsonb);
end
$$;

-- a campanha nasceu no Google: o anúncio vai para a revisão. Se o impulso mudou enquanto isso (cancelado, a vaga
-- fechou), devolve remover: o robô apaga a campanha que acabou de criar.
create or replace function public.servidor_impulso_criado(p_chave text, p_id uuid, p_ids jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
begin
  perform privado.exigir_servidor(p_chave);
  select * into i from privado.impulsos where id = p_id for update;
  if i.id is null then
    return jsonb_build_object('remover', true);
  end if;
  update privado.impulsos
     set campanha_id = p_ids ->> 'campanha', orcamento_id = p_ids ->> 'orcamento', grupo_id = p_ids ->> 'grupo',
         anuncio_google_id = p_ids ->> 'anuncio', no_google_em = now(),
         situacao = case when situacao = 'pago' and not pausar then 'em_revisao' else situacao end,
         tentativas = 0, proxima_tentativa = null, ultimo_erro = null, erro_desde = null, olhado_em = null
   where id = p_id;
  return jsonb_build_object('remover', i.situacao <> 'pago' or i.pausar);
end
$$;

-- um erro da API: tenta de novo com espera crescente (5 min, 10, 20… até 2 horas). Devolve alertar: o mesmo impulso
-- falha há mais de 6 horas (um alerta para o Admin a cada 6 horas, no máximo)
create or replace function public.servidor_impulso_erro(p_chave text, p_id uuid, p_erro text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
  v_alertar boolean := false;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.impulsos
     set tentativas = least(tentativas + 1, 30), ultimo_erro = left(p_erro, 500), erro_desde = coalesce(erro_desde, now()),
         proxima_tentativa = now() + least(interval '5 minutes' * power(2, least(tentativas, 6)), interval '2 hours')
   where id = p_id
  returning * into i;
  if i.erro_desde < now() - interval '6 hours' then
    update privado.config_impulso set alerta_erro_em = now()
     where id and (alerta_erro_em is null or alerta_erro_em < now() - interval '6 hours');
    v_alertar := found;
  end if;
  return jsonb_build_object('alertar', v_alertar, 'tentativas', i.tentativas);
end
$$;

-- o Google recusou o anúncio duas vezes (na revisão, ou já na criação, pela política): devolve e avisa
create or replace function privado.impulso_recusado(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
  d jsonb;
begin
  select * into i from privado.impulsos where id = p_id;
  d := privado.impulso_devolver(p_id, 'O Google não aprovou o anúncio' || coalesce(': ' || left(p_motivo, 200), '') || '.');
  if d ? 'erro' then
    return;
  end if;
  perform privado.avisar_pagamento(i.conta_id,
    'O Google não aprovou o anúncio da vaga "' || left(i.titulo, 80) || '". '
    || case when i.origem = 'compra' then 'O valor vai voltar para você.'
            when i.origem = 'credito' then 'Os dias voltaram como crédito.'
            else 'Você pode tentar de novo com outra vaga.' end, '/painel/impulsionar/' || i.anuncio_id);
end
$$;

-- a criação foi barrada pela política do Google: na primeira vez, tenta com o texto simples; na segunda, devolve
create or replace function public.servidor_impulso_recusado(p_chave text, p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
begin
  perform privado.exigir_servidor(p_chave);
  select * into i from privado.impulsos where id = p_id and situacao = 'pago' for update;
  if i.id is null then
    return jsonb_build_object('nada', true);
  end if;
  if not i.texto_simples then
    update privado.impulsos set texto_simples = true, motivo = left(p_motivo, 300) where id = p_id;
    return jsonb_build_object('texto_simples', true);
  end if;
  perform privado.impulso_recusado(p_id, p_motivo);
  return jsonb_build_object('devolvido', true);
end
$$;

-- o que o Google disse do anúncio: aprovado (os dias começam a contar), ainda em revisão, ou reprovado (a segunda
-- chance com o texto simples; na segunda reprovação, devolve)
create or replace function public.servidor_impulso_olhado(p_chave text, p_id uuid, p_aprovacao text, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
  d jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  select * into i from privado.impulsos where id = p_id for update;
  if i.id is null or i.situacao <> 'em_revisao' then
    return jsonb_build_object('nada', true);
  end if;
  if p_aprovacao = 'aprovado' then
    update privado.impulsos
       set situacao = 'no_ar', aprovado_em = now(), ate = now() + make_interval(days => i.dias), olhado_em = now(),
           tentativas = 0, ultimo_erro = null, erro_desde = null
     where id = p_id
    returning * into i;
    perform privado.avisar_pagamento(i.conta_id,
      'Seu anúncio está no ar no Google: a vaga "' || left(i.titulo, 80) || '" aparece para quem procura perto até '
      || privado.data_br(i.ate) || '.', '/painel/impulsionar/' || i.anuncio_id);
    -- o fim no Google (no fuso da conta de anúncios, o de Brasília): o último dia inteiro
    return jsonb_build_object('aprovado', true,
                              'fim', to_char((i.ate at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') || ' 23:59:59');
  elsif p_aprovacao = 'reprovado' then
    if not i.texto_simples then
      update privado.impulsos set texto_simples = true, olhado_em = now(), motivo = left(p_motivo, 300) where id = p_id;
      return jsonb_build_object('texto_simples', true);
    end if;
    perform privado.impulso_recusado(p_id, p_motivo);
    return jsonb_build_object('devolvido', true);
  end if;
  update privado.impulsos set olhado_em = now() where id = p_id;
  return jsonb_build_object('em_revisao', true);
end
$$;

-- o anúncio com o texto simples entrou no lugar do reprovado
create or replace function public.servidor_impulso_anuncio_trocado(p_chave text, p_id uuid, p_anuncio text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.impulsos set anuncio_google_id = p_anuncio, olhado_em = null, tentativas = 0, ultimo_erro = null,
                              erro_desde = null
   where id = p_id;
end
$$;

-- a vaga fechou: o impulso saiu do Google, e o que faltava vira crédito por 90 dias
create or replace function public.servidor_impulso_pausado(p_chave text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
  v_dias integer;
begin
  perform privado.exigir_servidor(p_chave);
  select * into i from privado.impulsos where id = p_id and pausar and situacao in ('pago', 'em_revisao', 'no_ar')
    for update;
  if i.id is null then
    return;
  end if;
  v_dias := case when i.situacao = 'no_ar' then ceil(extract(epoch from (i.ate - now())) / 86400)::integer else i.dias end;
  update privado.impulsos
     set situacao = 'credito', pausar = false, encerrado_em = now(),
         campanha_removida = campanha_removida or campanha_id is null,
         motivo = 'A vaga saiu do ar ou foi preenchida.'
   where id = p_id;
  if v_dias >= 1 then
    insert into privado.creditos_impulso (conta_id, dias, verba, de_impulso)
    values (i.conta_id, least(v_dias, i.dias), greatest(round(i.verba * least(v_dias, i.dias) / i.dias, 2), 1), i.id);
    perform privado.avisar_pagamento(i.conta_id,
      'A vaga "' || left(i.titulo, 80) || '" saiu do ar, e o anúncio no Google parou. ' || least(v_dias, i.dias)
      || case when least(v_dias, i.dias) = 1 then ' dia ficou' else ' dias ficaram' end
      || ' como crédito para impulsionar outra vaga até ' || privado.data_br(now() + interval '90 days') || '.',
      '/painel/anuncios');
  end if;
end
$$;

-- acabou: o relatório para quem contratou
create or replace function public.servidor_impulso_encerrado(p_chave text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
  t record;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.impulsos set situacao = 'encerrado', encerrado_em = now()
   where id = p_id and situacao = 'no_ar'
  returning * into i;
  if i.id is null then
    return;
  end if;
  select coalesce(sum(d.impressoes), 0) as impressoes, coalesce(sum(d.cliques), 0) as cliques,
         coalesce(sum(d.curtidas), 0) as curtidas
    into t from privado.impulso_dias d where d.impulso_id = i.id;
  perform privado.avisar_pagamento(i.conta_id,
    'O impulso da vaga "' || left(i.titulo, 80) || '" terminou: o anúncio apareceu ' || t.impressoes
    || case when t.impressoes = 1 then ' vez' else ' vezes' end || ', ' || t.cliques
    || case when t.cliques = 1 then ' pessoa clicou' else ' pessoas clicaram' end || ' e ' || t.curtidas
    || case when t.curtidas = 1 then ' curtiu' else ' curtiram' end || ' a vaga. Veja o relatório.',
    '/painel/impulsionar/' || i.anuncio_id);
end
$$;

create or replace function public.servidor_impulso_removido(p_chave text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.impulsos set campanha_removida = true, tentativas = 0, ultimo_erro = null, erro_desde = null,
                              proxima_tentativa = null
   where id = p_id;
end
$$;

create or replace function public.servidor_impulso_estorno_pedido(p_chave text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.impulsos set estorno_pedido_em = now(), tentativas = 0, ultimo_erro = null, erro_desde = null,
                              proxima_tentativa = null
   where id = p_id;
end
$$;

-- os números do Google por dia ([{dia, impressoes, cliques, custo}]): grava e soma o gasto
create or replace function public.servidor_impulso_numeros(p_chave text, p_id uuid, p_linhas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  for l in select * from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) loop
    insert into privado.impulso_dias (impulso_id, dia, impressoes, cliques, custo)
    values (p_id, (l ->> 'dia')::date, greatest((l ->> 'impressoes')::integer, 0), greatest((l ->> 'cliques')::integer, 0),
            greatest(round((l ->> 'custo')::numeric, 2), 0))
    on conflict (impulso_id, dia) do update
      set impressoes = excluded.impressoes, cliques = excluded.cliques, custo = excluded.custo;
  end loop;
  update privado.impulsos
     set medido_em = now(), tentativas = 0, ultimo_erro = null, erro_desde = null, proxima_tentativa = null,
         gasto = coalesce((select sum(d.custo) from privado.impulso_dias d where d.impulso_id = p_id), 0)
   where id = p_id;
end
$$;

-- a vaga fechou, foi marcada como preenchida ou apagada: o robô tira o impulso do Google
create or replace function privado.impulso_vaga_mudou()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or new.status <> 'ativo' or new.preenchida_em is not null then
    update privado.impulsos set pausar = true
     where anuncio_id = (case when tg_op = 'DELETE' then old.id else new.id end)
       and situacao in ('pago', 'em_revisao', 'no_ar') and not pausar;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
drop trigger if exists impulso_vaga_mudou on public.anuncios;
create trigger impulso_vaga_mudou after update of status, preenchida_em on public.anuncios
  for each row execute function privado.impulso_vaga_mudou();
drop trigger if exists impulso_vaga_apagada on public.anuncios;
create trigger impulso_vaga_apagada before delete on public.anuncios
  for each row execute function privado.impulso_vaga_mudou();

-- ------------------------------------------------------------------ o Admin

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
  perform privado.exigir_admin();
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
      'impulsos', (select count(*) from privado.impulsos i where i.criado_em >= v_mes)),
    'impulsos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'conta', p.nome, 'conta_id', i.conta_id, 'anuncio_id', i.anuncio_id, 'titulo', i.titulo,
        'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'valor', i.valor, 'verba', i.verba,
        'gasto', i.gasto, 'campanha_id', i.campanha_id, 'criado_em', i.criado_em, 'aprovado_em', i.aprovado_em,
        'ate', i.ate, 'pausar', i.pausar, 'erro', i.ultimo_erro, 'erro_desde', i.erro_desde, 'motivo', i.motivo,
        'sandbox', i.sandbox,
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
  perform privado.exigir_admin();
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
           raio_outras = coalesce((p_config ->> 'raio_outras')::smallint, raio_outras)
     where id;
  end if;
end
$$;

-- ------------------------------------------------------------------ a cobrança avulsa (o impulso entra)

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
  if k.tipo = 'impulso' then
    -- o impulso: a cobrança vale pelo dia do pagamento; o impulso nasce quando é paga (abaixo)
    v_ate := coalesce(k.paga_em, now());
    if v_situacao = 'paga' and k.situacao <> 'paga' then
      update privado.compras_avulsas set situacao = 'paga', paga_em = now() where id = k.id;
      v_aplicar := true;
    end if;
  elsif k.tipo = 'trinta_dias' then
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
    elsif v_aplicar and k.tipo = 'impulso' then
      perform privado.impulso_da_compra(k.id);
    elsif v_aplicar then
      perform privado.aplicar_troca_de_faixa(k.assinatura_id, k.recurso, k.valor_renovacao);
    end if;
  elsif v_situacao = 'estornada' and antes.situacao is distinct from 'estornada' then
    update privado.compras_avulsas set situacao = 'estornada' where id = k.id;
    if k.tipo = 'impulso' then
      -- o impulso devolvido (pelo Publike ou pelo banco do cartão): sai do Google
      perform privado.impulso_estornado(k.id);
    else
      perform privado.recalcular_recurso_pago(k.conta_id, k.recurso);
    end if;
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

-- ------------------------------------------------------------------ permissões

revoke execute on function privado.impulso_motivo_vaga(uuid, uuid), privado.vaga_parada(uuid),
  privado.impulso_cortesia_disponivel(uuid, uuid), privado.dias_de_credito(uuid), privado.impulso_da_compra(uuid),
  privado.impulso_estornado(uuid), privado.impulso_devolver(uuid, text), privado.impulso_vaga_mudou(),
  privado.impulso_recusado(uuid, text) from public;

revoke execute on function public.impulso_da_vaga(uuid), public.meus_impulsos(),
  public.impulsionar_sem_pagar(uuid, text), public.contar_curtida_do_impulso(text, text, uuid) from public, anon;
grant execute on function public.impulso_da_vaga(uuid), public.meus_impulsos(),
  public.impulsionar_sem_pagar(uuid, text), public.contar_curtida_do_impulso(text, text, uuid) to authenticated;

-- a visita pelo anúncio vem também de quem está sem conta
revoke execute on function public.contar_visita_do_impulso(text, uuid, text) from public;
grant execute on function public.contar_visita_do_impulso(text, uuid, text) to anon, authenticated;

revoke execute on function public.servidor_compra_impulso(text, uuid, uuid, integer, text, boolean),
  public.servidor_impulso_cancelar(text, uuid, uuid), public.servidor_impulsos_para_cuidar(text),
  public.servidor_impulso_criado(text, uuid, jsonb), public.servidor_impulso_erro(text, uuid, text),
  public.servidor_impulso_olhado(text, uuid, text, text), public.servidor_impulso_anuncio_trocado(text, uuid, text),
  public.servidor_impulso_pausado(text, uuid), public.servidor_impulso_encerrado(text, uuid),
  public.servidor_impulso_removido(text, uuid), public.servidor_impulso_estorno_pedido(text, uuid),
  public.servidor_impulso_numeros(text, uuid, jsonb), public.servidor_impulso_recusado(text, uuid, text) from public;
-- como as outras do servidor: a chave do servidor (p_chave) é quem protege
grant execute on function public.servidor_compra_impulso(text, uuid, uuid, integer, text, boolean),
  public.servidor_impulso_cancelar(text, uuid, uuid), public.servidor_impulsos_para_cuidar(text),
  public.servidor_impulso_criado(text, uuid, jsonb), public.servidor_impulso_erro(text, uuid, text),
  public.servidor_impulso_olhado(text, uuid, text, text), public.servidor_impulso_anuncio_trocado(text, uuid, text),
  public.servidor_impulso_pausado(text, uuid), public.servidor_impulso_encerrado(text, uuid),
  public.servidor_impulso_removido(text, uuid), public.servidor_impulso_estorno_pedido(text, uuid),
  public.servidor_impulso_numeros(text, uuid, jsonb), public.servidor_impulso_recusado(text, uuid, text)
  to anon, authenticated, service_role;

revoke execute on function public.admin_impulsos(), public.admin_salvar_impulso(jsonb, jsonb) from public, anon,
  authenticated;
grant execute on function public.admin_impulsos(), public.admin_salvar_impulso(jsonb, jsonb) to service_role;
