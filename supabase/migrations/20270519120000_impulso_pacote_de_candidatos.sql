-- O pacote de candidatos (14/11/2026, claude/plano-nova-venda-do-impulso.md). Pedidos do Marcelo: "quero remover todos
-- e criar uma nova estratégia de venda" e, sobre o resumo do plano, "implemente". Decisões dele no mesmo dia: "Venda
-- desligada, piloto antes" e "Quadro + verba na geral".
--
-- A venda nova vende candidato, não anúncio ("você só paga pelos candidatos que chegarem"):
--   * o cliente compra um pacote de candidatos para a vaga (5, 10 ou 20). A vaga entra no quadro "Vagas impulsionadas
--     na região", no alto das páginas de vagas da cidade, para onde a campanha geral do Google leva quem procura
--     emprego, até chegarem os candidatos ou acabar o prazo (30 dias);
--   * cada curtida de quem chegou pelo destaque (o quadro, ou o link da vaga no anúncio geral, posto à mão no piloto)
--     desconta um candidato. Chegou o último, o pacote acaba na hora e o cliente recebe o aviso;
--   * o que não chegar fica de saldo de candidatos: o cliente para quando quiser e usa o saldo em outra vaga. Vale 90
--     dias. No presente do Publike, o que não chegou não vira saldo;
--   * cada pacote no ar soma uma verba por dia ao orçamento da campanha geral (o robô acerta de manhã e quando entra um
--     pacote novo): o dinheiro do cliente traz gente nova, e o quadro põe a vaga dele na frente dessa gente.
-- O impulso de produto 'candidatos' não tem campanha no Google: nasce no ar e o banco cuida dele (o robô do Google só o
-- vê para o estorno). O impulso de antes (produto 'google') segue igual, com a venda desligada desde 14/11.
-- A venda do pacote nasce desligada (Admin › Impulsos); no piloto, o Admin dá pacotes de presente (admin_dar_pacotes).
-- A visita e a curtida passam a dizer de onde vieram (o quadro ou o Google), e a curtida conta pela vaga e pelo
-- navegador (não só pelo último código guardado no cookie). Pode rodar de novo.

-- ------------------------------------------------------------------ as colunas

alter table privado.impulsos
  add column if not exists produto text not null default 'google',
  -- o pacote de candidatos: quantos candidatos ele traz
  add column if not exists alvo smallint,
  -- quanto o pacote soma por dia ao orçamento da campanha geral (o valor da configuração quando ele começou)
  add column if not exists verba_dia numeric(10,2);
alter table privado.impulsos drop constraint if exists impulsos_produto_check;
alter table privado.impulsos add constraint impulsos_produto_check
  check (produto in ('google', 'candidatos') and (produto = 'candidatos') = (alvo is not null));
alter table privado.impulsos drop constraint if exists impulsos_alvo_check;
alter table privado.impulsos add constraint impulsos_alvo_check check (alvo is null or alvo between 1 and 100);
alter table privado.impulsos drop constraint if exists impulsos_verba_dia_check;
alter table privado.impulsos add constraint impulsos_verba_dia_check check (verba_dia is null or verba_dia between 0 and 100);
-- o pacote pode nascer sem verba na campanha geral (a verba por dia em zero)
alter table privado.impulsos drop constraint if exists impulsos_verba_check;
alter table privado.impulsos add constraint impulsos_verba_check check (verba > 0 or (produto = 'candidatos' and verba >= 0));

-- de onde veio a visita e a curtida: o anúncio no Google (a campanha da vaga ou o link na geral) ou o quadro do Publike
alter table privado.impulso_visitas add column if not exists origem text not null default 'google';
alter table privado.impulso_visitas drop constraint if exists impulso_visitas_origem_check;
alter table privado.impulso_visitas add constraint impulso_visitas_origem_check check (origem in ('google', 'quadro', 'link'));
alter table privado.impulso_curtidas add column if not exists origem text not null default 'google';
alter table privado.impulso_curtidas drop constraint if exists impulso_curtidas_origem_check;
alter table privado.impulso_curtidas add constraint impulso_curtidas_origem_check check (origem in ('google', 'quadro', 'link'));
alter table privado.impulso_dias
  add column if not exists visitas_quadro integer not null default 0 check (visitas_quadro >= 0),
  add column if not exists curtidas_quadro integer not null default 0 check (curtidas_quadro >= 0);

-- a compra do pacote: quantos candidatos
alter table privado.compras_avulsas add column if not exists candidatos smallint
  check (candidatos is null or candidatos between 1 and 100);

alter table privado.config_impulso
  -- a venda do pacote (nasce desligada), os dias no destaque e a verba por dia que cada pacote soma à campanha geral
  add column if not exists pacote_ligado boolean not null default false,
  add column if not exists pacote_dias smallint not null default 30 check (pacote_dias between 1 and 60),
  add column if not exists pacote_verba_dia numeric(10,2) not null default 5 check (pacote_verba_dia between 0 and 100),
  -- a campanha geral (a mãe): o robô acerta o orçamento dela para a base mais a verba dos pacotes no ar, até o máximo
  add column if not exists geral_ligada boolean not null default false,
  add column if not exists geral_conta text check (geral_conta is null or geral_conta ~ '^[0-9]{10}$'),
  add column if not exists geral_campanha_id text check (geral_campanha_id is null or geral_campanha_id ~ '^[0-9]{1,20}$'),
  add column if not exists geral_base numeric(10,2) not null default 60 check (geral_base between 1 and 5000),
  add column if not exists geral_maximo numeric(10,2) not null default 150 check (geral_maximo between 1 and 5000),
  -- a última vez que deu certo (e o valor) e o último erro
  add column if not exists geral_feita_em timestamptz,
  add column if not exists geral_valor numeric(10,2),
  add column if not exists geral_erro text,
  add column if not exists geral_erro_em timestamptz;
