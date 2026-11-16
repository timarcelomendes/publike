-- A configuração de envios do WhatsApp (15/11/2026, Marcelo: "Mas se tudo sair pelo WhatsApp fica caro" e "Crie uma
-- configuração de envios no admin"; claude/plano-whatsapp-oficial.md).
--   * o teto do mês (limite_mes): o envio para quando chega no número de mensagens do mês (o gasto tem teto);
--   * começa econômico: 50 por dia, 1.500 por mês (cerca de US$ 10) e sem os avisos de menos retorno (o retorno de
--     quem não seguiu, a mensagem nova no chat e "esperando resposta"), se o Admin ainda não salvou nada;
--   * admin_whatsapp traz quantos de cada aviso o Publike gerou em 30 dias (de quem aceitou e de todos), para estimar
--     o custo de ligar cada um, e as enviadas no mês.
-- Pode rodar de novo.

alter table privado.config_whatsapp add column if not exists limite_mes integer not null default 1500;
alter table privado.config_whatsapp drop constraint if exists config_whatsapp_limite_mes_check;
alter table privado.config_whatsapp add constraint config_whatsapp_limite_mes_check check (limite_mes between 0 and 1000000);

update privado.config_whatsapp
   set limite_dia = 50, limite_mes = 1500, tipos_desligados = array['dispensada', 'mensagem', 'lembrete_curtida']
 where id and atualizado_por is null and not ativo;

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
  -- o aviso que esperou mais de um dia já não serve
  update privado.fila_whatsapp f set situacao = 'descartada', motivo = 'venceu (mais de um dia na fila)'
   where f.situacao = 'pendente' and f.criado_em < now() - interval '24 hours';
  -- a fila guarda 90 dias (os números do Admin usam 30); a resposta automática, 2 dias
  delete from privado.fila_whatsapp f where f.criado_em < now() - interval '90 days';
  delete from privado.whatsapp_respostas_auto ra where ra.em < now() - interval '2 days';

  -- só das 8h às 21h (Goiânia)
  if v_hora < 8 or v_hora >= 21 then
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
    -- até N por conta por dia (quem contrata, o dobro: os candidatos de várias vagas)
    v_limite_conta := cfg.por_conta_dia
                      * (case when exists (select 1 from public.perfis p where p.id = r.conta_id and p.tipo = 'pessoa')
                              then 1 else 2 end);
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

drop function if exists public.admin_salvar_whatsapp(boolean, boolean, text[], integer, integer, text[]);
create or replace function public.admin_salvar_whatsapp(
  p_ativo boolean, p_para_todos boolean, p_numeros_teste text[], p_limite_dia integer, p_limite_mes integer,
  p_por_conta_dia integer, p_tipos_desligados text[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_numeros text[];
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
  update privado.config_whatsapp
     set ativo = coalesce(p_ativo, ativo),
         para_todos = coalesce(p_para_todos, para_todos),
         numeros_teste = v_numeros,
         limite_dia = least(greatest(coalesce(p_limite_dia, limite_dia), 0), 100000),
         limite_mes = least(greatest(coalesce(p_limite_mes, limite_mes), 0), 1000000),
         por_conta_dia = least(greatest(coalesce(p_por_conta_dia, por_conta_dia), 1), 20),
         tipos_desligados = coalesce(p_tipos_desligados, tipos_desligados),
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where id;
end
$$;
revoke execute on function public.admin_salvar_whatsapp(boolean, boolean, text[], integer, integer, integer, text[])
  from public, anon;
grant execute on function public.admin_salvar_whatsapp(boolean, boolean, text[], integer, integer, integer, text[])
  to authenticated, service_role;

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
      'modelos', cfg.modelos, 'modelos_conferidos_em', cfg.modelos_conferidos_em, 'atualizado_em', cfg.atualizado_em),
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

notify pgrst, 'reload schema';
