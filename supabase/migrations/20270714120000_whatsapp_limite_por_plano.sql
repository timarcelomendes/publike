-- O limite de avisos pelo WhatsApp por mês de quem contrata (17/11/2026, Marcelo: "preciso limitar o uso de mensagens
-- via api whatsapp para empresas e agencias, uma quantidade no gratis e mais no pago e atualizar páginas e admin").
-- As escolhas dele: conta só o que a empresa ou a agência recebe, e são 30 por mês no grátis e 300 nos planos.
-- Pode rodar de novo.
--
--   * privado.config_whatsapp ganha limite_mes_gratis (30) e limite_mes_plano (300), que mudam em Admin › WhatsApp ›
--     Parâmetros. Valem para as contas de quem contrata (comércio, empresa e agência). O plano é o que libera tudo
--     (assinatura, 30 dias pagos ou a cortesia do Plano Agência), como na API e nos contatos no convite.
--   * O mês começa no dia 1º, no horário de Brasília. Contam as mensagens que saíram para a conta no mês (a que a
--     Meta recusou não conta). O candidato fica fora: os avisos dele seguem as regras de antes.
--   * O robô (servidor_whatsapp_pegar) segura o aviso de quem chegou no limite ("limite do mês do grátis" ou "do
--     plano"); ele continua no sino e no e-mail. Na primeira vez no mês, o sino avisa a conta (o aviso de pagamento,
--     com o link dos planos no grátis).
--   * whatsapp_da_conta devolve o uso do mês (Preferências), e limites_do_whatsapp, os números para as páginas sem
--     conta (Planos e Para empresas).
--   * O Admin: admin_whatsapp com os dois números e o uso do mês de quem contrata; admin_salvar_whatsapp recebe os dois.

-- 1. Os números ---------------------------------------------------------------------------------------------------------

alter table privado.config_whatsapp add column if not exists limite_mes_gratis integer not null default 30;
alter table privado.config_whatsapp add column if not exists limite_mes_plano integer not null default 300;
alter table privado.config_whatsapp drop constraint if exists config_whatsapp_limite_por_plano_check;
alter table privado.config_whatsapp add constraint config_whatsapp_limite_por_plano_check check (
  limite_mes_gratis between 0 and 100000 and limite_mes_plano between 0 and 100000);

-- o aviso no sino quando a conta chega no limite: uma vez por mês e por limite (o grátis e, depois de assinar, o do plano)
create table if not exists privado.whatsapp_limite_avisado (
  conta_id uuid not null references public.perfis (id) on delete cascade,
  mes date not null,
  limite integer not null,
  avisado_em timestamptz not null default now(),
  primary key (conta_id, mes, limite)
);
alter table privado.whatsapp_limite_avisado enable row level security;
revoke all on privado.whatsapp_limite_avisado from public, anon, authenticated;

-- 2. O plano, o mês e o uso ---------------------------------------------------------------------------------------------

-- os planos que liberam tudo (assinatura ativa ou 30 dias pagos) e a cortesia do Plano Agência: o limite maior
create or replace function privado.whatsapp_com_plano(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.assinaturas a
                  where a.conta_id = p_conta and a.situacao = 'ativa' and privado.libera_tudo(a.recurso))
      or exists (select 1 from privado.cobrancas c
                  where c.conta_id = p_conta and c.situacao = 'paga' and privado.libera_tudo(c.recurso)
                    and c.periodo_ate + case when c.compra_id is null then interval '3 days' else interval '0' end > now())
      or exists (select 1 from privado.plano_agencia_cortesia x
                  where x.conta_id = p_conta and (x.ate is null or x.ate > now()))
$$;

-- o dia 1º deste mês, à meia-noite de Brasília (o mesmo começo do limite do mês do Admin)
create or replace function privado.whatsapp_inicio_do_mes()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
$$;

-- as mensagens que saíram para a conta neste mês (e a que está saindo agora); a que a Meta recusou não conta
create or replace function privado.whatsapp_usadas_no_mes(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from privado.fila_whatsapp f
   where f.conta_id = p_conta
     and ((f.enviada_em >= privado.whatsapp_inicio_do_mes() and f.situacao <> 'falhou') or f.situacao = 'enviando')
$$;

-- "1.500"
create or replace function privado.whatsapp_numero(p integer)
returns text
language sql
stable
set search_path = ''
as $$
  select replace(to_char(coalesce(p, 0), 'FM999,999,990'), ',', '.')
$$;

-- o sino da conta que chegou no limite do mês: uma vez por mês e por limite
create or replace function privado.avisar_limite_do_whatsapp(p_conta uuid, p_plano boolean, p_limite integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_do_plano integer := (select c.limite_mes_plano from privado.config_whatsapp c where c.id);
begin
  insert into privado.whatsapp_limite_avisado (conta_id, mes, limite) values (p_conta, v_mes, p_limite)
  on conflict do nothing;
  if not found then
    return;
  end if;
  insert into public.notificacoes (destinatario_id, tipo, texto, link)
  values (p_conta, 'pagamento',
          left(case
                 when p_plano then
                   'Você usou os ' || privado.whatsapp_numero(p_limite)
                   || ' avisos pelo WhatsApp do mês no seu plano. Até o dia 1º, os próximos chegam pelo sino e pelo e-mail.'
                 when p_limite = 0 then
                   'No grátis, os avisos pelo WhatsApp estão parados: eles chegam pelo sino e pelo e-mail. Com um plano, são até '
                   || privado.whatsapp_numero(v_do_plano) || ' por mês.'
                 else
                   'Você usou os ' || privado.whatsapp_numero(p_limite)
                   || ' avisos pelo WhatsApp do mês no grátis. Até o dia 1º, os próximos chegam pelo sino e pelo e-mail. Com um plano, são até '
                   || privado.whatsapp_numero(v_do_plano) || ' por mês.'
               end, 300),
          case when p_plano then '/perfil/preferencias#notificacoes' else '/painel/planos' end);
end
$$;

revoke execute on function privado.whatsapp_com_plano(uuid), privado.whatsapp_inicio_do_mes(),
  privado.whatsapp_usadas_no_mes(uuid), privado.whatsapp_numero(integer),
  privado.avisar_limite_do_whatsapp(uuid, boolean, integer)
  from public, anon, authenticated;

-- 3. O robô: o limite do mês de quem contrata ---------------------------------------------------------------------------
-- O mesmo de 20270711120000, com o limite do mês antes do limite do dia da conta (o do mês, quando vale, é o motivo).

create or replace function public.servidor_whatsapp_pegar(p_chave text, p_limite integer default 30)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
  v_hora integer := extract(hour from now() at time zone 'America/Sao_Paulo');
  v_saidas integer;
  v_folga integer;
  v_teste text[];
  v_limite_conta integer;
  v_pessoa boolean;
  v_plano boolean;
  v_limite_mes integer;
  r record;
  v_itens jsonb := '[]'::jsonb;
  v_n integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_whatsapp where id;
  if not found or not cfg.ativo then
    return jsonb_build_object('ativo', false, 'itens', '[]'::jsonb);
  end if;

  -- o que ficou "enviando" (o robô caiu no meio): não manda de novo, para não repetir
  update privado.fila_whatsapp f set situacao = 'falhou', motivo = 'sem confirmação do envio'
   where f.situacao = 'enviando' and f.enviando_em < now() - interval '15 minutes';
  -- o aviso que esperou demais já não serve (um dia, se o Admin não mudou)
  update privado.fila_whatsapp f
     set situacao = 'descartada',
         motivo = case when cfg.validade_horas = 24 then 'venceu (mais de um dia na fila)'
                       else format('venceu (mais de %s horas na fila)', cfg.validade_horas) end
   where f.situacao = 'pendente' and f.criado_em < now() - make_interval(hours => cfg.validade_horas);
  -- a fila guarda 90 dias (os números do Admin usam 30); a resposta automática, 2 dias
  delete from privado.fila_whatsapp f where f.criado_em < now() - interval '90 days';
  delete from privado.whatsapp_respostas_auto ra where ra.em < now() - interval '2 days';

  -- só no horário do Admin (das 8h às 21h, se ninguém mudou; hora de Goiânia)
  if v_hora < cfg.hora_inicio or v_hora >= cfg.hora_fim then
    return jsonb_build_object('ativo', true, 'fora_do_horario', true, 'itens', '[]'::jsonb);
  end if;

  select count(*) into v_saidas from privado.fila_whatsapp f
   where f.enviada_em > now() - interval '24 hours';
  v_folga := greatest(cfg.limite_dia - v_saidas, 0);
  if v_folga = 0 then
    return jsonb_build_object('ativo', true, 'limite_do_dia', true, 'itens', '[]'::jsonb);
  end if;
  -- o limite do mês (o teto do gasto): conta do dia 1 deste mês, no horário de Goiânia
  select count(*) into v_saidas from privado.fila_whatsapp f
   where f.enviada_em >= privado.whatsapp_inicio_do_mes();
  v_folga := least(v_folga, greatest(cfg.limite_mes - v_saidas, 0));
  if v_folga = 0 then
    return jsonb_build_object('ativo', true, 'limite_do_mes', true, 'itens', '[]'::jsonb);
  end if;
  select coalesce(array_agg(privado.chave_do_numero(n)), '{}') into v_teste from unnest(cfg.numeros_teste) n;

  -- o mais importante primeiro (quando a conta chega no limite do dia, o que fica de fora é o de menos)
  for r in
    select f.*
      from privado.fila_whatsapp f
     where f.situacao = 'pendente' and f.enviar_depois_de <= now()
     order by case when f.tipo in ('entrevista_lembrete', 'entrevista', 'match') then 1
                   when f.tipo in ('lembrete_curtida', 'dispensada', 'mensagem') then 3
                   else 2 end,
              f.enviar_depois_de
     limit least(greatest(coalesce(p_limite, 30), 1), 100)
     for update skip locked
  loop
    -- o modo de teste: só os números da lista
    if not cfg.para_todos and not (privado.chave_do_numero(r.numero) = any (v_teste)) then
      update privado.fila_whatsapp set situacao = 'descartada', motivo = 'modo de teste' where id = r.id;
      continue;
    end if;
    -- parou depois de entrar na fila
    if privado.numero_do_whatsapp(r.conta_id) is null then
      update privado.fila_whatsapp set situacao = 'descartada', motivo = 'parou de receber' where id = r.id;
      continue;
    end if;
    -- desligou este aviso depois de ele entrar na fila
    if exists (select 1 from privado.whatsapp_permissoes w where w.conta_id = r.conta_id and r.tipo = any (w.tipos_desligados)) then
      update privado.fila_whatsapp set situacao = 'descartada', motivo = 'desligou este aviso' where id = r.id;
      continue;
    end if;
    -- já viu no Publike (ou o aviso foi trocado por outro): não precisa do WhatsApp
    if r.tipo = 'curtida' then
      if not exists (select 1 from public.notificacoes n
                      where n.destinatario_id = r.conta_id and n.tipo = 'curtida' and n.anuncio_id = r.anuncio_id
                        and not n.lida and n.criado_em >= r.criado_em - interval '1 minute') then
        update privado.fila_whatsapp set situacao = 'descartada', motivo = 'já viu no Publike' where id = r.id;
        continue;
      end if;
    elsif r.notificacao_id is not null
          and not exists (select 1 from public.notificacoes n where n.id = r.notificacao_id and not n.lida) then
      update privado.fila_whatsapp set situacao = 'descartada', motivo = 'já viu no Publike' where id = r.id;
      continue;
    end if;
    v_pessoa := exists (select 1 from public.perfis p where p.id = r.conta_id and p.tipo = 'pessoa');
    -- quem contrata: o limite do mês, o do grátis ou o do plano (30 e 300, se o Admin não mudou)
    if not v_pessoa then
      v_plano := privado.whatsapp_com_plano(r.conta_id);
      v_limite_mes := case when v_plano then cfg.limite_mes_plano else cfg.limite_mes_gratis end;
      if privado.whatsapp_usadas_no_mes(r.conta_id) >= v_limite_mes then
        update privado.fila_whatsapp
           set situacao = 'descartada',
               motivo = case when v_plano then 'limite do mês do plano' else 'limite do mês do grátis' end
         where id = r.id;
        perform privado.avisar_limite_do_whatsapp(r.conta_id, v_plano, v_limite_mes);
        continue;
      end if;
    end if;
    -- até N por conta por dia (quem contrata tem o próprio limite, maior: os candidatos de várias vagas)
    v_limite_conta := case when v_pessoa then cfg.por_conta_dia else cfg.por_conta_dia_empresa end;
    if (select count(*) from privado.fila_whatsapp f
         where f.conta_id = r.conta_id
           and (f.enviada_em > now() - interval '24 hours' or f.situacao = 'enviando')) >= v_limite_conta then
      update privado.fila_whatsapp set situacao = 'descartada', motivo = 'limite do dia da conta' where id = r.id;
      continue;
    end if;
    exit when v_n >= v_folga;

    update privado.fila_whatsapp
       set situacao = 'enviando', enviando_em = now(), tentativas = tentativas + 1
     where id = r.id;
    v_n := v_n + 1;
    v_itens := v_itens || jsonb_build_object(
      'id', r.id,
      'tipo', r.tipo,
      'conta_id', r.conta_id,
      'numero', r.numero,
      'quantos', r.quantos,
      'anuncio_id', r.anuncio_id,
      'ator_id', r.ator_id,
      'tentativas', r.tentativas + 1,
      'aviso', (select jsonb_build_object('tipo', n.tipo, 'link', n.link, 'recado_id', n.recado_id, 'texto', n.texto)
                  from public.notificacoes n where n.id = r.notificacao_id),
      'dados', (
        select jsonb_build_object(
          'nome', privado.nome_para_email(r.conta_id),
          'conta_tipo', pc.tipo,
          'vaga', a.titulo,
          'anuncio_tipo', a.tipo,
          'empresa', case when a.id is null then null
                          when a.contratante_confidencial then 'A empresa'
                          else coalesce(nullif(btrim(a.contratante), ''), pa.nome, 'A empresa') end,
          'ator', privado.nome_da_conquista(pt.nome),
          'esperando', case when r.tipo = 'lembrete_curtida' then
                         (select count(*) from public.curtidas c
                           where c.anuncio_id = r.anuncio_id and c.status = 'pendente' and c.aceita_em is null) end,
          'entrevista', case when r.tipo in ('entrevista', 'entrevista_lembrete') then
                          (select jsonb_build_object('quando', e.quando, 'formato', e.formato, 'local', e.local,
                                                     'situacao', e.situacao)
                             from public.entrevistas e
                            where e.anuncio_id = r.anuncio_id and e.perfil_id = r.conta_id
                            order by e.atualizado_em desc limit 1) end)
          from public.perfis pc
          left join public.anuncios a on a.id = r.anuncio_id
          left join public.perfis pa on pa.id = a.autor_id
          left join public.perfis pt on pt.id = r.ator_id
         where pc.id = r.conta_id));
  end loop;
  return jsonb_build_object('ativo', true, 'itens', v_itens);
end
$$;

-- 4. Preferências: o uso do mês de quem contrata -------------------------------------------------------------------------

create or replace function public.whatsapp_da_conta()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  r privado.whatsapp_permissoes;
  cfg privado.config_whatsapp;
  v_tipo text;
  v_plano boolean;
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  select * into r from privado.whatsapp_permissoes w where w.conta_id = conta;
  select * into cfg from privado.config_whatsapp c where c.id;
  v_tipo := (select p.tipo from public.perfis p where p.id = conta);
  v_plano := v_tipo is distinct from 'pessoa' and privado.whatsapp_com_plano(conta);
  return jsonb_build_object(
    'aceito', r.conta_id is not null and r.cancelado_em is null,
    'numero', coalesce((select c.whatsapp from public.contatos c where c.perfil_id = conta), r.numero),
    'pode', (select public.papel_na_conta()) in ('dono', 'admin'),
    'ligado', coalesce(cfg.ativo and cfg.para_todos, false),
    -- a escolha da conta e o que dá para escolher (os avisos que o Publike manda hoje, pelo Admin)
    'desligados', to_jsonb(coalesce(r.tipos_desligados, '{}'::text[])),
    'do_publike_desligados', to_jsonb(coalesce(cfg.tipos_desligados, '{}'::text[])),
    'tipo_conta', v_tipo,
    'tem_servicos', exists (select 1 from public.anuncios a where a.autor_id = conta and a.tipo = 'servico'),
    -- quem contrata: quantos avisos saíram neste mês e o limite (o do grátis ou o do plano)
    'uso', case when v_tipo is distinct from 'pessoa' and cfg.id is not null then jsonb_build_object(
             'usadas', privado.whatsapp_usadas_no_mes(conta),
             'limite', case when v_plano then cfg.limite_mes_plano else cfg.limite_mes_gratis end,
             'plano', v_plano,
             'limite_plano', cfg.limite_mes_plano) end);
end
$$;

-- 5. As páginas sem conta: os números do grátis e do plano --------------------------------------------------------------

create or replace function public.limites_do_whatsapp()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ligado', c.ativo and c.para_todos, 'limite_gratis', c.limite_mes_gratis,
                            'limite_plano', c.limite_mes_plano)
    from privado.config_whatsapp c
   where c.id
$$;
revoke execute on function public.limites_do_whatsapp() from public;
grant execute on function public.limites_do_whatsapp() to anon, authenticated, service_role;

-- 6. O Admin: salvar os dois números -------------------------------------------------------------------------------------

drop function if exists public.admin_salvar_whatsapp(boolean, boolean, text[], integer, integer, integer, text[],
  integer, integer, integer, integer, integer, integer, integer, integer);
create or replace function public.admin_salvar_whatsapp(
  p_ativo boolean, p_para_todos boolean, p_numeros_teste text[], p_limite_dia integer, p_limite_mes integer,
  p_por_conta_dia integer, p_tipos_desligados text[],
  p_por_conta_dia_empresa integer default null, p_hora_inicio integer default null, p_hora_fim integer default null,
  p_juntar_minutos integer default null, p_intervalo_vaga_horas integer default null,
  p_mensagem_minutos integer default null, p_intervalo_conversa_horas integer default null,
  p_validade_horas integer default null,
  p_limite_mes_gratis integer default null, p_limite_mes_plano integer default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_numeros text[];
  v_inicio integer;
  v_fim integer;
  v_gratis integer;
  v_plano integer;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct d), '{}') into v_numeros
    from (select regexp_replace(n, '\D', '', 'g') as d from unnest(coalesce(p_numeros_teste, '{}')) n) x
   where d ~ '^55[1-9][0-9][0-9]{8,9}$';
  if cardinality(v_numeros) > 50 then
    raise exception 'No máximo 50 números de teste.' using errcode = '22023';
  end if;
  select least(greatest(coalesce(p_hora_inicio, c.hora_inicio), 0), 23),
         least(greatest(coalesce(p_hora_fim, c.hora_fim), 1), 24),
         least(greatest(coalesce(p_limite_mes_gratis, c.limite_mes_gratis), 0), 100000),
         least(greatest(coalesce(p_limite_mes_plano, c.limite_mes_plano), 0), 100000)
    into v_inicio, v_fim, v_gratis, v_plano
    from privado.config_whatsapp c where c.id;
  if v_inicio >= v_fim then
    raise exception 'O horário de envio precisa começar antes de terminar.' using errcode = '22023';
  end if;
  if v_plano < v_gratis then
    raise exception 'O limite do mês com plano não pode ser menor que o do grátis.' using errcode = '22023';
  end if;
  update privado.config_whatsapp
     set ativo = coalesce(p_ativo, ativo),
         para_todos = coalesce(p_para_todos, para_todos),
         numeros_teste = v_numeros,
         limite_dia = least(greatest(coalesce(p_limite_dia, limite_dia), 0), 100000),
         limite_mes = least(greatest(coalesce(p_limite_mes, limite_mes), 0), 1000000),
         por_conta_dia = least(greatest(coalesce(p_por_conta_dia, por_conta_dia), 1), 20),
         tipos_desligados = coalesce(p_tipos_desligados, tipos_desligados),
         por_conta_dia_empresa = least(greatest(coalesce(p_por_conta_dia_empresa, por_conta_dia_empresa), 1), 40),
         hora_inicio = v_inicio,
         hora_fim = v_fim,
         juntar_minutos = least(greatest(coalesce(p_juntar_minutos, juntar_minutos), 0), 120),
         intervalo_vaga_horas = least(greatest(coalesce(p_intervalo_vaga_horas, intervalo_vaga_horas), 0), 48),
         mensagem_minutos = least(greatest(coalesce(p_mensagem_minutos, mensagem_minutos), 1), 240),
         intervalo_conversa_horas = least(greatest(coalesce(p_intervalo_conversa_horas, intervalo_conversa_horas), 0), 72),
         validade_horas = least(greatest(coalesce(p_validade_horas, validade_horas), 1), 72),
         limite_mes_gratis = v_gratis,
         limite_mes_plano = v_plano,
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where id;
end
$$;
revoke execute on function public.admin_salvar_whatsapp(boolean, boolean, text[], integer, integer, integer, text[],
  integer, integer, integer, integer, integer, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.admin_salvar_whatsapp(boolean, boolean, text[], integer, integer, integer, text[],
  integer, integer, integer, integer, integer, integer, integer, integer, integer, integer) to authenticated, service_role;

-- 7. O Admin: a configuração com os dois números e o uso do mês de quem contrata -----------------------------------------

create or replace function public.admin_whatsapp()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
  v_inicio timestamptz := privado.whatsapp_inicio_do_mes();
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  select * into cfg from privado.config_whatsapp where id;
  return jsonb_build_object(
    'config', jsonb_build_object(
      'ativo', cfg.ativo, 'para_todos', cfg.para_todos, 'numeros_teste', to_jsonb(cfg.numeros_teste),
      'limite_dia', cfg.limite_dia, 'limite_mes', cfg.limite_mes, 'por_conta_dia', cfg.por_conta_dia, 'tipos_desligados', to_jsonb(cfg.tipos_desligados),
      'modelos', cfg.modelos, 'modelos_conferidos_em', cfg.modelos_conferidos_em, 'atualizado_em', cfg.atualizado_em,
      'hora_inicio', cfg.hora_inicio, 'hora_fim', cfg.hora_fim, 'por_conta_dia_empresa', cfg.por_conta_dia_empresa,
      'juntar_minutos', cfg.juntar_minutos, 'intervalo_vaga_horas', cfg.intervalo_vaga_horas,
      'mensagem_minutos', cfg.mensagem_minutos, 'intervalo_conversa_horas', cfg.intervalo_conversa_horas,
      'validade_horas', cfg.validade_horas,
      'limite_mes_gratis', cfg.limite_mes_gratis, 'limite_mes_plano', cfg.limite_mes_plano),
    'aceites', (select jsonb_build_object(
                  'pessoas', count(*) filter (where p.tipo = 'pessoa'),
                  'empresas', count(*) filter (where p.tipo <> 'pessoa'),
                  'pararam_7_dias', (select count(*) from privado.whatsapp_permissoes w2
                                      where w2.cancelado_por = 'whatsapp' and w2.cancelado_em > now() - interval '7 days'))
                  from privado.whatsapp_permissoes w join public.perfis p on p.id = w.conta_id
                 where w.cancelado_em is null),
    'pendentes', (select count(*) from privado.fila_whatsapp f where f.situacao in ('pendente', 'enviando')),
    'semana', (select jsonb_build_object(
                 'entraram', count(*),
                 'enviadas', count(*) filter (where f.enviada_em is not null),
                 'entregues', count(*) filter (where f.entregue_em is not null),
                 'lidas', count(*) filter (where f.lida_em is not null),
                 'respondidas', count(*) filter (where f.resposta is not null),
                 'falharam', count(*) filter (where f.situacao = 'falhou'),
                 'descartadas', count(*) filter (where f.situacao = 'descartada'),
                 'cobradas', count(*) filter (where f.cobrada))
                 from privado.fila_whatsapp f where f.criado_em > now() - interval '7 days'),
    'por_tipo', coalesce((select jsonb_agg(jsonb_build_object('tipo', x.tipo, 'enviadas', x.enviadas, 'lidas', x.lidas,
                                                             'respondidas', x.respondidas) order by x.enviadas desc)
                            from (select f.tipo,
                                         count(*) filter (where f.enviada_em is not null) as enviadas,
                                         count(*) filter (where f.lida_em is not null) as lidas,
                                         count(*) filter (where f.resposta is not null) as respondidas
                                    from privado.fila_whatsapp f where f.criado_em > now() - interval '30 days'
                                   group by f.tipo) x), '[]'::jsonb),
    'motivos', coalesce((select jsonb_agg(jsonb_build_object('situacao', x.situacao, 'motivo', x.motivo, 'quantas', x.n)
                                          order by x.n desc)
                           from (select f.situacao, f.motivo, count(*) as n from privado.fila_whatsapp f
                                  where f.criado_em > now() - interval '7 days' and f.situacao in ('falhou', 'descartada')
                                  group by f.situacao, f.motivo order by count(*) desc limit 12) x), '[]'::jsonb),
    'respostas', coalesce((select jsonb_agg(jsonb_build_object('tipo', x.tipo, 'resposta', x.resposta, 'quantas', x.n)
                                            order by x.tipo, x.n desc)
                             from (select f.tipo, f.resposta, count(*) as n from privado.fila_whatsapp f
                                    where f.respondida_em > now() - interval '30 days'
                                    group by f.tipo, f.resposta) x), '[]'::jsonb),
    'cobradas_30_dias', (select count(*) from privado.fila_whatsapp f
                          where f.cobrada and f.enviada_em > now() - interval '30 days'),
    'enviadas_no_mes', (select count(*) from privado.fila_whatsapp f where f.enviada_em >= v_inicio),
    -- a estimativa de cada aviso: quantos o Publike gerou em 30 dias (para quem já aceitou e para todos)
    'estimativa', coalesce((select jsonb_object_agg(x.tipo, jsonb_build_object('todos', x.todos, 'aceitaram', x.aceitaram))
                              from (select n.tipo, count(*) as todos,
                                           count(*) filter (where w.conta_id is not null
                                                              and not (n.tipo = any (w.tipos_desligados))) as aceitaram
                                      from public.notificacoes n
                                      left join privado.whatsapp_permissoes w
                                        on w.conta_id = n.destinatario_id and w.cancelado_em is null
                                     where n.criado_em > now() - interval '30 days'
                                       and n.tipo in ('match', 'entrevista', 'entrevista_lembrete', 'te_respondeu',
                                                      'conquista_pergunta', 'dispensada', 'curtida', 'lembrete_curtida',
                                                      'ainda_espera', 'conquista_confirmar', 'interesse_local', 'mensagem')
                                     group by n.tipo) x), '{}'::jsonb),
    -- quantas pessoas com o WhatsApp ligado desligaram cada aviso (Preferências)
    'desligados_por_tipo', coalesce((select jsonb_object_agg(x.tipo, x.n)
                                       from (select t.tipo, count(*) as n
                                               from privado.whatsapp_permissoes w
                                               cross join lateral unnest(w.tipos_desligados) as t(tipo)
                                              where w.cancelado_em is null
                                              group by t.tipo) x), '{}'::jsonb),
    -- quem contrata neste mês (desde o dia 1º): os avisos que saíram, o limite e os que o limite segurou.
    -- `contas` e `no_limite` contam todas; a lista traz as 30 que mais receberam.
    'quem_contrata_no_mes', (
      with uso as (
        select f.conta_id,
               count(*) filter (where f.enviada_em >= v_inicio and f.situacao <> 'falhou') as usadas,
               count(*) filter (where f.criado_em >= v_inicio and f.situacao = 'descartada'
                                  and f.motivo in ('limite do mês do grátis', 'limite do mês do plano')) as seguradas
          from privado.fila_whatsapp f
          join public.perfis p on p.id = f.conta_id and p.tipo <> 'pessoa'
         where f.criado_em >= v_inicio - interval '3 days'
         group by f.conta_id
      ),
      contas as (
        select u.conta_id, p.nome, p.tipo, u.usadas, u.seguradas, x.plano,
               case when x.plano then cfg.limite_mes_plano else cfg.limite_mes_gratis end as limite
          from uso u
          join public.perfis p on p.id = u.conta_id
          cross join lateral (select privado.whatsapp_com_plano(u.conta_id) as plano) x
         where u.usadas > 0 or u.seguradas > 0
      )
      select jsonb_build_object(
               'contas', (select count(*) from contas),
               'no_limite', (select count(*) from contas c where c.usadas >= c.limite or c.seguradas > 0),
               'lista', coalesce((select jsonb_agg(to_jsonb(y) order by y.usadas desc, y.seguradas desc, y.nome)
                                    from (select * from contas c order by c.usadas desc, c.seguradas desc, c.nome
                                           limit 30) y), '[]'::jsonb))));
end
$$;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270714120000_whatsapp_limite_por_plano');
