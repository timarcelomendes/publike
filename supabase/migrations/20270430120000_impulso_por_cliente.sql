-- Admin › Impulsos por cliente e por tipo de vaga (12/11/2026, pedido do Marcelo: "1. design (operacionalizar
-- melhor) 2. opções por tipo de vaga (exemplo: fiscal, contábil, financeiro, operador) 3. agrupar e criar um único
-- impulso por cliente e não apenas por vaga do cliente"). Respostas dele: os tipos servem para escolher as vagas e
-- também têm regras próprias; uma campanha por cliente no Google; o impulso por cliente só no admin (a compra do
-- cliente, a cortesia, o crédito e o automático continuam por vaga).
--
-- Tipos de vaga (privado.tipos_de_vaga): um nome ("Fiscal"), as palavras que o título tem ("fiscal", "tributar": o
-- começo de uma palavra, sem acento) e as que tiram do tipo ("fiscal de loja" não é o de impostos). Cada vaga fica no
-- primeiro tipo da lista que combina; nenhum, "Outros". As regras do tipo (dias, verba por vaga, raio) são o padrão do
-- impulso pelo admin e do automático; o raio vale para todo impulso daquele tipo. Vazio segue a regra geral.
--
-- Campanha do cliente (privado.impulso_campanhas): as vagas escolhidas de um cliente entram numa campanha só no
-- Google, com uma verba para todas (o Google põe o dinheiro nas vagas com mais busca). Cada vaga continua uma linha em
-- privado.impulsos (o grupo de anúncios dela, com o anúncio, as palavras e o código que conta as visitas): o cliente
-- vê os números em cada vaga como antes, e a vaga que fecha sai sozinha (o robô tira o grupo dela). Um cliente tem no
-- máximo uma campanha correndo: impulsionar outra vaga dele junta na mesma e soma a verba. Os dias contam da primeira
-- vaga aprovada; todas acabam juntas. Pode rodar de novo.

-- ------------------------------------------------------------------ tipos de vaga

create table if not exists privado.tipos_de_vaga (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 40),
  -- o começo de uma palavra do título, sem acento e em minúsculas ("contab" pega contábil e contabilidade)
  palavras text[] not null check (cardinality(palavras) between 1 and 40),
  -- o que tira a vaga do tipo, do mesmo jeito ("fiscal de loja")
  menos text[] not null default '{}' check (cardinality(menos) <= 40),
  -- as regras do tipo; vazio segue a regra geral
  dias smallint check (dias is null or dias between 1 and 30),
  verba numeric(10,2) check (verba is null or verba between 1 and 1000),
  raio smallint check (raio is null or raio between 1 and 65),
  ordem smallint not null default 100,
  criado_em timestamptz not null default now()
);
create unique index if not exists tipos_de_vaga_nome on privado.tipos_de_vaga (lower(nome));
alter table privado.tipos_de_vaga enable row level security;
revoke all on privado.tipos_de_vaga from public, anon, authenticated;

-- o texto do jeito que os tipos procuram: minúsculas, sem acento, só letras e números com um espaço entre as palavras
create or replace function privado.texto_do_tipo(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(regexp_replace(lower(public.sem_acento(coalesce(p, ''))), '[^a-z0-9]+', ' ', 'g'))
$$;

-- o tipo da vaga pelo título: o primeiro da lista com uma das palavras no começo de uma palavra do título e nenhuma
-- das de tirar. Nenhum: null ("Outros").
create or replace function privado.tipo_da_vaga(p_titulo text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
    from privado.tipos_de_vaga t,
         lateral (select ' ' || privado.texto_do_tipo(p_titulo) as tit) x
   where exists (select 1 from unnest(t.palavras) p where strpos(x.tit, ' ' || p) > 0)
     and not exists (select 1 from unnest(t.menos) m where strpos(x.tit, ' ' || m) > 0)
   order by t.ordem, t.nome
   limit 1
$$;

-- o raio do anúncio em volta da vaga: o do tipo dela; sem, o geral (na capital e nas outras cidades)
create or replace function privado.raio_da_vaga(p_titulo text, p_cidade text)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select t.raio from privado.tipos_de_vaga t where t.id = privado.tipo_da_vaga(p_titulo)),
                  (select case when p_cidade = 'Goiânia' then c.raio_capital else c.raio_outras end
                     from privado.config_impulso c where c.id))
$$;

-- os tipos do pedido (fiscal, contábil, financeiro, operador), com regras de partida, e os mais comuns no Publike,
-- sem regras (seguem a geral). Só na primeira vez: depois, quem manda é o Admin › Impulsos › Regras.
insert into privado.tipos_de_vaga (nome, palavras, menos, dias, verba, raio, ordem)
select v.nome, v.palavras, v.menos, v.dias, v.verba, v.raio, v.ordem
  from (values
    ('Fiscal', array['fiscal', 'fiscais', 'tributar', 'tributo', 'imposto'],
     array['fiscal de loja', 'fiscal de caixa', 'fiscal de prevencao', 'fiscal de perdas', 'fiscal de piso',
           'fiscal de salao', 'fiscal de obra', 'fiscal de patio', 'fiscal de transporte', 'fiscal de onibus'],
     7, 35.00, 25, 10),
    ('Contábil', array['contab', 'contador', 'contadora'], array[]::text[], 7, 35.00, 25, 20),
    ('Financeiro', array['financ', 'contas a pagar', 'contas a receber', 'tesour', 'faturament', 'cobranca'],
     array[]::text[], 7, 35.00, 25, 30),
    ('Operador', array['operador', 'operadora'], array[]::text[], 5, 20.00, null, 40),
    ('Vendas', array['vendedor', 'vendedora', 'vendas', 'consultor de vendas', 'consultora de vendas',
                     'representante comercial', 'promotor', 'promotora'], array[]::text[], null, null, null, 50),
    ('Atendimento', array['atendente', 'recepcionista', 'telemarketing', 'teleatendente'], array[]::text[],
     null, null, null, 60),
    ('Cozinha e salão', array['cozinh', 'chapeir', 'pizzaiolo', 'confeiteir', 'padeir', 'sushiman', 'churrasqueir',
                              'copeir', 'garcom', 'garconete', 'barista', 'cumim'], array[]::text[], null, null, null, 70),
    ('Logística', array['estoquista', 'conferente', 'separador', 'separadora', 'almoxarif', 'logistica', 'motorista',
                        'entregador', 'entregadora', 'motoboy', 'carregador', 'movimentador'], array[]::text[],
     null, null, null, 80),
    ('Limpeza', array['limpeza', 'faxin', 'zelador', 'zeladora', 'servicos gerais', 'camareir', 'diarista'],
     array[]::text[], null, null, null, 90),
    ('Administrativo', array['administrativ', 'secretari', 'auxiliar de escritorio', 'assistente de escritorio'],
     array[]::text[], null, null, null, 100)
  ) as v(nome, palavras, menos, dias, verba, raio, ordem)
 where not exists (select 1 from privado.tipos_de_vaga);

