-- O atendimento pelo WhatsApp (18/11/2026, claude/plano-whatsapp-atendimento.md). Pedido do Marcelo: "Quero
-- automatizar o atendimento do WhatsApp, explicar aos interessados sobre o Publike", com a foto de uma pessoa que veio
-- do anúncio do Instagram ("Olá! Posso ter mais informações sobre isso?"). As escolhas dele: no número da API, para
-- candidatos e empresas, e avisar a equipe quando a IA não souber ou a pessoa pedir alguém.
--
--   * privado.config_whatsapp: atendimento_ligado (desligado: tudo como antes, a explicação uma vez por dia) e
--     atendimento_por_dia (quantas respostas da IA cada número recebe por dia; depois, passa para a equipe).
--   * privado.whatsapp_conversas e privado.whatsapp_conversa_mensagens: a conversa de cada número (a chave é a do
--     número sem o nono dígito), com quem fala (pessoa, IA ou equipe), o anúncio de onde veio e a janela grátis.
--     As mensagens ficam 180 dias.
--   * servidor_whatsapp_recebida: com o atendimento ligado, a mensagem que não é PARAR nem botão de aviso volta como
--     "conversa" (sem texto); o site chama servidor_whatsapp_conversa_entrada, a IA responde e o site grava a resposta
--     com servidor_whatsapp_conversa_saida.
--   * Admin › WhatsApp › Conversas: admin_whatsapp_conversas, admin_whatsapp_conversa, admin_whatsapp_conversa_situacao,
--     admin_whatsapp_conversa_numero, admin_whatsapp_conversa_registrar e admin_salvar_atendimento_whatsapp.
--   * O e-mail 'aviso_whatsapp_conversa' para os "Avisos para a equipe", no máximo um a cada 6 horas por conversa.
-- Pode rodar de novo.

-- 1. A configuração --------------------------------------------------------------------------------------------------

alter table privado.config_whatsapp add column if not exists atendimento_ligado boolean not null default false;
alter table privado.config_whatsapp add column if not exists atendimento_por_dia integer not null default 30;
alter table privado.config_whatsapp drop constraint if exists config_whatsapp_atendimento_por_dia_check;
alter table privado.config_whatsapp add constraint config_whatsapp_atendimento_por_dia_check
  check (atendimento_por_dia between 1 and 200);

-- 2. As conversas ----------------------------------------------------------------------------------------------------