-- a campanha "Publike · Candidatos · Vagas · Goiânia", na conta publike.org (948-395-5066), com R$ 60 por dia em 14/11
update privado.config_impulso
   set geral_conta = coalesce(geral_conta, '9483955066'), geral_campanha_id = coalesce(geral_campanha_id, '24373658306')
 where id;

-- ------------------------------------------------------------------ os pacotes à venda e o saldo

create table if not exists privado.pacotes_candidatos (
  candidatos smallint primary key check (candidatos between 1 and 100),
  valor numeric(10,2) not null check (valor > 0),
  ligado boolean not null default false
);
alter table privado.pacotes_candidatos enable row level security;
revoke all on privado.pacotes_candidatos from public, anon, authenticated;
-- os preços saem do piloto: estes são só o começo, todos desligados
insert into privado.pacotes_candidatos (candidatos, valor, ligado) values (5, 49.00, false), (10, 89.00, false),
  (20, 159.00, false)
on conflict (candidatos) do nothing;

-- o saldo de candidatos: cada lote (o que não chegou de um pacote, ou a compra que não pôde virar pacote) vale 90 dias;
-- usar o saldo tira dos lotes que vencem primeiro
create table if not exists privado.saldo_candidatos (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.perfis(id) on delete cascade,
  candidatos smallint not null check (candidatos between 1 and 100),
  restantes smallint not null check (restantes between 0 and 100),
  de_impulso uuid references privado.impulsos(id) on delete set null,
  de_compra uuid references privado.compras_avulsas(id) on delete set null,
  criado_em timestamptz not null default now(),
  ate timestamptz not null default now() + interval '90 days',
  check (restantes <= candidatos)
);
create index if not exists saldo_candidatos_conta on privado.saldo_candidatos (conta_id, ate) where restantes > 0;
create unique index if not exists saldo_candidatos_um_por_impulso on privado.saldo_candidatos (de_impulso)
  where de_impulso is not null;
create unique index if not exists saldo_candidatos_um_por_compra on privado.saldo_candidatos (de_compra)
  where de_compra is not null;
alter table privado.saldo_candidatos enable row level security;
revoke all on privado.saldo_candidatos from public, anon, authenticated;

-- ------------------------------------------------------------------ as regras do pacote