-- ------------------------------------------------------------------ a campanha do cliente

create table if not exists privado.impulso_campanhas (
  id uuid primary key default gen_random_uuid(),
  -- o código curto (o fim do endereço no nível da campanha; cada vaga tem o seu no grupo dela)
  codigo text not null unique default substr(md5(gen_random_uuid()::text), 1, 10) check (codigo ~ '^[a-z0-9]{6,20}$'),
  conta_id uuid not null references public.perfis(id) on delete cascade,
  -- o nome do cliente na hora (o relatório continua legível se a conta mudar de nome)
  nome text not null,
  -- por enquanto só pelo admin (a verba é do Publike)
  origem text not null default 'admin' check (origem in ('admin')),
  dias smallint not null check (dias between 1 and 30),
  -- a verba total no Google, para todas as vagas juntas
  verba numeric(10,2) not null check (verba between 1 and 5000),
  -- pago: esperando o robô criar a campanha; em_revisao: a campanha existe e os anúncios estão na revisão;
  -- no_ar: a primeira vaga foi aprovada (os dias contam); encerrado: acabou; devolvido: parou antes de entrar no ar
  situacao text not null default 'pago' check (situacao in ('pago', 'em_revisao', 'no_ar', 'encerrado', 'devolvido')),
  avisar boolean not null default true,
  motivo text,
  -- no Google Ads (os ids, sem o "customers/…")
  campanha_id text check (campanha_id ~ '^[0-9]{1,20}$'),
  orcamento_id text check (orcamento_id ~ '^[0-9]{1,20}$'),
  conta_google text check (conta_google is null or conta_google ~ '^[0-9]{10}$'),
  -- os pontos em volta dos quais a campanha aparece ([{lat, lng, raio}]): a vaga num lugar novo acrescenta o dela
  lugares jsonb not null default '[]'::jsonb,
  -- a verba total da última vez que o robô acertou o orçamento por dia (entrou verba: ele acerta de novo)
  verba_no_google numeric(10,2),
  campanha_removida boolean not null default false,
  tentativas smallint not null default 0,
  proxima_tentativa timestamptz,
  ultimo_erro text,
  erro_desde timestamptz,
  criado_em timestamptz not null default now(),
  no_google_em timestamptz,
  aprovado_em timestamptz,
  ate timestamptz,
  encerrado_em timestamptz
);
create index if not exists impulso_campanhas_conta on privado.impulso_campanhas (conta_id, criado_em desc);
-- uma campanha correndo por cliente
create unique index if not exists impulso_campanhas_uma_por_cliente on privado.impulso_campanhas (conta_id)
  where situacao in ('pago', 'em_revisao', 'no_ar');
alter table privado.impulso_campanhas enable row level security;
revoke all on privado.impulso_campanhas from public, anon, authenticated;

alter table privado.impulsos
  add column if not exists campanha_cliente_id uuid references privado.impulso_campanhas(id) on delete cascade;
create index if not exists impulsos_da_campanha on privado.impulsos (campanha_cliente_id)
  where campanha_cliente_id is not null;