create table if not exists privado.whatsapp_conversas (
  chave text primary key,
  numero text not null,
  -- o nome do perfil do WhatsApp (o que a pessoa pôs no app; pode ser apelido)
  nome text,
  -- o que a pessoa quer: procura trabalho ou quer contratar (null: ainda não disse)
  perfil text check (perfil is null or perfil in ('trabalho', 'contratar')),
  -- quem responde: a IA ou a equipe (a IA fica quieta)
  situacao text not null default 'robo' check (situacao in ('robo', 'equipe')),
  equipe_desde timestamptz,
  equipe_avisada_em timestamptz,
  -- o anúncio de onde veio (o "referral" da Meta: título, link do post, tipo) e quando
  origem jsonb,
  origem_em timestamptz,
  -- a janela grátis do anúncio de clique para o WhatsApp (até 7 dias depois da primeira resposta, desde 28/09/2026)
  gratis_ate timestamptz,
  ultima_da_pessoa_em timestamptz,
  ultima_em timestamptz not null default now(),
  -- a equipe abriu a conversa no admin
  vista_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists whatsapp_conversas_ultima_idx on privado.whatsapp_conversas (ultima_em desc);

create table if not exists privado.whatsapp_conversa_mensagens (
  id bigint generated always as identity primary key,
  chave text not null references privado.whatsapp_conversas (chave) on delete cascade,
  de text not null check (de in ('pessoa', 'robo', 'equipe')),
  texto text not null,
  wamid text,
  criado_em timestamptz not null default now()
);
create index if not exists whatsapp_conversa_mensagens_chave_idx
  on privado.whatsapp_conversa_mensagens (chave, criado_em desc);
create index if not exists whatsapp_conversa_mensagens_criado_idx on privado.whatsapp_conversa_mensagens (criado_em);

alter table privado.whatsapp_conversas enable row level security;
alter table privado.whatsapp_conversa_mensagens enable row level security;
revoke all on privado.whatsapp_conversas, privado.whatsapp_conversa_mensagens from public, anon, authenticated;

-- 3. O e-mail para a equipe ------------------------------------------------------------------------------------------

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('aviso_whatsapp_conversa', 'equipe', 62, 'Conversa do WhatsApp para a equipe',
     'Aviso para a equipe quando o atendimento do WhatsApp passa a conversa para uma pessoa: a pessoa pediu, a IA '
       || 'não soube responder ou o número passou das respostas do dia. No máximo um a cada 6 horas por conversa.',
     array['quem', 'motivo', 'mensagem'],
     'WhatsApp: {{quem}} precisa de alguém da equipe',
     E'{{quem}} está conversando com o Publike pelo WhatsApp e precisa de alguém da equipe ({{motivo}}).\n\n'
       || E'A última mensagem:\n\n{{mensagem}}\n\nResponda em Admin › WhatsApp › Conversas. A IA fica quieta nesta '
       || 'conversa até a equipe devolver, ou por 24 horas sem resposta da equipe.',
     null::text)
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- 4. A mensagem que chegou: com o atendimento ligado, vira conversa --------------------------------------------------
-- (a mesma função de 20270619120000; só o fim muda)

create or replace function public.servidor_whatsapp_recebida(
  p_chave text, p_wamid text, p_numero text, p_texto text default null, p_payload text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chave text := privado.chave_do_numero(p_numero);
  -- sem pontuação e sem acento ("Parar.", "NÃO QUERO")
  v_texto text := lower(btrim(translate(regexp_replace(coalesce(p_texto, ''), '[[:punct:]]', '', 'g'),
                                        'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ', 'aaaaeeiooouucAAAAEEIOOOUUC')));
  v_partes text[];
  f privado.fila_whatsapp;
  v_resposta text;
  v_volta text;
  v_n integer;
begin
  perform privado.exigir_servidor(p_chave);
  if coalesce(p_wamid, '') = '' or v_chave = '' then
    return null;
  end if;
  -- o webhook repetido (a Meta tenta de novo) não faz nada duas vezes
  insert into privado.whatsapp_recebidas (wamid) values (left(p_wamid, 200)) on conflict do nothing;
  if not found then
    return null;
  end if;
  delete from privado.whatsapp_recebidas r where r.criado_em < now() - interval '7 days';

  -- PARAR (o botão ou a palavra): para de mandar para este número, em todas as contas dele
  if upper(coalesce(p_payload, '')) = 'PARAR'
     or v_texto in ('parar', 'pare', 'parar de receber', 'sair', 'stop', 'cancelar', 'descadastrar', 'nao quero',
                    'nao quero receber', 'remover', 'chega') then
    update privado.whatsapp_permissoes w
       set cancelado_em = now(), cancelado_por = 'whatsapp'
     where w.cancelado_em is null
       and (privado.chave_do_numero(w.numero) = v_chave
            or exists (select 1 from public.contatos c
                        where c.perfil_id = w.conta_id and privado.chave_do_numero(c.whatsapp) = v_chave));
    get diagnostics v_n = row_count;
    return jsonb_build_object('acao', 'parar', 'contas', v_n, 'texto',
      'Pronto, você não vai mais receber os avisos do Publike pelo WhatsApp. Para voltar, marque em Preferências: '
      || 'https://publike.org/perfil/preferencias');
  end if;

  -- um botão de pergunta: "r:<id>:sim", "c:<id>:comecei", "e:<id>:sim"
  if coalesce(p_payload, '') ~ '^[rce]:[0-9]{1,18}:[a-z_]{2,20}$' then
    v_partes := string_to_array(p_payload, ':');
    v_resposta := v_partes[3];
    select * into f from privado.fila_whatsapp x where x.id = v_partes[2]::bigint;
    if not found or privado.chave_do_numero(f.numero) <> v_chave then
      return jsonb_build_object('acao', 'desconhecida', 'texto',
        'Não achamos essa pergunta. Responda pelo Publike: https://publike.org');
    end if;
    begin
      if v_partes[1] = 'r' and f.tipo = 'te_respondeu' and v_resposta in ('sim', 'ainda_nao', 'desisti') then
        perform privado.responder_se_respondeu_por(f.conta_id, f.anuncio_id, v_resposta);
        v_volta := case v_resposta
          when 'sim' then 'Que bom! Obrigado por contar. Isso ajuda quem procura trabalho a saber quem responde.'
          when 'ainda_nao' then 'Obrigado por contar. Avisamos a empresa que você ainda espera. Enquanto isso, veja vagas '
                                || 'parecidas perto de você: https://publike.org/anuncio/' || f.anuncio_id || '/parecidas'
          else 'Tudo bem, obrigado por contar. Tem vaga nova todo dia no Publike: https://publike.org' end;
      elsif v_partes[1] = 'c' and f.tipo = 'conquista_pergunta' and v_resposta in ('comecei', 'ainda_nao', 'nao_deu') then
        perform privado.responder_conquista_por(f.conta_id, f.anuncio_id, v_resposta);
        v_volta := case v_resposta
          when 'comecei' then 'Parabéns pelo trabalho novo! Obrigado por contar.'
          when 'ainda_nao' then 'Obrigado por contar. Perguntamos de novo daqui a uma semana.'
          else 'Que pena. Obrigado por contar. Tem vaga nova todo dia no Publike: https://publike.org' end;
      elsif v_partes[1] = 'e' and f.tipo = 'conquista_confirmar' and v_resposta in ('sim', 'nao') then
        perform privado.confirmar_conquista_por(f.conta_id, f.anuncio_id, f.ator_id, v_resposta = 'sim');
        v_volta := case v_resposta
          when 'sim' then 'Obrigado por confirmar! A pessoa foi para Contratado no quadro da vaga.'
          else 'Obrigado por avisar.' end;
      else
        return jsonb_build_object('acao', 'desconhecida', 'texto',
          'Não entendemos a resposta. Responda pelo Publike: https://publike.org');
      end if;
    exception
      when sqlstate 'P0002' or sqlstate '42501' or sqlstate '22023' then
        return jsonb_build_object('acao', 'velha', 'texto',
          'Essa pergunta já foi respondida ou a vaga saiu do ar. Obrigado!');
    end;
    update privado.fila_whatsapp x set resposta = v_resposta, respondida_em = now() where x.id = f.id;
    return jsonb_build_object('acao', 'resposta', 'tipo', f.tipo, 'resposta', v_resposta, 'texto', v_volta);
  end if;

  -- o atendimento ligado: a conversa (o site chama servidor_whatsapp_conversa_entrada e a IA responde)
  if coalesce((select c.atendimento_ligado from privado.config_whatsapp c where c.id), false) then
    return jsonb_build_object('acao', 'conversa');
  end if;

  -- qualquer outra mensagem: explica que o número só manda avisos (no máximo uma vez por dia)
  if exists (select 1 from privado.whatsapp_respostas_auto r where r.chave = v_chave and r.em > now() - interval '24 hours') then
    return jsonb_build_object('acao', 'ignorada');
  end if;
  insert into privado.whatsapp_respostas_auto (chave, em) values (v_chave, now())
  on conflict (chave) do update set em = now();
  return jsonb_build_object('acao', 'automatica', 'texto',
    'Oi! Este número só manda os avisos do Publike e não lê as mensagens. Para falar com uma empresa ou com um '
    || 'candidato, use o Publike: https://publike.org. Para não receber mais os avisos, responda PARAR.');
end
$$;

-- 5. A entrada e a saída da conversa (o site) ------------------------------------------------------------------------

-- A conta do Publike com este número, se tiver (para a IA e a equipe saberem quem é)
create or replace function privado.conta_do_numero_whatsapp(p_chave text)
returns table (id uuid, nome text, tipo text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nome, p.tipo
    from public.contatos c
    join public.perfis p on p.id = c.perfil_id
   where privado.chave_do_numero(c.whatsapp) = p_chave
   order by p.criado_em desc
   limit 1
$$;
revoke all on function privado.conta_do_numero_whatsapp(text) from public;

create or replace function public.servidor_whatsapp_conversa_entrada(
  p_chave text, p_numero text, p_texto text, p_nome text default null, p_origem jsonb default null,
  p_payload text default null, p_wamid text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chave text := privado.chave_do_numero(p_numero);
  v_texto text := left(btrim(coalesce(p_texto, '')), 2000);
  v_nova boolean := false;
  cfg privado.config_whatsapp;
  cv privado.whatsapp_conversas;
  v_hoje integer;
  v_ultima_equipe timestamptz;
  v_conta record;
begin
  perform privado.exigir_servidor(p_chave);
  if v_chave = '' then
    return null;
  end if;
  select * into cfg from privado.config_whatsapp where id;

  insert into privado.whatsapp_conversas (chave, numero, nome)
  values (v_chave, regexp_replace(p_numero, '\D', '', 'g'), nullif(left(btrim(coalesce(p_nome, '')), 80), ''))
  on conflict (chave) do nothing;
  v_nova := found;

  update privado.whatsapp_conversas c
     set numero = regexp_replace(p_numero, '\D', '', 'g'),
         nome = coalesce(nullif(left(btrim(coalesce(p_nome, '')), 80), ''), c.nome),
         origem = case when p_origem is not null then p_origem else c.origem end,
         origem_em = case when p_origem is not null then now() else c.origem_em end,
         -- um anúncio novo abre outra janela grátis (a próxima resposta marca o prazo)
         gratis_ate = case when p_origem is not null then null else c.gratis_ate end,
         -- os botões da primeira resposta: "a:trabalho", "a:contratar" e "a:equipe"
         perfil = case p_payload when 'a:trabalho' then 'trabalho' when 'a:contratar' then 'contratar' else c.perfil end,
         ultima_da_pessoa_em = now(),
         ultima_em = now(),
         vista_em = null
   where c.chave = v_chave
  returning * into cv;

  if v_texto <> '' then
    insert into privado.whatsapp_conversa_mensagens (chave, de, texto, wamid)
    values (v_chave, 'pessoa', v_texto, left(p_wamid, 200));
  end if;
  -- as mensagens velhas saem (180 dias)
  delete from privado.whatsapp_conversa_mensagens m where m.criado_em < now() - interval '180 days';

  -- a equipe pegou a conversa: a IA fica quieta até a equipe devolver, ou por 24 horas sem a equipe responder
  if cv.situacao = 'equipe' then
    select max(m.criado_em) into v_ultima_equipe
      from privado.whatsapp_conversa_mensagens m where m.chave = v_chave and m.de = 'equipe';
    if greatest(coalesce(v_ultima_equipe, cv.equipe_desde), cv.equipe_desde) < now() - interval '24 hours' then
      update privado.whatsapp_conversas c set situacao = 'robo', equipe_desde = null
       where c.chave = v_chave returning * into cv;
    end if;
  end if;

  select count(*) into v_hoje
    from privado.whatsapp_conversa_mensagens m
   where m.chave = v_chave and m.de = 'robo' and m.criado_em > now() - interval '24 hours';

  select * into v_conta from privado.conta_do_numero_whatsapp(v_chave);

  return jsonb_build_object(
    'chave', v_chave,
    'nova', v_nova,
    'nome', cv.nome,
    'perfil', cv.perfil,
    'situacao', cv.situacao,
    'pediu_equipe', coalesce(p_payload = 'a:equipe', false),
    'respostas_hoje', v_hoje,
    'limite', coalesce(cfg.atendimento_por_dia, 30),
    'ligado', coalesce(cfg.atendimento_ligado, false),
    'origem', cv.origem,
    'conta', case when v_conta.id is null then null
                  else jsonb_build_object('nome', v_conta.nome, 'tipo', v_conta.tipo) end,
    -- as últimas 12 mensagens, da mais antiga para a mais nova (a de agora é a última)
    'historico', coalesce((select jsonb_agg(jsonb_build_object('de', x.de, 'texto', x.texto) order by x.criado_em)
                             from (select m.de, m.texto, m.criado_em from privado.whatsapp_conversa_mensagens m
                                    where m.chave = v_chave order by m.criado_em desc, m.id desc limit 12) x),
                          '[]'::jsonb));
end
$$;

create or replace function public.servidor_whatsapp_conversa_saida(
  p_chave text, p_conversa text, p_texto text, p_wamid text default null, p_perfil text default null,
  p_equipe boolean default false, p_motivo text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cv privado.whatsapp_conversas;
  v_ultima text;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cv from privado.whatsapp_conversas c where c.chave = p_conversa;
  if not found then
    return;
  end if;
  if btrim(coalesce(p_texto, '')) <> '' then
    insert into privado.whatsapp_conversa_mensagens (chave, de, texto, wamid)
    values (p_conversa, 'robo', left(btrim(p_texto), 4000), left(p_wamid, 200));
  end if;
  update privado.whatsapp_conversas c
     set perfil = case when p_perfil in ('trabalho', 'contratar') then p_perfil else c.perfil end,
         -- a primeira resposta depois do anúncio abre a janela grátis (até 7 dias)
         gratis_ate = case when c.gratis_ate is null and c.origem_em > now() - interval '24 hours'
                           then now() + interval '7 days' else c.gratis_ate end,
         situacao = case when p_equipe then 'equipe' else c.situacao end,
         equipe_desde = case when p_equipe and c.situacao <> 'equipe' then now() else c.equipe_desde end,
         ultima_em = now()
   where c.chave = p_conversa;

  if p_equipe and (cv.equipe_avisada_em is null or cv.equipe_avisada_em < now() - interval '6 hours') then
    select m.texto into v_ultima from privado.whatsapp_conversa_mensagens m
     where m.chave = p_conversa and m.de = 'pessoa' order by m.criado_em desc, m.id desc limit 1;
    update privado.whatsapp_conversas c set equipe_avisada_em = now() where c.chave = p_conversa;
    perform privado.avisar_equipe('aviso_whatsapp_conversa', jsonb_build_object(
      'quem', coalesce(cv.nome, 'Uma pessoa') || ' (final ' || right(cv.numero, 4) || ')',
      'motivo', coalesce(nullif(btrim(p_motivo), ''), 'a IA passou a conversa'),
      'mensagem', coalesce(v_ultima, '(sem texto)'),
      'caminho', '/admin/whatsapp?aba=conversas&c=' || p_conversa));
  end if;
end
$$;

revoke execute on function public.servidor_whatsapp_conversa_entrada(text, text, text, text, jsonb, text, text),
  public.servidor_whatsapp_conversa_saida(text, text, text, text, text, boolean, text) from public;
grant execute on function public.servidor_whatsapp_conversa_entrada(text, text, text, text, jsonb, text, text),
  public.servidor_whatsapp_conversa_saida(text, text, text, text, text, boolean, text)
  to anon, authenticated, service_role;

-- 6. Admin › WhatsApp › Conversas ------------------------------------------------------------------------------------

create or replace function public.admin_whatsapp_conversas(p_filtro text default 'todas')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'ligado', coalesce((select c.atendimento_ligado from privado.config_whatsapp c where c.id), false),
    'por_dia', coalesce((select c.atendimento_por_dia from privado.config_whatsapp c where c.id), 30),
    'resumo', (select jsonb_build_object(
                 'conversas_7_dias', count(*) filter (where c.criado_em > now() - interval '7 days'),
                 'de_anuncio_7_dias', count(*) filter (where c.criado_em > now() - interval '7 days'
                                                         and c.origem is not null),
                 'com_a_equipe', count(*) filter (where c.situacao = 'equipe'),
                 'trabalho', count(*) filter (where c.perfil = 'trabalho'),
                 'contratar', count(*) filter (where c.perfil = 'contratar'),
                 'respostas_robo_7_dias', (select count(*) from privado.whatsapp_conversa_mensagens m
                                            where m.de = 'robo' and m.criado_em > now() - interval '7 days'),
                 'gratis_agora', count(*) filter (where c.gratis_ate > now()))
                 from privado.whatsapp_conversas c),
    'lista', coalesce((
      select jsonb_agg(x order by x->>'ultima_em' desc)
        from (select jsonb_build_object(
                       'chave', c.chave,
                       'nome', c.nome,
                       'final', right(c.numero, 4),
                       'perfil', c.perfil,
                       'situacao', c.situacao,
                       'origem', c.origem,
                       'gratis_ate', c.gratis_ate,
                       'janela_aberta', c.ultima_da_pessoa_em > now() - interval '24 hours',
                       'ultima_em', c.ultima_em,
                       'nao_vista', c.vista_em is null,
                       'conta', (select jsonb_build_object('id', k.id, 'nome', k.nome, 'tipo', k.tipo)
                                   from privado.conta_do_numero_whatsapp(c.chave) k),
                       'ultima', (select jsonb_build_object('de', m.de, 'texto', left(m.texto, 160))
                                    from privado.whatsapp_conversa_mensagens m
                                   where m.chave = c.chave order by m.criado_em desc, m.id desc limit 1)) as x
                from privado.whatsapp_conversas c
               where case coalesce(p_filtro, 'todas')
                       when 'equipe' then c.situacao = 'equipe'
                       when 'anuncio' then c.origem is not null
                       when 'trabalho' then c.perfil = 'trabalho'
                       when 'contratar' then c.perfil = 'contratar'
                       else true end
               order by c.ultima_em desc
               limit 100) l), '[]'::jsonb));
end
$$;

create or replace function public.admin_whatsapp_conversa(p_conversa text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cv privado.whatsapp_conversas;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  update privado.whatsapp_conversas c set vista_em = now() where c.chave = p_conversa returning * into cv;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'chave', cv.chave,
    'nome', cv.nome,
    'final', right(cv.numero, 4),
    'perfil', cv.perfil,
    'situacao', cv.situacao,
    'equipe_desde', cv.equipe_desde,
    'origem', cv.origem,
    'origem_em', cv.origem_em,
    'gratis_ate', cv.gratis_ate,
    'janela_ate', cv.ultima_da_pessoa_em + interval '24 hours',
    'criado_em', cv.criado_em,
    'conta', (select jsonb_build_object('id', k.id, 'nome', k.nome, 'tipo', k.tipo)
                from privado.conta_do_numero_whatsapp(cv.chave) k),
    'mensagens', coalesce((select jsonb_agg(jsonb_build_object('de', x.de, 'texto', x.texto, 'em', x.criado_em)
                                            order by x.criado_em, x.id)
                             from (select * from privado.whatsapp_conversa_mensagens m
                                    where m.chave = cv.chave order by m.criado_em desc, m.id desc limit 200) x),
                          '[]'::jsonb));
end
$$;

create or replace function public.admin_whatsapp_conversa_situacao(p_conversa text, p_situacao text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  if p_situacao not in ('robo', 'equipe') then
    raise exception 'Situação desconhecida.' using errcode = '22023';
  end if;
  update privado.whatsapp_conversas c
     set situacao = p_situacao,
         equipe_desde = case when p_situacao = 'equipe' then coalesce(c.equipe_desde, now()) end
   where c.chave = p_conversa;
  if not found then
    raise exception 'Não achamos essa conversa.' using errcode = 'P0002';
  end if;
end
$$;

-- O número para a equipe responder (o site manda pela Meta) e se a janela de 24 horas está aberta
create or replace function public.admin_whatsapp_conversa_numero(p_conversa text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cv privado.whatsapp_conversas;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  select * into cv from privado.whatsapp_conversas c where c.chave = p_conversa;
  if not found then
    raise exception 'Não achamos essa conversa.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('numero', cv.numero,
                            'janela_aberta', cv.ultima_da_pessoa_em > now() - interval '24 hours');
end
$$;

-- A resposta da equipe (depois de a Meta aceitar): a IA fica quieta nesta conversa
create or replace function public.admin_whatsapp_conversa_registrar(p_conversa text, p_texto text, p_wamid text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  insert into privado.whatsapp_conversa_mensagens (chave, de, texto, wamid)
  values (p_conversa, 'equipe', left(btrim(p_texto), 4000), left(p_wamid, 200));
  update privado.whatsapp_conversas c
     set situacao = 'equipe', equipe_desde = coalesce(c.equipe_desde, now()), ultima_em = now(), vista_em = now()
   where c.chave = p_conversa;
end
$$;

create or replace function public.admin_salvar_atendimento_whatsapp(p_ligado boolean, p_por_dia integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  if p_por_dia is null or p_por_dia not between 1 and 200 then
    raise exception 'As respostas por dia: use um número de 1 a 200.' using errcode = '22023';
  end if;
  update privado.config_whatsapp c
     set atendimento_ligado = coalesce(p_ligado, false), atendimento_por_dia = p_por_dia,
         atualizado_em = now(), atualizado_por = auth.uid()
   where c.id;
end
$$;

revoke execute on function public.admin_whatsapp_conversas(text), public.admin_whatsapp_conversa(text),
  public.admin_whatsapp_conversa_situacao(text, text), public.admin_whatsapp_conversa_numero(text),
  public.admin_whatsapp_conversa_registrar(text, text, text), public.admin_salvar_atendimento_whatsapp(boolean, integer)
  from public, anon;
grant execute on function public.admin_whatsapp_conversas(text), public.admin_whatsapp_conversa(text),
  public.admin_whatsapp_conversa_situacao(text, text), public.admin_whatsapp_conversa_numero(text),
  public.admin_whatsapp_conversa_registrar(text, text, text), public.admin_salvar_atendimento_whatsapp(boolean, integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270801120000_whatsapp_atendimento');
