-- WhatsApp: cada pessoa escolhe os avisos (17/11/2026, Marcelo: "acho interessante no habilitar whatsapp, mostrar
-- flag do que ele quer receber notificacao, nas preferencias e isso pode reduzir custo").
--
-- 1. privado.whatsapp_permissoes.tipos_desligados: os avisos que a conta não quer pelo WhatsApp (sem nada: todos os que o
--    Publike manda; quem já tinha ligado continua recebendo tudo). Desligar e ligar o WhatsApp de novo guarda a escolha.
-- 2. O gatilho não põe na fila o aviso desligado, e o robô descarta o que já estava na fila ("desligou este aviso").
-- 3. whatsapp_da_conta devolve a escolha, o tipo da conta, se ela tem serviço e os avisos que o Publike manda hoje;
--    mudar_whatsapp_avisos guarda a escolha (só quem administra a conta, com o WhatsApp ligado).
-- 4. admin_whatsapp: a estimativa de custo desconta os avisos desligados e diz quantos desligaram cada um.
-- 5. O aceite também ao criar o perfil e ao publicar a vaga (Marcelo: "outro ponto é perguntar ao criar a vaga e ao
--    criar o perfil e quando curtir uma vaga"): as origens 'cadastro' e 'publicar' (o curtir já pergunta).
-- Pode rodar de novo.

alter table privado.whatsapp_permissoes add column if not exists tipos_desligados text[] not null default '{}';
alter table privado.whatsapp_permissoes drop constraint if exists whatsapp_permissoes_tipos_desligados_check;
alter table privado.whatsapp_permissoes add constraint whatsapp_permissoes_tipos_desligados_check
  check (tipos_desligados <@ array['match', 'entrevista', 'entrevista_lembrete', 'te_respondeu', 'conquista_pergunta', 'dispensada', 'curtida', 'lembrete_curtida', 'ainda_espera', 'conquista_confirmar', 'interesse_local', 'mensagem']::text[]);

-- 5. As origens novas do aceite: ao criar o perfil e ao publicar a vaga --------------------------------------------------

alter table privado.whatsapp_permissoes drop constraint if exists whatsapp_permissoes_origem_check;
alter table privado.whatsapp_permissoes add constraint whatsapp_permissoes_origem_check
  check (origem in ('avisos', 'curtir', 'quadro', 'cadastro', 'publicar'));

create or replace function public.mudar_whatsapp(p_aceito boolean, p_origem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v_numero text;
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta escolhe os avisos.' using errcode = '42501';
  end if;
  if coalesce(p_origem, '') not in ('avisos', 'curtir', 'quadro', 'cadastro', 'publicar') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  if not coalesce(p_aceito, false) then
    update privado.whatsapp_permissoes set cancelado_em = now() where conta_id = conta and cancelado_em is null;
    return;
  end if;
  select c.whatsapp into v_numero from public.contatos c where c.perfil_id = conta;
  if v_numero is null then
    raise exception 'Ponha o seu WhatsApp no perfil primeiro.' using errcode = 'P0001', hint = 'sem_numero';
  end if;
  insert into privado.whatsapp_permissoes (conta_id, numero, origem, aceito_em, cancelado_em)
  values (conta, v_numero, p_origem, now(), null)
  on conflict (conta_id) do update
    set numero = excluded.numero, origem = excluded.origem, aceito_em = now(), cancelado_em = null;
end
$$;

-- 1. O gatilho: o aviso que a pessoa desligou não entra na fila ---------------------------------------------------------

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
  -- a pessoa escolheu não receber este aviso pelo WhatsApp (Preferências)
  if exists (select 1 from privado.whatsapp_permissoes w
              where w.conta_id = new.destinatario_id and new.tipo = any (w.tipos_desligados)) then
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

-- 2. O robô: o que a pessoa desligou depois de entrar na fila não sai --------------------------------------------------

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

-- 3. A tela de Preferências: a escolha e os avisos que dá para escolher -------------------------------------------------

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
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  select * into r from privado.whatsapp_permissoes w where w.conta_id = conta;
  select * into cfg from privado.config_whatsapp c where c.id;
  return jsonb_build_object(
    'aceito', r.conta_id is not null and r.cancelado_em is null,
    'numero', coalesce((select c.whatsapp from public.contatos c where c.perfil_id = conta), r.numero),
    'pode', (select public.papel_na_conta()) in ('dono', 'admin'),
    'ligado', coalesce(cfg.ativo and cfg.para_todos, false),
    -- a escolha da conta e o que dá para escolher (os avisos que o Publike manda hoje, pelo Admin)
    'desligados', to_jsonb(coalesce(r.tipos_desligados, '{}'::text[])),
    'do_publike_desligados', to_jsonb(coalesce(cfg.tipos_desligados, '{}'::text[])),
    'tipo_conta', (select p.tipo from public.perfis p where p.id = conta),
    'tem_servicos', exists (select 1 from public.anuncios a where a.autor_id = conta and a.tipo = 'servico'));
end
$$;

create or replace function public.mudar_whatsapp_avisos(p_desligados text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta escolhe os avisos.' using errcode = '42501';
  end if;
  update privado.whatsapp_permissoes w
     set tipos_desligados = coalesce((select array_agg(distinct t order by t) from unnest(coalesce(p_desligados, '{}')) t
                                       where t = any (array['match', 'entrevista', 'entrevista_lembrete', 'te_respondeu', 'conquista_pergunta', 'dispensada', 'curtida', 'lembrete_curtida', 'ainda_espera', 'conquista_confirmar', 'interesse_local', 'mensagem']::text[])), '{}')
   where w.conta_id = conta and w.cancelado_em is null;
  if not found then
    raise exception 'Ligue o WhatsApp primeiro.' using errcode = 'P0001', hint = 'sem_whatsapp';
  end if;
end
$$;
revoke execute on function public.mudar_whatsapp_avisos(text[]) from public, anon;
grant execute on function public.mudar_whatsapp_avisos(text[]) to authenticated;

-- 4. O Admin: a estimativa desconta o que cada pessoa desligou -----------------------------------------------------------

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
                                              group by t.tipo) x), '{}'::jsonb));
end
$$;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270711120000_whatsapp_avisos_escolhidos');
