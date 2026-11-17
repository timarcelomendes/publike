-- Admin › WhatsApp em abas (17/11/2026, Marcelo: "melhore a visão dos resultados, na tela, coloque em abas e exibir os
-- erros, se houver" e "e os parâmetros para mudar também").
--
-- 1. Os parâmetros que eram fixos no código passam para a configuração, com os mesmos valores de antes (nada muda até
--    o Admin mudar): o horário de envio (das 8h às 21h), o limite por dia de quem contrata (o dobro do da pessoa: 8),
--    quanto a candidatura nova espera para juntar (5 minutos) e o intervalo por vaga (3 horas), o mesmo da mensagem do
--    chat (10 minutos e 6 horas por conversa) e quanto o aviso pode esperar na fila (24 horas).
-- 2. admin_salvar_whatsapp recebe os parâmetros novos (os de antes continuam iguais; os novos podem faltar).
-- 3. admin_whatsapp_resultados: os resultados de um período (hoje, 7 ou 30 dias) e os erros.
-- Pode rodar de novo.

alter table privado.config_whatsapp add column if not exists hora_inicio integer not null default 8;
alter table privado.config_whatsapp add column if not exists hora_fim integer not null default 21;
alter table privado.config_whatsapp add column if not exists por_conta_dia_empresa integer not null default 8;
alter table privado.config_whatsapp add column if not exists juntar_minutos integer not null default 5;
alter table privado.config_whatsapp add column if not exists intervalo_vaga_horas integer not null default 3;
alter table privado.config_whatsapp add column if not exists mensagem_minutos integer not null default 10;
alter table privado.config_whatsapp add column if not exists intervalo_conversa_horas integer not null default 6;
alter table privado.config_whatsapp add column if not exists validade_horas integer not null default 24;
alter table privado.config_whatsapp drop constraint if exists config_whatsapp_parametros_check;
alter table privado.config_whatsapp add constraint config_whatsapp_parametros_check check (
  hora_inicio between 0 and 23 and hora_fim between 1 and 24 and hora_inicio < hora_fim
  and por_conta_dia_empresa between 1 and 40
  and juntar_minutos between 0 and 120 and intervalo_vaga_horas between 0 and 48
  and mensagem_minutos between 1 and 240 and intervalo_conversa_horas between 0 and 72
  and validade_horas between 1 and 72);

-- 1. O gatilho que põe o aviso na fila: os tempos de juntar vêm da configuração ------------------------------------

create or replace function privado.notificacao_para_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
  v_numero text;
  v_tipo_anuncio text;
  v_depois timestamptz := now();
  v_ultima timestamptz;
  v_id bigint;
begin
  select * into cfg from privado.config_whatsapp where id;
  if not found or not cfg.ativo or new.tipo = any (cfg.tipos_desligados) then
    return new;
  end if;
  v_numero := privado.numero_do_whatsapp(new.destinatario_id);
  if v_numero is null then
    return new;
  end if;
  if privado.aviso_desligado(new.destinatario_id, new.tipo, 'whatsapp') then
    return new;
  end if;
  if exists (select 1 from public.perfis p where p.id = new.destinatario_id and p.suspenso_ate > now()) then
    return new;
  end if;
  if new.anuncio_id is not null then
    select a.tipo into v_tipo_anuncio from public.anuncios a where a.id = new.anuncio_id;
  end if;

  if new.tipo = 'curtida' then
    if v_tipo_anuncio is null or v_tipo_anuncio not in ('vaga', 'servico') then
      return new;
    end if;
    -- candidato novo na mesma vaga: junta na linha que ainda não saiu
    update privado.fila_whatsapp f set quantos = f.quantos + 1
     where f.conta_id = new.destinatario_id and f.tipo = 'curtida' and f.anuncio_id = new.anuncio_id
       and f.situacao = 'pendente'
    returning f.id into v_id;
    if v_id is not null then
      return new;
    end if;
    -- espera uns minutos para juntar e, depois de um aviso desta vaga, umas horas (Admin › WhatsApp › Parâmetros)
    select max(f.enviada_em) into v_ultima from privado.fila_whatsapp f
     where f.conta_id = new.destinatario_id and f.tipo = 'curtida' and f.anuncio_id = new.anuncio_id
       and f.enviada_em > now() - make_interval(hours => cfg.intervalo_vaga_horas);
    v_depois := greatest(now() + make_interval(mins => cfg.juntar_minutos),
                         coalesce(v_ultima + make_interval(hours => cfg.intervalo_vaga_horas), now()));
  elsif new.tipo = 'mensagem' then
    -- uma por conversa: espera uns minutos (se a pessoa vir no Publike, não sai) e, depois de um aviso, umas horas
    if exists (select 1 from privado.fila_whatsapp f
                where f.conta_id = new.destinatario_id and f.tipo = 'mensagem' and f.ator_id = new.ator_id
                  and f.situacao = 'pendente') then
      return new;
    end if;
    select max(f.enviada_em) into v_ultima from privado.fila_whatsapp f
     where f.conta_id = new.destinatario_id and f.tipo = 'mensagem' and f.ator_id = new.ator_id
       and f.enviada_em > now() - make_interval(hours => cfg.intervalo_conversa_horas);
    v_depois := greatest(now() + make_interval(mins => cfg.mensagem_minutos),
                         coalesce(v_ultima + make_interval(hours => cfg.intervalo_conversa_horas), now()));
  else
    -- as vagas: o resto só de vaga (o serviço fica no sino e no e-mail)
    if new.tipo in ('match', 'entrevista', 'entrevista_lembrete', 'dispensada', 'lembrete_curtida', 'ainda_espera',
                    'te_respondeu', 'conquista_pergunta', 'conquista_confirmar')
       and v_tipo_anuncio is distinct from 'vaga' then
      return new;
    end if;
    -- o mesmo aviso ainda na fila: não repete
    if exists (select 1 from privado.fila_whatsapp f
                where f.conta_id = new.destinatario_id and f.tipo = new.tipo
                  and f.anuncio_id is not distinct from new.anuncio_id and f.ator_id is not distinct from new.ator_id
                  and f.situacao = 'pendente') then
      return new;
    end if;
  end if;

  insert into privado.fila_whatsapp (notificacao_id, conta_id, numero, tipo, anuncio_id, ator_id, enviar_depois_de)
  values (new.id, new.destinatario_id, v_numero, new.tipo, new.anuncio_id, new.ator_id, v_depois);
  return new;
exception
  when others then
    raise warning 'Publike: notificação % não entrou na fila do WhatsApp (%).', new.id, sqlerrm;
    return new;
end
$$;

-- O robô que manda: o horário, a validade e o limite de quem contrata vêm da configuração ------------------------

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
   where f.enviada_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
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
    -- até N por conta por dia (quem contrata tem o próprio limite, maior: os candidatos de várias vagas)
    v_limite_conta := case when exists (select 1 from public.perfis p where p.id = r.conta_id and p.tipo = 'pessoa')
                           then cfg.por_conta_dia else cfg.por_conta_dia_empresa end;
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

-- 2. Salvar: os parâmetros novos (podem faltar: ficam como estão) -----------------------------------------------------

drop function if exists public.admin_salvar_whatsapp(boolean, boolean, text[], integer, integer, integer, text[]);
create or replace function public.admin_salvar_whatsapp(
  p_ativo boolean, p_para_todos boolean, p_numeros_teste text[], p_limite_dia integer, p_limite_mes integer,
  p_por_conta_dia integer, p_tipos_desligados text[],
  p_por_conta_dia_empresa integer default null, p_hora_inicio integer default null, p_hora_fim integer default null,
  p_juntar_minutos integer default null, p_intervalo_vaga_horas integer default null,
  p_mensagem_minutos integer default null, p_intervalo_conversa_horas integer default null,
  p_validade_horas integer default null
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
         least(greatest(coalesce(p_hora_fim, c.hora_fim), 1), 24)
    into v_inicio, v_fim
    from privado.config_whatsapp c where c.id;
  if v_inicio >= v_fim then
    raise exception 'O horário de envio precisa começar antes de terminar.' using errcode = '22023';
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
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where id;
end
$$;
revoke execute on function public.admin_salvar_whatsapp(boolean, boolean, text[], integer, integer, integer, text[],
  integer, integer, integer, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.admin_salvar_whatsapp(boolean, boolean, text[], integer, integer, integer, text[],
  integer, integer, integer, integer, integer, integer, integer, integer) to authenticated, service_role;

-- A tela: a configuração com os parâmetros novos ---------------------------------------------------------------------

create or replace function public.admin_whatsapp()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
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
      'validade_horas', cfg.validade_horas),
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
    'enviadas_no_mes', (select count(*) from privado.fila_whatsapp f
                         where f.enviada_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo')
                                                at time zone 'America/Sao_Paulo')),
    -- a estimativa de cada aviso: quantos o Publike gerou em 30 dias (para quem já aceitou e para todos)
    'estimativa', coalesce((select jsonb_object_agg(x.tipo, jsonb_build_object('todos', x.todos, 'aceitaram', x.aceitaram))
                              from (select n.tipo, count(*) as todos,
                                           count(*) filter (where w.conta_id is not null) as aceitaram
                                      from public.notificacoes n
                                      left join privado.whatsapp_permissoes w
                                        on w.conta_id = n.destinatario_id and w.cancelado_em is null
                                     where n.criado_em > now() - interval '30 days'
                                       and n.tipo in ('match', 'entrevista', 'entrevista_lembrete', 'te_respondeu',
                                                      'conquista_pergunta', 'dispensada', 'curtida', 'lembrete_curtida',
                                                      'ainda_espera', 'conquista_confirmar', 'interesse_local', 'mensagem')
                                     group by n.tipo) x), '{}'::jsonb));