-- os candidatos que chegaram pelo destaque e continuam com a curtida de pé (a curtida desfeita não conta)
create or replace function privado.pacote_entregues(p_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from privado.impulso_curtidas c
    join privado.impulsos i on i.id = c.impulso_id
   where c.impulso_id = p_id
     and exists (select 1 from public.curtidas k where k.anuncio_id = i.anuncio_id and k.perfil_id = c.perfil_id)
$$;

-- o saldo de candidatos que vale agora
create or replace function privado.saldo_de_candidatos(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(s.restantes), 0)::integer from privado.saldo_candidatos s
   where s.conta_id = p_conta and s.restantes > 0 and s.ate > now()
$$;

-- o pacote começa: no ar na hora (não passa pelo Google), no quadro até chegarem os candidatos ou acabar o prazo
create or replace function privado.pacote_comecar(p_conta uuid, p_anuncio uuid, p_titulo text, p_origem text,
                                                  p_candidatos integer, p_valor numeric, p_compra uuid, p_dias integer,
                                                  p_sandbox boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
  v_dias integer;
  v_id uuid;
begin
  select * into c from privado.config_impulso where id;
  v_dias := coalesce(p_dias, c.pacote_dias, 30);
  insert into privado.impulsos (conta_id, anuncio_id, titulo, compra_id, origem, produto, alvo, dias, valor, verba,
                                verba_dia, situacao, aprovado_em, ate, sandbox)
  values (p_conta, p_anuncio, coalesce(p_titulo, 'Vaga'), p_compra, p_origem, 'candidatos', p_candidatos, v_dias,
          coalesce(p_valor, 0), round(coalesce(c.pacote_verba_dia, 0) * v_dias, 2), coalesce(c.pacote_verba_dia, 0),
          'no_ar', now(), now() + make_interval(days => v_dias), coalesce(p_sandbox, false))
  returning id into v_id;
  return v_id;
end
$$;

-- o pacote termina: chegou o último candidato, acabou o prazo, a vaga saiu, o cliente ou o admin parou. O que não chegou
-- vira saldo de quem pagou (no pago e no feito com saldo; o presente do Publike só termina). Com p_avisar, o cliente
-- recebe o aviso com quantos chegaram.
create or replace function privado.pacote_terminar(p_id uuid, p_motivo text, p_avisar boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
  v_entregues integer;
  v_sobra integer;
  v_saldo boolean;
  v_ate timestamptz := now() + interval '90 days';
begin
  select * into i from privado.impulsos where id = p_id and produto = 'candidatos' for update;
  if i.id is null or i.situacao not in ('pago', 'em_revisao', 'no_ar') then
    return null;
  end if;
  v_entregues := privado.pacote_entregues(i.id);
  v_sobra := greatest(i.alvo - v_entregues, 0);
  v_saldo := v_sobra > 0 and i.origem in ('compra', 'credito');
  update privado.impulsos
     set situacao = case when v_saldo then 'credito' else 'encerrado' end, encerrado_em = now(), pausar = false,
         motivo = left(p_motivo, 300), ate = least(coalesce(ate, now()), now())
   where id = i.id;
  if v_saldo then
    insert into privado.saldo_candidatos (conta_id, candidatos, restantes, de_impulso, ate)
    values (i.conta_id, v_sobra, v_sobra, i.id, v_ate)
    on conflict (de_impulso) where de_impulso is not null do nothing;
  end if;
  if p_avisar then
    perform privado.avisar_pagamento(i.conta_id,
      case when v_sobra = 0
           then 'Chegaram os ' || i.alvo || case when i.alvo = 1 then ' candidato' else ' candidatos' end
                || ' do pacote da vaga "' || left(i.titulo, 80) || '". Veja quem curtiu na vaga.'
           else 'O pacote da vaga "' || left(i.titulo, 80) || '" terminou: chegaram ' || v_entregues || ' de '
                || i.alvo || case when i.alvo = 1 then ' candidato.' else ' candidatos.' end
                || case when not v_saldo then ''
                        when v_sobra = 1 then ' O que faltou ficou de saldo para outra vaga até ' || privado.data_br(v_ate) || '.'
                        else ' Os ' || v_sobra || ' que faltaram ficaram de saldo para outra vaga até '
                             || privado.data_br(v_ate) || '.' end
      end,
      case when i.anuncio_id is null then '/painel/anuncios'
           when v_sobra = 0 then '/painel/anuncio/' || i.anuncio_id
           else '/painel/impulsionar/' || i.anuncio_id end);
  end if;
  return jsonb_build_object('ok', true, 'entregues', v_entregues, 'saldo', case when v_saldo then v_sobra else 0 end);
end
$$;

-- a cada volta do robô: termina o pacote que acabou o prazo, que foi parado (a vaga fechou ou foi preenchida: o gatilho
-- impulso_vaga_mudou marca o "pausar") ou cuja vaga saiu do ar
create or replace function privado.cuidar_dos_pacotes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
  v_vaga boolean;
begin
  for i in select x.* from privado.impulsos x
            where x.produto = 'candidatos' and x.situacao in ('pago', 'em_revisao', 'no_ar')
            order by x.criado_em
  loop
    select exists (select 1 from public.anuncios a
                    where a.id = i.anuncio_id and a.status = 'ativo' and a.preenchida_em is null
                      and coalesce(a.expira_em > now(), true))
      into v_vaga;
    if i.pausar and i.motivo = 'Parado pelo admin.' then
      perform privado.pacote_terminar(i.id, i.motivo, false);
    elsif i.pausar or not v_vaga then
      perform privado.pacote_terminar(i.id, 'A vaga saiu do ar ou foi preenchida.', true);
    elsif i.ate <= now() then
      perform privado.pacote_terminar(i.id, 'Acabou o prazo do pacote.', true);
    end if;
  end loop;
end
$$;

-- ------------------------------------------------------------------ a visita e a curtida

-- a visita de quem chegou pelo destaque: o anúncio no Google ('google'), o link da vaga no anúncio geral ('link') ou o
-- quadro do Publike ('quadro'). Uma por navegador por dia; vale até 2 dias depois de o impulso acabar.
create or replace function public.contar_visita_do_impulso(p_codigo text, p_anuncio uuid, p_visitante text, p_origem text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_origem text := case when p_origem in ('quadro', 'link') then p_origem else 'google' end;
  v_n integer;
begin
  if p_codigo !~ '^[a-z0-9]{6,20}$' or p_visitante !~ '^[A-Za-z0-9_-]{16,64}$' then
    return false;
  end if;
  select i.id into v_id from privado.impulsos i
   where i.codigo = p_codigo and i.anuncio_id = p_anuncio
     and (i.situacao in ('em_revisao', 'no_ar')
          or (i.situacao in ('encerrado', 'credito') and i.encerrado_em > now() - interval '2 days'));
  if v_id is null then
    return false;
  end if;
  insert into privado.impulso_visitas (impulso_id, visitante, dia, origem) values (v_id, p_visitante, v_dia, v_origem)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return false;
  end if;
  insert into privado.impulso_dias (impulso_id, dia, visitas, visitas_quadro)
  values (v_id, v_dia, 1, case when v_origem = 'quadro' then 1 else 0 end)
  on conflict (impulso_id, dia) do update
    set visitas = privado.impulso_dias.visitas + 1,
        visitas_quadro = privado.impulso_dias.visitas_quadro + case when v_origem = 'quadro' then 1 else 0 end;
  return true;
end
$$;

-- a de antes (o site de antes desta migração): a visita pelo anúncio no Google
create or replace function public.contar_visita_do_impulso(p_codigo text, p_anuncio uuid, p_visitante text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.contar_visita_do_impulso(p_codigo, p_anuncio, p_visitante, 'google')
$$;

-- A curtida de quem chegou pelo destaque desta vaga nos últimos 7 dias (o mesmo navegador): conta uma vez por pessoa,
-- no impulso mais novo da vaga pelo qual o navegador chegou (antes, só o último código guardado no cookie contava, e
-- quem abria duas vagas do quadro perdia a primeira). No pacote de candidatos, a curtida que completa o pacote o
-- termina na hora.
create or replace function public.contar_curtida_do_impulso(p_visitante text, p_anuncio uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_id uuid;
  v_origem text;
  v_n integer;
  i privado.impulsos;
begin
  if (select auth.uid()) is null or eu is null or p_visitante !~ '^[A-Za-z0-9_-]{16,64}$' then
    return false;
  end if;
  if not exists (select 1 from public.curtidas c where c.anuncio_id = p_anuncio and c.perfil_id = eu) then
    return false;
  end if;
  select v.impulso_id, v.origem into v_id, v_origem
    from privado.impulso_visitas v
    join privado.impulsos x on x.id = v.impulso_id
   where x.anuncio_id = p_anuncio and v.visitante = p_visitante and v.dia >= v_dia - 7
   order by x.criado_em desc, v.dia desc
   limit 1;
  if v_id is null then
    return false;
  end if;
  insert into privado.impulso_curtidas (impulso_id, perfil_id, origem) values (v_id, eu, v_origem) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return false;
  end if;
  insert into privado.impulso_dias (impulso_id, dia, curtidas, curtidas_quadro)
  values (v_id, v_dia, 1, case when v_origem = 'quadro' then 1 else 0 end)
  on conflict (impulso_id, dia) do update
    set curtidas = privado.impulso_dias.curtidas + 1,
        curtidas_quadro = privado.impulso_dias.curtidas_quadro + case when v_origem = 'quadro' then 1 else 0 end;
  select * into i from privado.impulsos where id = v_id;
  if i.produto = 'candidatos' and i.situacao = 'no_ar' and privado.pacote_entregues(i.id) >= i.alvo then
    perform privado.pacote_terminar(i.id, 'Chegaram os candidatos do pacote.', true);
  end if;
  return true;
end
$$;

-- O quadro "Vagas impulsionadas na região" (20270506120000), agora com o código do impulso: o cartão leva à vaga com
-- ele, e a visita e a curtida que vêm do quadro contam para quem impulsionou.
drop function if exists public.vagas_impulsionadas();
create function public.vagas_impulsionadas()
returns table (anuncio_id uuid, desde timestamptz, codigo text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (i.anuncio_id) i.anuncio_id, coalesce(i.aprovado_em, i.criado_em) as desde, i.codigo
    from privado.impulsos i
    join public.anuncios a on a.id = i.anuncio_id
   where i.situacao in ('em_revisao', 'no_ar')
     and not i.pausar
     and (i.ate is null or i.ate > now())
     and a.tipo = 'vaga'
     and a.status = 'ativo'
   order by i.anuncio_id, coalesce(i.aprovado_em, i.criado_em) desc
$$;

-- ------------------------------------------------------------------ quem contrata

-- para o pacote no ar da vaga: o que não chegou vira saldo (no presente do Publike, ele só para)
create or replace function public.parar_pacote(p_impulso uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  i privado.impulsos;
  r jsonb;
begin
  if (select auth.uid()) is null or conta is null then
    return jsonb_build_object('erro', 'Entre na sua conta.');
  end if;
  select * into i from privado.impulsos where id = p_impulso and conta_id = conta and produto = 'candidatos';
  if i.id is null or i.situacao not in ('pago', 'em_revisao', 'no_ar') then
    return jsonb_build_object('erro', 'Este pacote já terminou.');
  end if;
  r := privado.pacote_terminar(i.id, 'Parado por você.', false);
  return jsonb_build_object('ok', true, 'entregues', coalesce((r ->> 'entregues')::integer, 0),
                            'saldo', coalesce((r ->> 'saldo')::integer, 0));
end
$$;

-- usa o saldo de candidatos numa vaga: tira dos lotes que vencem primeiro e começa o pacote
create or replace function public.usar_saldo_de_candidatos(p_anuncio uuid, p_candidatos integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  v_motivo text;
  v_falta integer := p_candidatos;
  v_tira integer;
  s privado.saldo_candidatos;
  v_id uuid;
begin
  if (select auth.uid()) is null or conta is null then
    return jsonb_build_object('erro', 'Entre na sua conta.');
  end if;
  if p_candidatos is null or p_candidatos < 1 or p_candidatos > 100 then
    return jsonb_build_object('erro', 'Escolha quantos candidatos usar.');
  end if;
  perform pg_advisory_xact_lock(hashtext('impulso:' || conta));
  v_motivo := privado.impulso_motivo_vaga(conta, p_anuncio);
  if v_motivo is not null then
    return jsonb_build_object('erro', v_motivo);
  end if;
  if privado.saldo_de_candidatos(conta) < p_candidatos then
    return jsonb_build_object('erro', 'O seu saldo não chega a tantos candidatos. Atualize a página.');
  end if;
  for s in select * from privado.saldo_candidatos
            where conta_id = conta and restantes > 0 and ate > now()
            order by ate, criado_em for update loop
    exit when v_falta = 0;
    v_tira := least(s.restantes, v_falta);
    update privado.saldo_candidatos set restantes = restantes - v_tira where id = s.id;
    v_falta := v_falta - v_tira;
  end loop;
  v_id := privado.pacote_comecar(conta, p_anuncio, (select a.titulo from public.anuncios a where a.id = p_anuncio),
                                 'credito', p_candidatos, 0, null, null, false);
  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;

-- ------------------------------------------------------------------ a compra

-- a compra do pacote (como a do impulso): devolve o id, o valor, os candidatos e os dias
create or replace function public.servidor_compra_pacote(p_chave text, p_conta uuid, p_anuncio uuid, p_candidatos integer,
                                                         p_forma text, p_sandbox boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
  pc privado.pacotes_candidatos;
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
  select * into c from privado.config_impulso where id;
  if not coalesce(c.pacote_ligado, false) then
    return jsonb_build_object('erro', 'O pacote de candidatos ainda não está à venda.');
  end if;
  v_motivo := privado.impulso_motivo_vaga(p_conta, p_anuncio);
  if v_motivo is not null then
    return jsonb_build_object('erro', v_motivo);
  end if;
  select * into pc from privado.pacotes_candidatos where candidatos = p_candidatos and ligado;
  if pc.candidatos is null then
    return jsonb_build_object('erro', 'Esse pacote não está à venda. Atualize a página.');
  end if;
  insert into privado.compras_avulsas (conta_id, tipo, recurso, valor, forma, dias, anuncio_id, verba, candidatos, sandbox)
  values (p_conta, 'impulso', 'impulso', pc.valor, p_forma, c.pacote_dias, p_anuncio,
          round(c.pacote_verba_dia * c.pacote_dias, 2), pc.candidatos, coalesce(p_sandbox, false))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'valor', pc.valor, 'candidatos', pc.candidatos, 'dias', c.pacote_dias,
                            'titulo', (select a.titulo from public.anuncios a where a.id = p_anuncio));
end
$$;

-- o pagamento confirmado vira impulso (o de 20270423120000) ou, com candidatos, pacote. Se a vaga já não pode, o impulso
-- vira crédito de dias e o pacote, saldo de candidatos.
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
     or exists (select 1 from privado.creditos_impulso c where c.de_compra = k.id)
     or exists (select 1 from privado.saldo_candidatos s where s.de_compra = k.id) then
    return;
  end if;
  select a.titulo into v_titulo from public.anuncios a where a.id = k.anuncio_id;
  v_motivo := case when k.anuncio_id is null then 'A vaga saiu.' else privado.impulso_motivo_vaga(k.conta_id, k.anuncio_id) end;
  if k.candidatos is not null then
    if v_motivo is null then
      v_id := privado.pacote_comecar(k.conta_id, k.anuncio_id, v_titulo, 'compra', k.candidatos, k.valor, k.id,
                                     k.dias, k.sandbox);
      perform privado.avisar_pagamento(k.conta_id,
        'Pagamento confirmado: a vaga "' || left(v_titulo, 80) || '" entrou no destaque do Publike até chegarem '
        || k.candidatos || case when k.candidatos = 1 then ' candidato.' else ' candidatos.' end
        || ' Você acompanha cada um por aqui.', '/painel/impulsionar/' || k.anuncio_id);
    else
      insert into privado.saldo_candidatos (conta_id, candidatos, restantes, de_compra)
      values (k.conta_id, k.candidatos, k.candidatos, k.id);
      perform privado.avisar_pagamento(k.conta_id,
        'Pagamento confirmado. ' || v_motivo || ' Os ' || k.candidatos || ' candidatos ficaram de saldo para outra vaga até '
        || privado.data_br(now() + interval '90 days') || '.', '/painel/anuncios');
    end if;
    return;
  end if;
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

-- o pagamento foi devolvido: o impulso sai (o robô remove a campanha) e o saldo que veio dessa compra deixa de valer
create or replace function privado.impulso_estornado(p_compra uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update privado.impulsos
     set situacao = 'devolvido', motivo = coalesce(motivo, 'O pagamento foi devolvido.'), pausar = false,
         estorno_pedido_em = coalesce(estorno_pedido_em, now())
   where compra_id = p_compra and situacao in ('pago', 'em_revisao', 'no_ar');
  update privado.saldo_candidatos
     set restantes = 0
   where restantes > 0
     and (de_compra = p_compra or de_impulso in (select i.id from privado.impulsos i where i.compra_id = p_compra));
end
$$;

-- o nome na fatura: serve ao impulso de antes e ao pacote
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
           when 'impulso' then 'Impulso da vaga'
           else 'Teste Prático' end
$$;

-- ------------------------------------------------------------------ a campanha geral (a mãe)

-- quanto a campanha geral deve ter por dia agora: a base mais a verba de cada pacote no ar, até o máximo
create or replace function privado.geral_valor_alvo()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select least(c.geral_maximo,
               c.geral_base + coalesce((select sum(i.verba_dia) from privado.impulsos i
                                         where i.produto = 'candidatos' and i.situacao = 'no_ar' and not i.pausar
                                           and i.ate > now()), 0))
    from privado.config_impulso c where c.id
$$;

-- para o robô: se é hora de acertar o orçamento da campanha geral (de manhã, uma vez por dia, e na hora em que o valor
-- sobe com um pacote novo), a conta, a campanha e o valor. Depois de um erro, espera 1 hora.
create or replace function public.servidor_geral_do_dia(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
  v_alvo numeric;
  v_hoje_6h timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + time '06:00') at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.config_impulso where id;
  if c.id is null or not c.geral_ligada or c.geral_conta is null or c.geral_campanha_id is null then
    return jsonb_build_object('fazer', false);
  end if;
  v_alvo := privado.geral_valor_alvo();
  return jsonb_build_object(
    'fazer', ((now() >= v_hoje_6h and (c.geral_feita_em is null or c.geral_feita_em < v_hoje_6h))
              or v_alvo > coalesce(c.geral_valor, 0))
             and (c.geral_erro_em is null or c.geral_erro_em < now() - interval '1 hour'),
    'conta', c.geral_conta, 'campanha_id', c.geral_campanha_id, 'valor', v_alvo);
end
$$;

-- o robô acertou o orçamento da campanha geral (ou deu erro)
create or replace function public.servidor_geral_feita(p_chave text, p_valor numeric, p_erro text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if p_erro is null then
    update privado.config_impulso
       set geral_feita_em = now(), geral_valor = round(p_valor, 2), geral_erro = null, geral_erro_em = null
     where id;
  else
    update privado.config_impulso set geral_erro = left(p_erro, 500), geral_erro_em = now() where id;
  end if;
end
$$;

-- ------------------------------------------------------------------ o robô do Google não mexe no pacote

-- a lista do robô (a de 20270518120000): antes, o banco cuida dos pacotes de candidatos; eles ficam de fora da lista,
-- menos para o estorno
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
  -- o pacote de candidatos (20270519120000) não tem campanha no Google: o banco termina o que acabou o prazo, foi
  -- parado ou perdeu a vaga
  perform privado.cuidar_dos_pacotes();
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
      -- o pacote de candidatos só passa pelo robô para o estorno (o resto é do banco)
      and (i.produto = 'google' or (i.situacao = 'devolvido' and i.origem = 'compra' and i.estorno_pedido_em is null))
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

-- a lista "funções com impulso no ar" (20270504120000): só as vagas com campanha no Google
create or replace function public.servidor_impulsos_sem_disputa(p_chave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vagas jsonb;
  v_assinatura text;
begin
  perform privado.exigir_servidor(p_chave);
  select coalesce(jsonb_agg(jsonb_build_object('titulo', x.titulo, 'cbo', x.cbo) order by x.id), '[]'::jsonb),
         md5(coalesce(string_agg(x.id::text || '|' || x.titulo || '|' || coalesce(x.cbo, ''), ',' order by x.id), ''))
    into v_vagas, v_assinatura
    from (select i.id, a.titulo, (select f.cbo from privado.funcoes_das_vagas f where f.anuncio_id = a.id) as cbo
            from privado.impulsos i
            join public.anuncios a on a.id = i.anuncio_id
           where i.situacao = 'no_ar' and not i.pausar and (i.ate is null or i.ate > now())
             and i.produto = 'google') x;
  return jsonb_build_object(
    'vagas', v_vagas,
    'assinatura', v_assinatura,
    'feita', (select c.sem_disputa_assinatura from privado.config_impulso c where c.id),
    'feita_em', (select c.sem_disputa_em from privado.config_impulso c where c.id));
end
$$;

-- ------------------------------------------------------------------ a página do impulso da vaga e o Admin

-- a página do impulso da vaga (a de 20270518120000), com o pacote de candidatos: os pacotes à venda, o saldo, o alvo e
-- quantos chegaram, e as visitas e curtidas que vieram do quadro
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
    -- o pacote de candidatos (20270519120000): os pacotes à venda (só com a venda ligada), os dias no destaque e o
    -- saldo de candidatos da conta (e até quando vale o que vence primeiro)
    'pacote_ligado', coalesce((select c.pacote_ligado from privado.config_impulso c where c.id), false),
    'pacote_dias', (select c.pacote_dias from privado.config_impulso c where c.id),
    'pacotes', case when coalesce((select c.pacote_ligado from privado.config_impulso c where c.id), false)
                    then coalesce((select jsonb_agg(jsonb_build_object('candidatos', p.candidatos, 'valor', p.valor)
                                                    order by p.candidatos)
                                     from privado.pacotes_candidatos p where p.ligado), '[]'::jsonb)
                    else '[]'::jsonb end,
    'saldo', privado.saldo_de_candidatos(conta),
    'saldo_ate', (select min(s.ate) from privado.saldo_candidatos s
                   where s.conta_id = conta and s.restantes > 0 and s.ate > now()),
    -- na campanha do cliente, a verba é uma só para as vagas dele: o cliente vê a da campanha e quantas vagas ela tem
    'impulsos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'valor', i.valor,
        -- o pacote de candidatos: quantos candidatos ele traz, quantos já chegaram e quantos viraram saldo no fim
        'produto', i.produto, 'alvo', i.alvo,
        'entregues', case when i.produto = 'candidatos' then privado.pacote_entregues(i.id) end,
        'virou_saldo', (select s.candidatos from privado.saldo_candidatos s where s.de_impulso = i.id),
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
                                             'curtidas', coalesce(sum(d.curtidas), 0),
                                             'visitas_quadro', coalesce(sum(d.visitas_quadro), 0),
                                             'curtidas_quadro', coalesce(sum(d.curtidas_quadro), 0))
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
                                                  'candidatos', k.candidatos,
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

-- Admin › Impulsos (o de 20270518120000), com o pacote de candidatos
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
    -- o pacote de candidatos (20270519120000): os preços, a verba que a campanha geral deve ter agora e o saldo de
    -- candidatos dos clientes
    'pacotes', coalesce((select jsonb_agg(jsonb_build_object('candidatos', p.candidatos, 'valor', p.valor,
                                                             'ligado', p.ligado) order by p.candidatos)
                           from privado.pacotes_candidatos p), '[]'::jsonb),
    'geral_alvo', privado.geral_valor_alvo(),
    'saldo_clientes', (select coalesce(sum(s.restantes), 0) from privado.saldo_candidatos s
                        where s.restantes > 0 and s.ate > now()),
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
        -- o pacote de candidatos (20270519120000)
        'produto', i.produto, 'alvo', i.alvo, 'verba_dia', i.verba_dia,
        'entregues', case when i.produto = 'candidatos' then privado.pacote_entregues(i.id) end,
        'tipo', (select t.nome from privado.tipos_de_vaga t where t.id = privado.tipo_da_vaga(i.titulo)),
        'totais', (select jsonb_build_object('impressoes', coalesce(sum(d.impressoes), 0),
                                             'cliques', coalesce(sum(d.cliques), 0),
                                             'visitas', coalesce(sum(d.visitas), 0),
                                             'curtidas', coalesce(sum(d.curtidas), 0),
                                             'visitas_quadro', coalesce(sum(d.visitas_quadro), 0),
                                             'curtidas_quadro', coalesce(sum(d.curtidas_quadro), 0))
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

-- os preços, as regras e, agora, o pacote de candidatos e a campanha geral (o resto é o de 20270512120000)
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
  -- os pacotes de candidatos: o preço e se estão à venda
  for l in select * from jsonb_array_elements(coalesce(p_config -> 'pacotes', '[]'::jsonb)) loop
    update privado.pacotes_candidatos
       set valor = (l ->> 'valor')::numeric, ligado = (l ->> 'ligado')::boolean
     where candidatos = (l ->> 'candidatos')::smallint;
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
           motor_raio_max = coalesce((p_config ->> 'motor_raio_max')::smallint, motor_raio_max),
           teto_clique = coalesce((p_config ->> 'teto_clique')::numeric, teto_clique),
           pacote_ligado = coalesce((p_config ->> 'pacote_ligado')::boolean, pacote_ligado),
           pacote_dias = coalesce((p_config ->> 'pacote_dias')::smallint, pacote_dias),
           pacote_verba_dia = coalesce((p_config ->> 'pacote_verba_dia')::numeric, pacote_verba_dia),
           geral_ligada = coalesce((p_config ->> 'geral_ligada')::boolean, geral_ligada),
           geral_conta = case when p_config ? 'geral_conta'
                              then nullif(regexp_replace(p_config ->> 'geral_conta', '\D', '', 'g'), '')
                              else geral_conta end,
           geral_campanha_id = case when p_config ? 'geral_campanha_id'
                                    then nullif(regexp_replace(p_config ->> 'geral_campanha_id', '\D', '', 'g'), '')
                                    else geral_campanha_id end,
           geral_base = coalesce((p_config ->> 'geral_base')::numeric, geral_base),
           geral_maximo = coalesce((p_config ->> 'geral_maximo')::numeric, geral_maximo)
     where id;
    -- a base, o máximo ou a campanha mudaram: o robô acerta o orçamento na volta seguinte
    update privado.config_impulso
       set geral_feita_em = null, geral_erro = null, geral_erro_em = null
     where id and (p_config ? 'geral_base' or p_config ? 'geral_maximo' or p_config ? 'geral_ligada'
                   or p_config ? 'geral_conta' or p_config ? 'geral_campanha_id');
  end if;
  perform privado.registrar('precos_impulso', 'config', 'impulso', 'Preços e regras do impulso',
                            jsonb_build_object('precos', p_precos, 'config', p_config));
end
$$;

-- o presente do Publike no piloto: um pacote de candidatos em cada vaga escolhida (até 50), sem custo para o cliente.
-- Devolve as vagas que entraram e as que não puderam (com o motivo).
create or replace function public.admin_dar_pacotes(p_anuncios uuid[], p_candidatos integer, p_dias integer,
                                                    p_avisar boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
  v_motivo text;
  v_dias integer;
  v_feitas integer := 0;
  v_fora jsonb := '[]'::jsonb;
  v_id uuid;
begin
  perform privado.exigir_impulsos_admin();
  if p_candidatos is null or p_candidatos < 1 or p_candidatos > 100 then
    return jsonb_build_object('erro', 'O pacote vai de 1 a 100 candidatos.');
  end if;
  v_dias := coalesce(p_dias, (select c.pacote_dias from privado.config_impulso c where c.id), 30);
  if v_dias < 1 or v_dias > 60 then
    return jsonb_build_object('erro', 'O pacote fica no ar de 1 a 60 dias.');
  end if;
  if coalesce(array_length(p_anuncios, 1), 0) = 0 or array_length(p_anuncios, 1) > 50 then
    return jsonb_build_object('erro', 'Escolha de 1 a 50 vagas.');
  end if;
  for a in select x.* from public.anuncios x where x.id = any (p_anuncios) order by x.criado_em loop
    perform pg_advisory_xact_lock(hashtext('impulso:' || a.autor_id));
    v_motivo := privado.impulso_motivo_vaga(a.autor_id, a.id);
    if v_motivo is not null then
      v_fora := v_fora || jsonb_build_array(jsonb_build_object('id', a.id, 'titulo', a.titulo, 'motivo', v_motivo));
      continue;
    end if;
    v_id := privado.pacote_comecar(a.autor_id, a.id, a.titulo, 'admin', p_candidatos, 0, null, v_dias, false);
    v_feitas := v_feitas + 1;
    perform privado.registrar('impulsionar', 'anuncio', a.id::text, left(a.titulo, 120),
                              jsonb_build_object('pacote', p_candidatos, 'dias', v_dias, 'avisar', p_avisar));
    if p_avisar then
      perform privado.avisar_pagamento(a.autor_id,
        'Presente do Publike: a vaga "' || left(a.titulo, 80) || '" entrou no destaque "Vagas impulsionadas na região", '
        || 'no alto das páginas de vagas, até chegarem ' || p_candidatos
        || case when p_candidatos = 1 then ' candidato' else ' candidatos' end
        || ', por até ' || v_dias || ' dias, sem custo para você. Acompanhe cada um por aqui.',
        '/painel/impulsionar/' || a.id);
    end if;
  end loop;
  return jsonb_build_object('ok', v_feitas > 0, 'feitas', v_feitas, 'fora', v_fora,
                            'erro', case when v_feitas = 0 then 'Nenhuma das vagas pôde entrar.' end);
end
$$;

-- o Parar do Admin (o de 20270425120000): o pacote de candidatos termina na hora, sem aviso
create or replace function public.admin_parar_impulso(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
begin
  perform privado.exigir_impulsos_admin();
  select * into i from privado.impulsos where id = p_id for update;
  if i.id is null or i.situacao not in ('pago', 'em_revisao', 'no_ar') then
    return jsonb_build_object('erro', 'Este impulso já terminou.');
  end if;
  perform privado.registrar('parar_impulso', 'anuncio', i.anuncio_id::text, left(i.titulo, 120),
                            jsonb_build_object('situacao', i.situacao, 'origem', i.origem, 'produto', i.produto));
  if i.produto = 'candidatos' then
    perform privado.pacote_terminar(i.id, 'Parado pelo admin.', false);
    return jsonb_build_object('ok', true);
  end if;
  if i.situacao = 'no_ar' then
    update privado.impulsos set pausar = true, motivo = 'Parado pelo admin.' where id = p_id;
    return jsonb_build_object('ok', true);
  end if;
  return privado.impulso_devolver(p_id, 'Parado pelo admin.');
end
$$;

-- ------------------------------------------------------------------ as permissões

revoke execute on function privado.pacote_entregues(uuid), privado.saldo_de_candidatos(uuid),
  privado.pacote_comecar(uuid, uuid, text, text, integer, numeric, uuid, integer, boolean),
  privado.pacote_terminar(uuid, text, boolean), privado.cuidar_dos_pacotes(), privado.geral_valor_alvo(),
  privado.impulso_da_compra(uuid), privado.impulso_estornado(uuid) from public, anon, authenticated;

revoke execute on function public.contar_visita_do_impulso(text, uuid, text, text), public.vagas_impulsionadas()
  from public;
grant execute on function public.contar_visita_do_impulso(text, uuid, text, text), public.vagas_impulsionadas()
  to anon, authenticated;

revoke execute on function public.contar_curtida_do_impulso(text, uuid), public.parar_pacote(uuid),
  public.usar_saldo_de_candidatos(uuid, integer) from public, anon;
grant execute on function public.contar_curtida_do_impulso(text, uuid), public.parar_pacote(uuid),
  public.usar_saldo_de_candidatos(uuid, integer) to authenticated;

-- como as outras do servidor: a chave do servidor (p_chave) é quem protege
revoke execute on function public.servidor_compra_pacote(text, uuid, uuid, integer, text, boolean),
  public.servidor_geral_do_dia(text), public.servidor_geral_feita(text, numeric, text) from public;
grant execute on function public.servidor_compra_pacote(text, uuid, uuid, integer, text, boolean),
  public.servidor_geral_do_dia(text), public.servidor_geral_feita(text, numeric, text)
  to anon, authenticated, service_role;

revoke execute on function public.admin_dar_pacotes(uuid[], integer, integer, boolean) from public, anon;
grant execute on function public.admin_dar_pacotes(uuid[], integer, integer, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