-- a verba por dia que a campanha deve ter agora: antes de entrar no ar, a verba pelos dias; no ar, o que falta
-- gastar pelos dias que faltam (a verba que entrou no meio se espalha até o fim)
create or replace function privado.verba_dia_da_campanha(p_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(round(case
           when k.aprovado_em is null or k.ate is null then k.verba / k.dias
           else greatest(k.verba - coalesce((select sum(i.gasto) from privado.impulsos i
                                               where i.campanha_cliente_id = k.id), 0), 1)
                / greatest(ceil(extract(epoch from (k.ate - now())) / 86400), 1)
         end, 2), 1)
    from privado.impulso_campanhas k where k.id = p_id
$$;

-- ------------------------------------------------------------------ o robô: a campanha do cliente

-- o que fazer com as campanhas dos clientes: criar (a campanha, sem vagas ainda: cada vaga cria o grupo dela),
-- orcamento (entrou verba) e encerrar (nenhuma vaga correndo e nada para tirar do Google)
create or replace function public.servidor_campanhas_para_cuidar(p_chave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((select jsonb_agg(t order by t ->> 'criado_em') from (
    select jsonb_build_object(
      'id', k.id, 'codigo', k.codigo, 'nome', k.nome, 'situacao', k.situacao, 'dias', k.dias, 'verba', k.verba,
      'conta_id', k.conta_id, 'conta_tipo', (select p.tipo from public.perfis p where p.id = k.conta_id),
      'campanha_id', k.campanha_id, 'orcamento_id', k.orcamento_id,
      'conta_google', k.conta_google, 'aprovado_em', k.aprovado_em, 'ate', k.ate, 'criado_em', k.criado_em,
      'acao', case when x.ativas = 0 then 'encerrar'
                   when k.situacao = 'pago' and k.campanha_id is null then 'criar'
                   else 'orcamento' end,
      'verba_dia', privado.verba_dia_da_campanha(k.id),
      -- os lugares das vagas (um por ponto, com o maior raio nele) e a cidade de quase todas, para os links extras
      'lugares', coalesce((select jsonb_agg(jsonb_build_object('lat', l.lat, 'lng', l.lng, 'raio', l.raio))
                             from (select round(a.geo_lat::numeric, 4) as lat, round(a.geo_lng::numeric, 4) as lng,
                                          max(privado.raio_da_vaga(a.titulo, a.cidade)) as raio
                                     from privado.impulsos i join public.anuncios a on a.id = i.anuncio_id
                                    where i.campanha_cliente_id = k.id and i.situacao in ('pago', 'em_revisao', 'no_ar')
                                      and a.geo_lat is not null and a.geo_lng is not null
                                    group by 1, 2) l), '[]'::jsonb),
      'cidade', (select a.cidade from privado.impulsos i join public.anuncios a on a.id = i.anuncio_id
                  where i.campanha_cliente_id = k.id group by a.cidade order by count(*) desc, a.cidade limit 1)
    ) as t
      from privado.impulso_campanhas k,
           lateral (select count(*) filter (where i.situacao in ('pago', 'em_revisao', 'no_ar')) as ativas,
                           count(*) filter (where i.situacao in ('devolvido', 'credito') and i.campanha_id is not null
                                              and not i.campanha_removida) as para_tirar
                      from privado.impulsos i where i.campanha_cliente_id = k.id) x
     where k.situacao in ('pago', 'em_revisao', 'no_ar')
       and (k.proxima_tentativa is null or k.proxima_tentativa <= now())
       and ((x.ativas = 0 and x.para_tirar = 0)
            or (x.ativas > 0 and k.situacao = 'pago' and k.campanha_id is null)
            or (x.ativas > 0 and k.campanha_id is not null and k.verba_no_google is distinct from k.verba))
     order by k.criado_em
     limit 10) q), '[]'::jsonb);
end
$$;

-- a campanha nasceu no Google (o orçamento, a campanha, a língua e os lugares): as vagas criam os grupos delas
create or replace function public.servidor_campanha_criada(p_chave text, p_id uuid, p_ids jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.impulso_campanhas
     set campanha_id = p_ids ->> 'campanha', orcamento_id = p_ids ->> 'orcamento',
         conta_google = nullif(regexp_replace(coalesce(p_ids ->> 'conta', ''), '\D', '', 'g'), ''),
         lugares = coalesce(p_ids -> 'lugares', '[]'::jsonb), verba_no_google = verba, no_google_em = now(),
         situacao = case when situacao = 'pago' then 'em_revisao' else situacao end,
         tentativas = 0, proxima_tentativa = null, ultimo_erro = null, erro_desde = null
   where id = p_id;
end
$$;

-- o orçamento por dia foi acertado no Google com a verba de agora
create or replace function public.servidor_campanha_orcamento(p_chave text, p_id uuid, p_verba numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.impulso_campanhas
     set verba_no_google = p_verba, tentativas = 0, proxima_tentativa = null, ultimo_erro = null, erro_desde = null
   where id = p_id;
end
$$;

-- nenhuma vaga correndo: a campanha acaba. Entrou no ar: o relatório para o cliente, um só para todas as vagas.
create or replace function public.servidor_campanha_encerrada(p_chave text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k privado.impulso_campanhas;
  t record;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.impulso_campanhas
     set situacao = case when aprovado_em is not null then 'encerrado' else 'devolvido' end,
         encerrado_em = now(), campanha_removida = campanha_removida or campanha_id is null,
         tentativas = 0, proxima_tentativa = null, ultimo_erro = null, erro_desde = null
   where id = p_id and situacao in ('pago', 'em_revisao', 'no_ar')
  returning * into k;
  if k.id is null or k.aprovado_em is null then
    return;
  end if;
  select count(*) filter (where i.aprovado_em is not null) as vagas, coalesce(sum(d.impressoes), 0) as impressoes,
         coalesce(sum(d.cliques), 0) as cliques, coalesce(sum(d.curtidas), 0) as curtidas,
         (array_agg(i.anuncio_id) filter (where i.aprovado_em is not null))[1] as uma
    into t
    from privado.impulsos i
    left join lateral (select sum(x.impressoes) as impressoes, sum(x.cliques) as cliques, sum(x.curtidas) as curtidas
                         from privado.impulso_dias x where x.impulso_id = i.id) d on true
   where i.campanha_cliente_id = k.id;
  perform privado.avisar_pagamento(k.conta_id,
    'O impulso ' || case when t.vagas = 1 then 'da sua vaga' else 'das suas ' || t.vagas || ' vagas' end
    || ' no Google terminou: os anúncios apareceram ' || t.impressoes
    || case when t.impressoes = 1 then ' vez' else ' vezes' end || ', ' || t.cliques
    || case when t.cliques = 1 then ' pessoa clicou' else ' pessoas clicaram' end || ' e ' || t.curtidas
    || case when t.curtidas = 1 then ' curtiu' else ' curtiram' end || '. Veja o relatório de cada vaga.',
    case when t.vagas = 1 and t.uma is not null then '/painel/impulsionar/' || t.uma else '/painel/anuncios' end);
end
$$;

-- um erro da API na campanha: tenta de novo com espera crescente, como nos impulsos
create or replace function public.servidor_campanha_erro(p_chave text, p_id uuid, p_erro text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k privado.impulso_campanhas;
  v_alertar boolean := false;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.impulso_campanhas
     set tentativas = least(tentativas + 1, 30), ultimo_erro = left(p_erro, 500), erro_desde = coalesce(erro_desde, now()),
         proxima_tentativa = now() + least(interval '5 minutes' * power(2, least(tentativas, 6)), interval '2 hours')
   where id = p_id
  returning * into k;
  if k.erro_desde < now() - interval '6 hours' then
    update privado.config_impulso set alerta_erro_em = now()
     where id and (alerta_erro_em is null or alerta_erro_em < now() - interval '6 hours');
    v_alertar := found;
  end if;
  return jsonb_build_object('alertar', v_alertar, 'tentativas', k.tentativas);
end
$$;

-- ------------------------------------------------------------------ o robô: as vagas (agora também dentro da campanha)

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
      'vaga', case when i.situacao in ('pago', 'em_revisao') then (
        select jsonb_build_object('id', a.id, 'titulo', a.titulo, 'cidade', a.cidade, 'bairro', a.bairro,
                                  'categoria', a.categoria, 'regime', a.regime, 'jornada', a.jornada,
                                  'modelo', a.modelo, 'pagamento_valor', a.pagamento_valor,
                                  'pagamento_ate', a.pagamento_ate, 'pagamento_unidade', a.pagamento_unidade,
                                  'comissao', a.comissao, 'vagas', a.vagas, 'lat', a.geo_lat, 'lng', a.geo_lng,
                                  'cbo', (select f.cbo from privado.funcoes_das_vagas f where f.anuncio_id = a.id),
                                  'raio', privado.raio_da_vaga(a.titulo, a.cidade))
          from public.anuncios a where a.id = i.anuncio_id) end,
      -- a campanha do cliente em que a vaga é um grupo (a conta e a campanha do Google vêm dela)
      'campanha_cliente', case when k.id is not null then
        jsonb_build_object('id', k.id, 'codigo', k.codigo, 'campanha_id', k.campanha_id, 'conta_google', k.conta_google)
        end,
      -- o lugar da vaga ainda não está na campanha do cliente: o grupo acrescenta o ponto dela (arredondado como os
      -- da campanha, para não repetir)
      'novo_lugar', case when k.id is not null and i.situacao = 'pago' then (
        select jsonb_build_object('lat', round(a.geo_lat::numeric, 4), 'lng', round(a.geo_lng::numeric, 4),
                                  'raio', privado.raio_da_vaga(a.titulo, a.cidade))
          from public.anuncios a
         where a.id = i.anuncio_id and a.geo_lat is not null and a.geo_lng is not null
           and not exists (select 1 from jsonb_array_elements(k.lugares) l
                            where (l ->> 'lat')::numeric = round(a.geo_lat::numeric, 4)
                              and (l ->> 'lng')::numeric = round(a.geo_lng::numeric, 4))) end,
      -- medir: do dia em que entrou no ar até ontem (ou hoje, no fim)
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
        -- os números de ontem, uma vez por dia depois das 3h (e os do fim, nos 2 dias depois de acabar)
        or (i.situacao = 'no_ar' and (i.medido_em is null or i.medido_em < v_hoje_3h) and now() >= v_hoje_3h)
        or (i.situacao = 'encerrado' and i.encerrado_em > now() - interval '2 days'
            and (i.medido_em is null or i.medido_em < v_hoje_3h) and now() >= v_hoje_3h))
    order by i.criado_em
    limit 25) q), '[]'::jsonb);
end
$$;

-- o grupo (ou a campanha) nasceu no Google. Na vaga da campanha do cliente, os ids da campanha são os dela, e o lugar
-- novo entra na lista da campanha.
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
         conta_google = coalesce(nullif(regexp_replace(coalesce(p_ids ->> 'conta', ''), '\D', '', 'g'), ''), conta_google),
         situacao = case when situacao = 'pago' and not pausar then 'em_revisao' else situacao end,
         tentativas = 0, proxima_tentativa = null, ultimo_erro = null, erro_desde = null, olhado_em = null
   where id = p_id;
  if i.campanha_cliente_id is not null and jsonb_typeof(p_ids -> 'lugar') = 'object' then
    update privado.impulso_campanhas set lugares = lugares || jsonb_build_array(p_ids -> 'lugar')
     where id = i.campanha_cliente_id;
  end if;
  return jsonb_build_object('remover', i.situacao <> 'pago' or i.pausar);
end
$$;

-- o que o Google disse do anúncio. Na campanha do cliente, a primeira vaga aprovada põe a campanha no ar (os dias
-- contam dali e todas acabam juntas); o aviso ao cliente é um só.
create or replace function public.servidor_impulso_olhado(p_chave text, p_id uuid, p_aprovacao text, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
  k privado.impulso_campanhas;
  v_primeira boolean := false;
  v_vagas integer;
begin
  perform privado.exigir_servidor(p_chave);
  select * into i from privado.impulsos where id = p_id for update;
  if i.id is null or i.situacao <> 'em_revisao' then
    return jsonb_build_object('nada', true);
  end if;
  if p_aprovacao = 'aprovado' and i.campanha_cliente_id is not null then
    select * into k from privado.impulso_campanhas where id = i.campanha_cliente_id for update;
    if k.aprovado_em is null then
      update privado.impulso_campanhas
         set situacao = 'no_ar', aprovado_em = now(), ate = now() + make_interval(days => k.dias)
       where id = k.id
      returning * into k;
      v_primeira := true;
    end if;
    update privado.impulsos
       set situacao = 'no_ar', aprovado_em = now(), ate = k.ate, olhado_em = now(),
           tentativas = 0, ultimo_erro = null, erro_desde = null
     where id = p_id
    returning * into i;
    if not v_primeira then
      return jsonb_build_object('aprovado', true);
    end if;
    select count(*) into v_vagas from privado.impulsos x
     where x.campanha_cliente_id = k.id and x.situacao in ('pago', 'em_revisao', 'no_ar');
    perform privado.avisar_pagamento(k.conta_id,
      case when v_vagas = 1
           then 'Seu anúncio está no ar no Google: a vaga "' || left(i.titulo, 80) || '" aparece para quem procura perto até '
           else 'Seus anúncios estão no ar no Google: as suas ' || v_vagas || ' vagas aparecem para quem procura perto até '
      end || privado.data_br(k.ate) || '.',
      case when v_vagas = 1 then '/painel/impulsionar/' || i.anuncio_id else '/painel/anuncios' end);
    return jsonb_build_object('aprovado', true,
                              'fim', to_char((k.ate at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') || ' 23:59:59');
  elsif p_aprovacao = 'aprovado' then
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

-- acabou: o relatório para quem contratou. A vaga da campanha do cliente acaba calada (o relatório vai um só, no fim
-- da campanha) e acaba também se a campanha terminou antes de o Google aprovar o anúncio dela.
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
  perform privado.avisar_pagamento(i.conta_id,
    'O impulso da vaga "' || left(i.titulo, 80) || '" terminou: o anúncio apareceu ' || t.impressoes
    || case when t.impressoes = 1 then ' vez' else ' vezes' end || ', ' || t.cliques
    || case when t.cliques = 1 then ' pessoa clicou' else ' pessoas clicaram' end || ' e ' || t.curtidas
    || case when t.curtidas = 1 then ' curtiu' else ' curtiram' end || ' a vaga. Veja o relatório.',
    '/painel/impulsionar/' || i.anuncio_id);
end
$$;

-- ------------------------------------------------------------------ o impulso automático segue as regras do tipo

create or replace function privado.criar_impulsos_automaticos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
  v_vagas integer;
  v_resta numeric;
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
  v_vagas := c.auto_simultaneos - (select count(*)::integer from privado.impulsos i
                                    where i.automatico and i.situacao in ('pago', 'em_revisao', 'no_ar'));
  v_resta := c.auto_verba_mes - privado.verba_automatica_do_mes();
  if v_vagas <= 0 or v_resta < 1 then
    return 0;
  end if;
  for r in
    select a.id, a.autor_id, a.titulo, coalesce(t.dias, c.auto_dias) as dias, coalesce(t.verba, c.auto_verba) as verba
      from public.anuncios a
      join public.perfis p on p.id = a.autor_id
      left join privado.tipos_de_vaga t on t.id = privado.tipo_da_vaga(a.titulo)
     where a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
       and a.expira_em > now() + make_interval(days => coalesce(t.dias, c.auto_dias) + 1)
       and p.tipo <> 'pessoa' and (p.suspenso_ate is null or p.suspenso_ate <= now())
       and privado.vaga_parada(a.id)
       and not exists (select 1 from privado.impulsos i
                        where i.anuncio_id = a.id and (i.automatico or i.situacao in ('pago', 'em_revisao', 'no_ar')))
     order by (a.pagamento_valor is not null) desc,
              (select count(*) from public.curtidas k where k.anuncio_id = a.id),
              a.criado_em desc
     limit 200
  loop
    exit when v_vagas <= 0 or v_resta < 1;
    -- a verba do tipo não cabe no que sobrou do mês: tenta a próxima (pode ser de um tipo mais barato)
    continue when r.verba > v_resta;
    insert into privado.impulsos (conta_id, anuncio_id, titulo, origem, dias, valor, verba, automatico)
    values (r.autor_id, r.id, r.titulo, 'admin', r.dias, 0, r.verba, true)
    returning id into v_id;
    v := v + 1;
    v_vagas := v_vagas - 1;
    v_resta := v_resta - r.verba;
    if c.auto_avisar then
      perform privado.avisar_pagamento(r.autor_id,
        'O Publike vai impulsionar a vaga "' || left(r.titulo, 80) || '" no Google por ' || r.dias
        || case when r.dias = 1 then ' dia' else ' dias' end
        || ', sem custo para você, para chegar a mais gente perto da vaga. Depois que o Google aprovar, acompanhe '
        || 'quantos viram, clicaram e curtiram.',
        '/painel/impulsionar/' || r.id);
    end if;
  end loop;
  return v;
end
$$;

-- ------------------------------------------------------------------ quem contrata: o raio do tipo da vaga

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
                               from privado.impulso_dias d where d.impulso_id = i.id), '[]'::jsonb))
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

-- ------------------------------------------------------------------ o Admin

-- as vagas no ar para impulsionar: pelo título ou pelo nome do cliente, pelo tipo (p_tipo: o id, ou 'outros') ou todas
-- as de um cliente (p_conta). Cada vaga vem com o tipo, a sugestão do tipo e a campanha do cliente que está correndo.
drop function if exists public.admin_vagas_para_impulso(text);
create or replace function public.admin_vagas_para_impulso(p_busca text default null, p_tipo text default null,
                                                           p_conta uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  termo text := nullif(trim(coalesce(p_busca, '')), '');
  cfg privado.config_impulso;
  v_verba numeric;
begin
  perform privado.exigir_impulsos_admin();
  select * into cfg from privado.config_impulso where id;
  -- a verba de partida por vaga, sem a do tipo: a do impulso de 7 dias à venda
  v_verba := coalesce((select p.verba from privado.precos_impulso p where p.dias = 7), 30);
  return coalesce((select jsonb_agg(to_jsonb(x) - 'ordem' - 'ordem_tipo'
                                    order by case when p_conta is not null then x.ordem_tipo end, x.ordem) from (
    select a.id, a.titulo, a.bairro, a.cidade, a.criado_em, a.expira_em, p.nome as conta, a.autor_id as conta_id,
           p.tipo as conta_tipo, a.pagamento_valor is not null as com_salario,
           (select count(*) from public.curtidas c where c.anuncio_id = a.id) as curtidas,
           privado.vaga_parada(a.id) as parada,
           exists (select 1 from privado.impulsos i
                    where i.anuncio_id = a.id and i.situacao in ('pago', 'em_revisao', 'no_ar')) as impulsionada,
           t.id as tipo_id, t.nome as tipo,
           jsonb_build_object('dias', coalesce(t.dias, 7), 'verba', coalesce(t.verba, v_verba),
                              'raio', coalesce(t.raio, case when a.cidade = 'Goiânia' then cfg.raio_capital
                                                            else cfg.raio_outras end)) as sugestao,
           (select jsonb_build_object('id', k.id, 'situacao', k.situacao, 'ate', k.ate, 'dias', k.dias, 'verba', k.verba)
              from privado.impulso_campanhas k
             where k.conta_id = a.autor_id and k.situacao in ('pago', 'em_revisao', 'no_ar')) as campanha,
           coalesce(t.ordem, 32767) as ordem_tipo,
           row_number() over (order by privado.vaga_parada(a.id) desc, a.criado_em desc) as ordem
      from public.anuncios a
      join public.perfis p on p.id = a.autor_id
      left join privado.tipos_de_vaga t on t.id = privado.tipo_da_vaga(a.titulo)
     where a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
       and (p_conta is null or a.autor_id = p_conta)
       and (termo is null
            or public.sem_acento(a.titulo) ilike '%' || public.sem_acento(termo) || '%'
            or public.sem_acento(p.nome) ilike '%' || public.sem_acento(termo) || '%')
       and (p_tipo is null or (p_tipo = 'outros' and t.id is null) or t.id::text = p_tipo)
     order by privado.vaga_parada(a.id) desc, a.criado_em desc
     limit case when p_conta is not null then 200 else 60 end) x), '[]'::jsonb);
end
$$;

-- impulsiona vagas de um cliente numa campanha só (a verba é do Publike). Se ele já tem uma campanha correndo, as
-- vagas entram nela e a verba soma (os dias seguem os dela).
create or replace function public.admin_impulsionar_cliente(p_conta uuid, p_anuncios uuid[], p_dias integer,
                                                            p_verba numeric, p_avisar boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.perfis;
  k privado.impulso_campanhas;
  a public.anuncios;
  v_ids uuid[];
  v_n integer;
  v_motivo text;
  v_juntou boolean := false;
  v_titulos text;
begin
  perform privado.exigir_impulsos_admin();
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_anuncios, '{}'::uuid[])) x where x is not null;
  v_n := coalesce(cardinality(v_ids), 0);
  if v_n < 1 or v_n > 50 then
    return jsonb_build_object('erro', 'Escolha de 1 a 50 vagas.');
  end if;
  if p_verba is null or p_verba < v_n or p_verba > 5000 then
    return jsonb_build_object('erro', 'A verba vai de R$ 1 por vaga a R$ 5.000.');
  end if;
  select * into p from public.perfis where id = p_conta;
  if p.id is null then
    return jsonb_build_object('erro', 'Não achamos o cliente.');
  end if;
  perform pg_advisory_xact_lock(hashtext('impulso:' || p_conta));
  for a in select * from public.anuncios x where x.id = any(v_ids) loop
    v_motivo := privado.impulso_motivo_vaga(p_conta, a.id);
    if v_motivo is not null then
      return jsonb_build_object('erro', '"' || left(a.titulo, 60) || '": ' || v_motivo);
    end if;
  end loop;
  if (select count(*) from public.anuncios x where x.id = any(v_ids)) <> v_n then
    return jsonb_build_object('erro', 'Uma das vagas não existe mais. Atualize a lista.');
  end if;
  select * into k from privado.impulso_campanhas
   where conta_id = p_conta and situacao in ('pago', 'em_revisao', 'no_ar') for update;
  if k.id is not null then
    update privado.impulso_campanhas set verba = least(verba + round(p_verba, 2), 5000), avisar = avisar or p_avisar
     where id = k.id
    returning * into k;
    v_juntou := true;
  else
    if p_dias is null or p_dias < 1 or p_dias > 30 then
      return jsonb_build_object('erro', 'O impulso vai de 1 a 30 dias.');
    end if;
    insert into privado.impulso_campanhas (conta_id, nome, dias, verba, avisar)
    values (p_conta, left(coalesce(nullif(trim(p.nome), ''), 'Cliente'), 120), p_dias, round(p_verba, 2),
            coalesce(p_avisar, true))
    returning * into k;
  end if;
  -- cada vaga leva a parte dela da verba (para as contas do mês); no Google a verba é uma só
  insert into privado.impulsos (conta_id, anuncio_id, titulo, origem, dias, valor, verba, campanha_cliente_id, ate)
  select p_conta, x.id, x.titulo, 'admin', k.dias, 0, greatest(round(p_verba / v_n, 2), 0.01), k.id,
         case when k.situacao = 'no_ar' then k.ate end
    from public.anuncios x where x.id = any(v_ids);
  select string_agg('"' || left(x.titulo, 60) || '"', ', ' order by x.titulo) into v_titulos
    from public.anuncios x where x.id = any(v_ids);
  perform privado.registrar('impulsionar_cliente', 'usuario', p_conta::text, left(p.nome, 120),
                            jsonb_build_object('campanha', k.id, 'vagas', v_ids, 'dias', k.dias,
                                               'verba', round(p_verba, 2), 'juntou', v_juntou, 'avisar', p_avisar));
  if p_avisar then
    perform privado.avisar_pagamento(p_conta,
      case when v_n = 1 then 'O Publike vai impulsionar a vaga ' || v_titulos
           else 'O Publike vai impulsionar ' || v_n || ' vagas suas (' || left(v_titulos, 300) || ')' end
      || ' no Google' || case when v_juntou and k.ate is not null then ' até ' || privado.data_br(k.ate)
                              else ' por ' || k.dias || case when k.dias = 1 then ' dia' else ' dias' end end
      || ', sem custo para você. Depois que o Google aprovar os anúncios, acompanhe em cada vaga quantos viram, '
      || 'clicaram e curtiram.',
      case when v_n = 1 then '/painel/impulsionar/' || v_ids[1] else '/painel/anuncios' end);
  end if;
  return jsonb_build_object('ok', true, 'id', k.id, 'vagas', v_n, 'juntou', v_juntou);
end
$$;

-- para a campanha do cliente inteira: as vagas antes do ar voltam (sem custo, nada a estornar); as no ar saem do
-- Google na próxima volta do robô. A campanha acaba quando a última vaga sair.
create or replace function public.admin_parar_campanha(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k privado.impulso_campanhas;
  i privado.impulsos;
begin
  perform privado.exigir_impulsos_admin();
  select * into k from privado.impulso_campanhas where id = p_id for update;
  if k.id is null or k.situacao not in ('pago', 'em_revisao', 'no_ar') then
    return jsonb_build_object('erro', 'Esta campanha já terminou.');
  end if;
  if not exists (select 1 from privado.impulsos x
                  where x.campanha_cliente_id = k.id and x.situacao in ('pago', 'em_revisao', 'no_ar') and not x.pausar) then
    return jsonb_build_object('erro', 'Esta campanha já está parando.');
  end if;
  perform privado.registrar('parar_campanha', 'usuario', k.conta_id::text, left(k.nome, 120),
                            jsonb_build_object('campanha', k.id, 'situacao', k.situacao));
  -- sem esperar a próxima tentativa de um erro: a campanha sai na próxima volta do robô
  update privado.impulso_campanhas set motivo = 'Parada pelo admin.', proxima_tentativa = null where id = k.id;
  for i in select * from privado.impulsos x
            where x.campanha_cliente_id = k.id and x.situacao in ('pago', 'em_revisao', 'no_ar') for update loop
    if i.situacao = 'no_ar' then
      update privado.impulsos set pausar = true, motivo = 'Parado pelo admin.' where id = i.id;
    else
      perform privado.impulso_devolver(i.id, 'Parado pelo admin.');
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end
$$;

-- os tipos com quantas vagas no ar cada um pega agora (para conferir as palavras)
create or replace function public.admin_tipos_de_vaga()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_impulsos_admin();
  return (with no_ar as (
            select privado.tipo_da_vaga(a.titulo) as tipo_id
              from public.anuncios a
             where a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null)
          select jsonb_build_object(
            'tipos', coalesce((select jsonb_agg(jsonb_build_object(
                'id', t.id, 'nome', t.nome, 'palavras', t.palavras, 'menos', t.menos, 'dias', t.dias, 'verba', t.verba,
                'raio', t.raio, 'vagas', (select count(*) from no_ar n where n.tipo_id = t.id)) order by t.ordem, t.nome)
              from privado.tipos_de_vaga t), '[]'::jsonb),
            'outros', (select count(*) from no_ar n where n.tipo_id is null)));
end
$$;

-- grava a lista inteira de tipos, na ordem dela ([{id?, nome, palavras, menos, dias, verba, raio}]): o que não veio
-- sai. As palavras viram o texto que o tipo procura (sem acento, minúsculas).
create or replace function public.admin_salvar_tipos(p_tipos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l jsonb;
  n integer := 0;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_nome text;
  v_palavras text[];
  v_menos text[];
  v_id_conta integer;
begin
  perform privado.exigir_impulsos_admin();
  if jsonb_typeof(p_tipos) <> 'array' or jsonb_array_length(p_tipos) > 40 then
    return jsonb_build_object('erro', 'Até 40 tipos.');
  end if;
  -- primeiro confere a lista toda (um erro não deixa nada pela metade)
  for l in select * from jsonb_array_elements(p_tipos) loop
    n := n + 1;
    v_nome := trim(coalesce(l ->> 'nome', ''));
    if char_length(v_nome) not between 2 and 40 then
      return jsonb_build_object('erro', 'O tipo ' || n || ' precisa de um nome de 2 a 40 letras.');
    end if;
    if jsonb_typeof(coalesce(l -> 'palavras', '[]')) <> 'array' or jsonb_typeof(coalesce(l -> 'menos', '[]')) <> 'array' then
      return jsonb_build_object('erro', '"' || v_nome || '": as palavras vêm numa lista.');
    end if;
    select count(distinct w) into v_id_conta
      from (select privado.texto_do_tipo(x) as w from jsonb_array_elements_text(coalesce(l -> 'palavras', '[]')) x) y
     where char_length(w) between 2 and 40;
    if v_id_conta = 0 then
      return jsonb_build_object('erro', '"' || v_nome || '" precisa de pelo menos uma palavra.');
    end if;
    if v_id_conta > 40 or jsonb_array_length(coalesce(l -> 'menos', '[]')) > 40 then
      return jsonb_build_object('erro', '"' || v_nome || '": até 40 palavras.');
    end if;
    if (case when coalesce(l ->> 'dias', '') !~ '^[0-9]{0,2}$' then true
             else (l ->> 'dias')::integer not between 1 and 30 end) then
      return jsonb_build_object('erro', '"' || v_nome || '": os dias vão de 1 a 30.');
    end if;
    if (case when coalesce(l ->> 'verba', '') !~ '^([0-9]{1,4}(\.[0-9]{1,2})?)?$' then true
             else (l ->> 'verba')::numeric not between 1 and 1000 end) then
      return jsonb_build_object('erro', '"' || v_nome || '": a verba por vaga vai de R$ 1 a R$ 1.000.');
    end if;
    if (case when coalesce(l ->> 'raio', '') !~ '^[0-9]{0,2}$' then true
             else (l ->> 'raio')::integer not between 1 and 65 end) then
      return jsonb_build_object('erro', '"' || v_nome || '": o raio vai de 1 a 65 km.');
    end if;
    if (select count(*) from jsonb_array_elements(p_tipos) x where lower(trim(x ->> 'nome')) = lower(v_nome)) > 1 then
      return jsonb_build_object('erro', 'Dois tipos com o nome "' || v_nome || '".');
    end if;
  end loop;
  -- os que saem da lista saem antes (o nome deles fica livre para um tipo novo)
  delete from privado.tipos_de_vaga t
   where not exists (select 1 from jsonb_array_elements(p_tipos) x
                      where x ->> 'id' = t.id::text or lower(trim(x ->> 'nome')) = lower(t.nome));
  n := 0;
  for l in select * from jsonb_array_elements(p_tipos) loop
    n := n + 1;
    v_nome := trim(l ->> 'nome');
    select coalesce(array_agg(distinct w), '{}') into v_palavras
      from (select privado.texto_do_tipo(x) as w from jsonb_array_elements_text(coalesce(l -> 'palavras', '[]')) x) y
     where char_length(w) between 2 and 40;
    select coalesce(array_agg(distinct w), '{}') into v_menos
      from (select privado.texto_do_tipo(x) as w from jsonb_array_elements_text(coalesce(l -> 'menos', '[]')) x) y
     where char_length(w) between 2 and 40;
    v_id := case when (l ->> 'id') ~ '^[0-9a-f-]{36}$' then (l ->> 'id')::uuid end;
    -- sem o id (ou com um que não existe mais), o tipo de mesmo nome é o mesmo tipo
    if v_id is null or not exists (select 1 from privado.tipos_de_vaga t where t.id = v_id) then
      select t.id into v_id from privado.tipos_de_vaga t
       where lower(t.nome) = lower(v_nome) and not (t.id = any(v_ids));
    end if;
    if v_id is not null then
      update privado.tipos_de_vaga
         set nome = v_nome, palavras = v_palavras, menos = v_menos, dias = (l ->> 'dias')::smallint,
             verba = round((l ->> 'verba')::numeric, 2), raio = (l ->> 'raio')::smallint, ordem = n * 10
       where id = v_id;
    else
      insert into privado.tipos_de_vaga (nome, palavras, menos, dias, verba, raio, ordem)
      values (v_nome, v_palavras, v_menos, (l ->> 'dias')::smallint, round((l ->> 'verba')::numeric, 2),
              (l ->> 'raio')::smallint, n * 10)
      returning id into v_id;
    end if;
    v_ids := v_ids || v_id;
  end loop;
  delete from privado.tipos_de_vaga t where not (t.id = any(v_ids));
  perform privado.registrar('tipos_de_vaga', 'config', 'impulso', 'Tipos de vaga do impulso',
                            jsonb_build_object('tipos', p_tipos));
  return jsonb_build_object('ok', true, 'tipos', n);
exception when unique_violation then
  -- uma troca de nomes entre dois tipos na mesma vez: nada muda
  return jsonb_build_object('erro', 'Não deu para trocar os nomes de dois tipos de uma vez. Salve um de cada vez.');
end
$$;

-- tudo do Admin › Impulsos: os preços e as regras, o mês, os tipos, as campanhas dos clientes, os impulsos (com o
-- tipo de cada vaga) e o resultado por tipo nos últimos 90 dias
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
        'motivo', k.motivo, 'erro', k.ultimo_erro, 'erro_desde', k.erro_desde, 'campanha_id', k.campanha_id)
        order by k.criado_em desc)
      from privado.impulso_campanhas k
     where k.situacao in ('pago', 'em_revisao', 'no_ar') or k.criado_em > now() - interval '60 days'), '[]'::jsonb),
    'impulsos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'conta', p.nome, 'conta_id', i.conta_id, 'anuncio_id', i.anuncio_id, 'titulo', i.titulo,
        'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'valor', i.valor, 'verba', i.verba,
        'gasto', i.gasto, 'campanha_id', i.campanha_id, 'criado_em', i.criado_em, 'aprovado_em', i.aprovado_em,
        'ate', i.ate, 'pausar', i.pausar, 'erro', i.ultimo_erro, 'erro_desde', i.erro_desde, 'motivo', i.motivo,
        'sandbox', i.sandbox, 'automatico', i.automatico, 'campanha_cliente_id', i.campanha_cliente_id,
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

-- ------------------------------------------------------------------ permissões

revoke execute on function privado.texto_do_tipo(text), privado.tipo_da_vaga(text), privado.raio_da_vaga(text, text),
  privado.verba_dia_da_campanha(uuid) from public;

-- como as outras do servidor: a chave do servidor (p_chave) é quem protege
revoke execute on function public.servidor_campanhas_para_cuidar(text), public.servidor_campanha_criada(text, uuid, jsonb),
  public.servidor_campanha_orcamento(text, uuid, numeric), public.servidor_campanha_encerrada(text, uuid),
  public.servidor_campanha_erro(text, uuid, text), public.servidor_impulsos_para_cuidar(text),
  public.servidor_impulso_criado(text, uuid, jsonb), public.servidor_impulso_olhado(text, uuid, text, text),
  public.servidor_impulso_encerrado(text, uuid) from public;
grant execute on function public.servidor_campanhas_para_cuidar(text), public.servidor_campanha_criada(text, uuid, jsonb),
  public.servidor_campanha_orcamento(text, uuid, numeric), public.servidor_campanha_encerrada(text, uuid),
  public.servidor_campanha_erro(text, uuid, text), public.servidor_impulsos_para_cuidar(text),
  public.servidor_impulso_criado(text, uuid, jsonb), public.servidor_impulso_olhado(text, uuid, text, text),
  public.servidor_impulso_encerrado(text, uuid) to anon, authenticated, service_role;

revoke execute on function public.impulso_da_vaga(uuid) from public, anon;
grant execute on function public.impulso_da_vaga(uuid) to authenticated;

revoke execute on function public.admin_vagas_para_impulso(text, text, uuid),
  public.admin_impulsionar_cliente(uuid, uuid[], integer, numeric, boolean), public.admin_parar_campanha(uuid),
  public.admin_tipos_de_vaga(), public.admin_salvar_tipos(jsonb), public.admin_impulsos() from public, anon;
grant execute on function public.admin_vagas_para_impulso(text, text, uuid),
  public.admin_impulsionar_cliente(uuid, uuid[], integer, numeric, boolean), public.admin_parar_campanha(uuid),
  public.admin_tipos_de_vaga(), public.admin_salvar_tipos(jsonb), public.admin_impulsos()
  to authenticated, service_role;

notify pgrst, 'reload schema';