end
$$;

-- 3. Os resultados de um período e os erros ----------------------------------------------------------------------------
-- O que aconteceu num período (hoje, 7 ou 30 dias): o caminho de cada aviso (entrou na fila, saiu, foi entregue, lido e
-- respondido), cada tipo de aviso, os dias e as últimas mensagens. E os erros:
--   * o que falhou: a Meta recusou o envio ou não entregou (o motivo vem dela, com o código);
--   * o que está parado na fila por um problema agora (o modelo não aprovado, a Meta recusou o envio...);
--   * o que saiu há mais de uma hora sem a Meta dizer se entregou (o webhook pode não estar chegando).
-- Sem o número de ninguém: as últimas mensagens mostram o nome da conta.

create or replace function public.admin_whatsapp_resultados(p_dias integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dias integer := least(greatest(coalesce(p_dias, 7), 0), 90);
  -- dias do calendário de Brasília: 0 ou 1 é hoje, desde a meia-noite; 7 é hoje e os 6 dias antes
  v_desde timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
                         - make_interval(days => greatest(v_dias - 1, 0));
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'desde', v_desde,
    'funil', (select jsonb_build_object(
                'entraram', count(*),
                'enviadas', count(*) filter (where f.enviada_em is not null),
                'entregues', count(*) filter (where f.entregue_em is not null),
                'lidas', count(*) filter (where f.lida_em is not null),
                'respondidas', count(*) filter (where f.resposta is not null),
                'falharam', count(*) filter (where f.situacao = 'falhou'),
                'descartadas', count(*) filter (where f.situacao = 'descartada'),
                'esperando', count(*) filter (where f.situacao in ('pendente', 'enviando')),
                'cobradas', count(*) filter (where f.cobrada))
                from privado.fila_whatsapp f where f.criado_em >= v_desde),
    'na_fila', (select count(*) from privado.fila_whatsapp f where f.situacao in ('pendente', 'enviando')),
    -- as que saíram nas últimas 24 horas (o limite do dia do Admin conta assim)
    'enviadas_24h', (select count(*) from privado.fila_whatsapp f where f.enviada_em > now() - interval '24 hours'),
    'por_tipo', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.entraram desc, x.tipo)
        from (select f.tipo,
                     count(*) as entraram,
                     count(*) filter (where f.enviada_em is not null) as enviadas,
                     count(*) filter (where f.entregue_em is not null) as entregues,
                     count(*) filter (where f.lida_em is not null) as lidas,
                     count(*) filter (where f.resposta is not null) as respondidas,
                     count(*) filter (where f.situacao = 'falhou') as falharam,
                     count(*) filter (where f.situacao = 'descartada') as descartadas
                from privado.fila_whatsapp f
               where f.criado_em >= v_desde
               group by f.tipo) x), '[]'::jsonb),
    'por_dia', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.dia)
        from (select to_char(f.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia,
                     count(*) as entraram,
                     count(*) filter (where f.enviada_em is not null) as enviadas,
                     count(*) filter (where f.lida_em is not null) as lidas,
                     count(*) filter (where f.situacao = 'falhou') as falharam
                from privado.fila_whatsapp f
               where f.criado_em >= v_desde
               group by 1) x), '[]'::jsonb),
    -- os erros do período: o que falhou, por motivo (a Meta recusou o envio ou não entregou)
    'falhas', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.quantas desc, x.ultima desc)
        from (select coalesce(f.motivo, 'sem motivo') as motivo,
                     count(*) as quantas,
                     max(coalesce(f.enviada_em, f.criado_em)) as ultima,
                     array_agg(distinct f.tipo) as tipos
                from privado.fila_whatsapp f
               where f.situacao = 'falhou' and f.criado_em >= v_desde
               group by 1
               order by count(*) desc
               limit 20) x), '[]'::jsonb),
    -- parado agora na fila por um problema (de qualquer dia: ainda não saiu)
    'parados', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.quantas desc)
        from (select f.motivo, count(*) as quantas, min(f.criado_em) as desde
                from privado.fila_whatsapp f
               where f.situacao in ('pendente', 'enviando') and f.motivo is not null
               group by 1
               order by count(*) desc
               limit 20) x), '[]'::jsonb),
    -- saiu há mais de uma hora e a Meta não disse se entregou (o webhook pode não estar chegando)
    'sem_entrega', (select count(*) from privado.fila_whatsapp f
                     where f.situacao = 'enviada' and f.enviada_em < now() - interval '1 hour'
                       and f.criado_em >= v_desde),
    -- por que não saíram (as regras: já viu no Publike, o limite, o modo de teste, venceu...)
    'descartes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.quantas desc)
        from (select coalesce(f.motivo, 'sem motivo') as motivo, count(*) as quantas
                from privado.fila_whatsapp f
               where f.situacao = 'descartada' and f.criado_em >= v_desde
               group by 1
               order by count(*) desc
               limit 12) x), '[]'::jsonb),
    'respostas', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.tipo, x.quantas desc)
        from (select f.tipo, f.resposta, count(*) as quantas
                from privado.fila_whatsapp f
               where f.respondida_em >= v_desde and f.resposta is not null
               group by 1, 2) x), '[]'::jsonb),
    -- as últimas do período, com o nome da conta (nunca o número)
    'ultimas', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.criado_em desc)
        from (select f.id, f.criado_em, f.tipo, f.modelo, f.situacao, f.motivo, f.resposta, f.quantos,
                     f.enviar_depois_de, f.enviada_em, f.entregue_em, f.lida_em, f.respondida_em, f.conta_id,
                     p.nome as conta, p.tipo as conta_tipo
                from privado.fila_whatsapp f
                left join public.perfis p on p.id = f.conta_id
               where f.criado_em >= v_desde
               order by f.criado_em desc
               limit 50) x), '[]'::jsonb)
  );
end
$$;
revoke execute on function public.admin_whatsapp_resultados(integer) from public, anon;
grant execute on function public.admin_whatsapp_resultados(integer) to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270710120000_whatsapp_resultados_e_parametros');
