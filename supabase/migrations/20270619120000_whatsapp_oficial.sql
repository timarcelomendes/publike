-- O WhatsApp oficial do Publike (15/11/2026, Marcelo: "preciso implementar a api do whatsapp.. pode começar" e "veja
-- como melhor pode usar"; claude/plano-retorno-e-whatsapp.md, parte 3b, e claude/plano-whatsapp-oficial.md).
--
-- O Publike nunca entra na conversa entre empresa e candidato: manda só os avisos que destravam a contratação e as
-- perguntas rápidas, com botões. A resposta do botão volta pelo webhook e entra no Publike sem a pessoa abrir o site.
--
--   * privado.config_whatsapp: liga e desliga, o modo de teste (só os números da lista), os limites e a situação de
--     cada modelo na Meta (conferida sozinha pelo /api/filas);
--   * privado.fila_whatsapp: um gatilho em notificacoes põe na fila os avisos dos tipos que têm modelo, só para quem
--     aceitou (privado.whatsapp_permissoes) e não desligou o grupo; candidato novo junta numa linha por vaga e a
--     mensagem do chat espera 10 minutos (se a pessoa viu no Publike, não sai);
--   * na hora de mandar (servidor_whatsapp_pegar): das 8h às 21h, até N por conta por dia, o limite do dia, e nada do
--     que a pessoa já viu no Publike;
--   * o webhook: a entrega e a leitura (servidor_whatsapp_status), os botões "A empresa te respondeu?", "Deu certo?"
--     e "Começou?" (pelas mesmas regras do site, agora em privado.*_por) e o PARAR (servidor_whatsapp_recebida);
--   * Admin › WhatsApp (admin_whatsapp, admin_salvar_whatsapp).
-- Pode rodar de novo.

-- 0. O número sem o 9 (o WhatsApp devolve alguns números do Brasil sem o nono dígito) ---------------------------------

create or replace function privado.chave_do_numero(p_numero text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when d ~ '^55[1-9][0-9][0-9]{8,9}$' then '55' || substr(d, 3, 2) || right(d, 8) else d end
    from (select regexp_replace(coalesce(p_numero, ''), '\D', '', 'g') as d) x
$$;

-- 1. A configuração --------------------------------------------------------------------------------------------------

create table if not exists privado.config_whatsapp (
  id boolean primary key default true check (id),
  -- liga a fila: desligado, nada entra nem sai
  ativo boolean not null default false,
  -- false: o modo de teste (só os números de numeros_teste recebem; os outros avisos são descartados)
  para_todos boolean not null default false,
  numeros_teste text[] not null default '{}',
  -- o limite da Meta começa em 250 pessoas por dia (antes da verificação da empresa)
  limite_dia integer not null default 200 check (limite_dia between 0 and 100000),
  por_conta_dia integer not null default 4 check (por_conta_dia between 1 and 20),
  -- os tipos de aviso que não saem pelo WhatsApp (o admin desliga um por um)
  tipos_desligados text[] not null default '{}',
  -- a situação de cada modelo na Meta: {"publike_match": {"status": "APPROVED", "categoria": "UTILITY", ...}}
  modelos jsonb not null default '{}'::jsonb,
  modelos_conferidos_em timestamptz,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
insert into privado.config_whatsapp (id) values (true) on conflict (id) do nothing;
alter table privado.config_whatsapp enable row level security;
revoke all on privado.config_whatsapp from public, anon, authenticated;

-- quem parou pelo PARAR do WhatsApp (o site deixa null)
alter table privado.whatsapp_permissoes add column if not exists cancelado_por text;
alter table privado.whatsapp_permissoes drop constraint if exists whatsapp_permissoes_cancelado_por_check;
alter table privado.whatsapp_permissoes add constraint whatsapp_permissoes_cancelado_por_check
  check (cancelado_por is null or cancelado_por in ('site', 'whatsapp'));

-- 2. A fila -----------------------------------------------------------------------------------------------------------

create table if not exists privado.fila_whatsapp (
  id bigint generated always as identity primary key,
  -- sem chave estrangeira: a notificação pode ser apagada (a pergunta nova tira a anterior)
  notificacao_id bigint,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  numero text not null,
  tipo text not null,
  anuncio_id uuid,
  ator_id uuid,
  -- candidatos (ou pedidos) novos juntos na mesma linha
  quantos integer not null default 1,
  situacao text not null default 'pendente'
    check (situacao in ('pendente', 'enviando', 'enviada', 'entregue', 'lida', 'falhou', 'descartada')),
  motivo text,
  modelo text,
  wamid text unique,
  tentativas integer not null default 0,
  enviar_depois_de timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  enviando_em timestamptz,
  enviada_em timestamptz,
  entregue_em timestamptz,
  lida_em timestamptz,
  resposta text,
  respondida_em timestamptz,
  cobrada boolean
);
create index if not exists fila_whatsapp_pendentes_idx on privado.fila_whatsapp (enviar_depois_de)
  where situacao = 'pendente';
create index if not exists fila_whatsapp_conta_idx on privado.fila_whatsapp (conta_id, criado_em desc);
create index if not exists fila_whatsapp_criado_idx on privado.fila_whatsapp (criado_em desc);
alter table privado.fila_whatsapp enable row level security;
revoke all on privado.fila_whatsapp from public, anon, authenticated;

-- as mensagens que chegaram (só o id, para o webhook repetido não responder duas vezes) e a última resposta
-- automática a cada número (no máximo uma por dia)
create table if not exists privado.whatsapp_recebidas (
  wamid text primary key,
  criado_em timestamptz not null default now()
);
create table if not exists privado.whatsapp_respostas_auto (
  chave text primary key,
  em timestamptz not null default now()
);
alter table privado.whatsapp_recebidas enable row level security;
alter table privado.whatsapp_respostas_auto enable row level security;
revoke all on privado.whatsapp_recebidas, privado.whatsapp_respostas_auto from public, anon, authenticated;

-- 3. O gatilho: o aviso que tem modelo entra na fila ------------------------------------------------------------------

create or replace function privado.numero_do_whatsapp(p_conta uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- o aceite valendo; o número é o do perfil hoje (o do aceite, se o perfil ficou sem)
  select coalesce(
           case when c.whatsapp ~ '^55[1-9][0-9][0-9]{8,9}$' then c.whatsapp end,
           w.numero)
    from privado.whatsapp_permissoes w
    left join public.contatos c on c.perfil_id = w.conta_id
   where w.conta_id = p_conta and w.cancelado_em is null
$$;
revoke all on function privado.numero_do_whatsapp(uuid) from public;

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
    -- espera 5 minutos para juntar e, depois de um aviso desta vaga, 3 horas
    select max(f.enviada_em) into v_ultima from privado.fila_whatsapp f
     where f.conta_id = new.destinatario_id and f.tipo = 'curtida' and f.anuncio_id = new.anuncio_id
       and f.enviada_em > now() - interval '3 hours';
    v_depois := greatest(now() + interval '5 minutes', coalesce(v_ultima + interval '3 hours', now()));
  elsif new.tipo = 'mensagem' then
    -- uma por conversa: espera 10 minutos (se a pessoa vir no Publike, não sai) e, depois de um aviso, 6 horas
    if exists (select 1 from privado.fila_whatsapp f
                where f.conta_id = new.destinatario_id and f.tipo = 'mensagem' and f.ator_id = new.ator_id
                  and f.situacao = 'pendente') then
      return new;
    end if;
    select max(f.enviada_em) into v_ultima from privado.fila_whatsapp f
     where f.conta_id = new.destinatario_id and f.tipo = 'mensagem' and f.ator_id = new.ator_id
       and f.enviada_em > now() - interval '6 hours';
    v_depois := greatest(now() + interval '10 minutes', coalesce(v_ultima + interval '6 hours', now()));
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

drop trigger if exists notificacoes_para_whatsapp on public.notificacoes;
create trigger notificacoes_para_whatsapp
after insert on public.notificacoes
for each row
when (new.tipo in ('match', 'entrevista', 'entrevista_lembrete', 'te_respondeu', 'conquista_pergunta', 'dispensada',
                   'curtida', 'lembrete_curtida', 'ainda_espera', 'conquista_confirmar', 'interesse_local', 'mensagem'))
execute function privado.notificacao_para_whatsapp();

-- 4. As respostas pelos botões: as mesmas regras do site, com a conta dada (o webhook não tem login) ----------------

create or replace function privado.responder_se_respondeu_por(p_conta uuid, p_anuncio uuid, p_resposta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := p_conta;
  x privado.te_respondeu;
  v_titulo text;
  v_autor uuid;
  v_nome text;
begin
  if conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_resposta is null or p_resposta not in ('sim', 'ainda_nao', 'desisti') then
    raise exception 'Resposta inválida.' using errcode = '22023';
  end if;
  select * into x from privado.te_respondeu t where t.anuncio_id = p_anuncio and t.perfil_id = conta for update;
  if not found then
    raise exception 'Não achamos essa vaga nas suas.' using errcode = 'P0002';
  end if;
  update privado.te_respondeu t
     set resposta = p_resposta, respondida_em = now(),
         proxima_pergunta_em = case when p_resposta = 'ainda_nao' then now() + interval '3 days' else t.proxima_pergunta_em end
   where t.anuncio_id = p_anuncio and t.perfil_id = conta;
  update public.notificacoes nt set lida = true
   where nt.destinatario_id = conta and nt.anuncio_id = p_anuncio and nt.tipo = 'te_respondeu';
  -- "Ainda não": quem publicou fica sabendo (no máximo um aviso a cada 3 dias por pessoa)
  if p_resposta = 'ainda_nao' and (x.empresa_avisada_em is null or x.empresa_avisada_em < now() - interval '3 days') then
    select a.titulo, a.autor_id into v_titulo, v_autor from public.anuncios a where a.id = p_anuncio;
    select p.nome into v_nome from public.perfis p where p.id = conta;
    if v_autor is not null and v_autor <> conta then
      delete from public.notificacoes nt
       where nt.destinatario_id = v_autor and nt.anuncio_id = p_anuncio and nt.ator_id = conta and nt.tipo = 'ainda_espera';
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
      values (v_autor, 'ainda_espera', p_anuncio, conta,
              coalesce(privado.nome_da_conquista(v_nome), 'Uma pessoa') || ' ainda espera o seu retorno sobre a vaga “'
              || v_titulo || '”. Uma resposta rápida, mesmo que seja não, ajuda quem procura trabalho.',
              '/painel/anuncio/' || p_anuncio || '/quadro?candidato=' || conta);
      update privado.te_respondeu t set empresa_avisada_em = now()
       where t.anuncio_id = p_anuncio and t.perfil_id = conta;
    end if;
  end if;
end
$$;
revoke all on function privado.responder_se_respondeu_por(uuid, uuid, text) from public;

create or replace function public.responder_se_respondeu(p_anuncio uuid, p_resposta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.responder_se_respondeu_por((select public.conta_atual()), p_anuncio, p_resposta);
end
$$;

create or replace function privado.responder_conquista_por(p_conta uuid, p_anuncio uuid, p_resposta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := p_conta;
  x public.conquistas;
  v_titulo text;
  v_autor uuid;
  v_nome text;
begin
  if conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_resposta is null or p_resposta not in ('comecei', 'ainda_nao', 'nao_deu') then
    raise exception 'Resposta inválida.' using errcode = '22023';
  end if;
  select * into x from public.conquistas c where c.anuncio_id = p_anuncio and c.perfil_id = conta for update;
  if not found then
    raise exception 'Não achamos essa vaga nas suas.' using errcode = 'P0002';
  end if;
  update public.conquistas c
     set resposta = p_resposta,
         respondida_em = now(),
         proxima_pergunta_em = case when p_resposta = 'ainda_nao' then now() + interval '7 days' else c.proxima_pergunta_em end
   where c.anuncio_id = p_anuncio and c.perfil_id = conta;
  -- a pergunta no sino já foi respondida
  update public.notificacoes nt set lida = true
   where nt.destinatario_id = conta and nt.anuncio_id = p_anuncio and nt.tipo = 'conquista_pergunta';
  -- "Comecei!": a empresa confirma (uma vez)
  if p_resposta = 'comecei' and x.resposta is distinct from 'comecei' and x.empresa is null then
    select a.titulo, a.autor_id into v_titulo, v_autor from public.anuncios a where a.id = p_anuncio;
    select p.nome into v_nome from public.perfis p where p.id = conta;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (v_autor, 'conquista_confirmar', p_anuncio, conta,
            coalesce(privado.nome_da_conquista(v_nome), 'Uma pessoa') || ' disse que começou a trabalhar com vocês, pela vaga “'
            || v_titulo || '”. Confirma?');
  end if;
end
$$;
revoke all on function privado.responder_conquista_por(uuid, uuid, text) from public;

create or replace function public.responder_conquista(p_anuncio uuid, p_resposta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.responder_conquista_por((select public.conta_atual()), p_anuncio, p_resposta);
end
$$;

create or replace function privado.confirmar_conquista_por(p_conta uuid, p_anuncio uuid, p_perfil uuid, p_sim boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := p_conta;
begin
  if conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = conta) then
    raise exception 'Essa vaga não é sua.' using errcode = '42501';
  end if;
  update public.conquistas c
     set empresa = case when p_sim then 'confirmou' else 'negou' end,
         empresa_em = now(),
         -- "Não é verdade" / "Não começou": a conquista sai do feed
         mostrada_em = case when p_sim then c.mostrada_em else null end
   where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil
     and (c.resposta = 'comecei' or c.empresa_perguntada_em is not null);
  if not found then
    raise exception 'Essa pessoa não disse que começou nessa vaga.' using errcode = 'P0002';
  end if;
  if p_sim then
    insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa)
    values (p_anuncio, p_perfil, 'contratado')
    on conflict (anuncio_id, perfil_id) do update set etapa = 'contratado', atualizado_em = now()
      where public.etapas_candidatos.etapa is distinct from 'contratado';
  end if;
  update public.notificacoes nt set lida = true
   where nt.destinatario_id = conta and nt.anuncio_id = p_anuncio and nt.ator_id = p_perfil
     and nt.tipo = 'conquista_confirmar';
  perform privado.sincronizar_contratacao(p_anuncio, p_perfil);
end
$$;
revoke all on function privado.confirmar_conquista_por(uuid, uuid, uuid, boolean) from public;

create or replace function public.confirmar_conquista(p_anuncio uuid, p_perfil uuid, p_sim boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.confirmar_conquista_por((select public.conta_atual()), p_anuncio, p_perfil, p_sim);
end
$$;

-- 5. O robô (/api/filas): a configuração, pegar o que sai agora e marcar o resultado ---------------------------------

create or replace function public.servidor_whatsapp_config(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_whatsapp where id;
  return jsonb_build_object('ativo', coalesce(cfg.ativo, false), 'modelos', coalesce(cfg.modelos, '{}'::jsonb),
                            'conferidos_em', cfg.modelos_conferidos_em);
end
$$;

create or replace function public.servidor_whatsapp_salvar_modelos(p_chave text, p_modelos jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if jsonb_typeof(p_modelos) is distinct from 'object' then
    raise exception 'Modelos inválidos.' using errcode = '22023';
  end if;
  update privado.config_whatsapp set modelos = p_modelos, modelos_conferidos_em = now() where id;
end
$$;

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

create or replace function public.servidor_whatsapp_marcar(
  p_chave text, p_id bigint, p_situacao text, p_modelo text default null, p_wamid text default null,
  p_motivo text default null, p_tentar_em_minutos integer default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if p_situacao not in ('enviada', 'falhou', 'descartada', 'pendente') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  update privado.fila_whatsapp f
     set situacao = p_situacao,
         modelo = coalesce(left(p_modelo, 80), f.modelo),
         wamid = coalesce(left(p_wamid, 200), f.wamid),
         motivo = left(p_motivo, 300),
         enviada_em = case when p_situacao = 'enviada' then now() else f.enviada_em end,
         -- de novo daqui a N minutos (erro passageiro, modelo esperando a aprovação)
         enviar_depois_de = case when p_situacao = 'pendente'
                                 then now() + make_interval(mins => least(greatest(coalesce(p_tentar_em_minutos, 5), 1), 720))
                                 else f.enviar_depois_de end
   where f.id = p_id and f.situacao = 'enviando';
end
$$;

-- a entrega e a leitura (o webhook)
create or replace function public.servidor_whatsapp_status(
  p_chave text, p_wamid text, p_status text, p_erro text default null, p_cobrada boolean default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.fila_whatsapp f
     set situacao = case
                      when p_status = 'failed' then 'falhou'
                      when p_status = 'read' then 'lida'
                      when p_status = 'delivered' and f.situacao <> 'lida' then 'entregue'
                      else f.situacao end,
         entregue_em = case when p_status in ('delivered', 'read') then coalesce(f.entregue_em, now()) else f.entregue_em end,
         lida_em = case when p_status = 'read' then coalesce(f.lida_em, now()) else f.lida_em end,
         motivo = case when p_status = 'failed' then left(coalesce(p_erro, 'a Meta não entregou'), 300) else f.motivo end,
         cobrada = coalesce(p_cobrada, f.cobrada)
   where f.wamid = p_wamid;
  return found;
end
$$;

-- 6. O que chega pelo WhatsApp: os botões, o PARAR e o resto (a resposta automática, uma por dia) --------------------

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

revoke execute on function public.servidor_whatsapp_config(text), public.servidor_whatsapp_salvar_modelos(text, jsonb),
  public.servidor_whatsapp_pegar(text, integer),
  public.servidor_whatsapp_marcar(text, bigint, text, text, text, text, integer),
  public.servidor_whatsapp_status(text, text, text, text, boolean),
  public.servidor_whatsapp_recebida(text, text, text, text, text) from public;
grant execute on function public.servidor_whatsapp_config(text), public.servidor_whatsapp_salvar_modelos(text, jsonb),
  public.servidor_whatsapp_pegar(text, integer),
  public.servidor_whatsapp_marcar(text, bigint, text, text, text, text, integer),
  public.servidor_whatsapp_status(text, text, text, text, boolean),
  public.servidor_whatsapp_recebida(text, text, text, text, text) to anon, authenticated, service_role;

-- 7. O aceite diz se os avisos já estão chegando (para o texto da tela) ----------------------------------------------

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
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  select * into r from privado.whatsapp_permissoes w where w.conta_id = conta;
  return jsonb_build_object(
    'aceito', found and r.cancelado_em is null,
    'numero', coalesce((select c.whatsapp from public.contatos c where c.perfil_id = conta), r.numero),
    'pode', (select public.papel_na_conta()) in ('dono', 'admin'),
    'ligado', coalesce((select c.ativo and c.para_todos from privado.config_whatsapp c where c.id), false));
end
$$;

-- 8. Admin › WhatsApp ------------------------------------------------------------------------------------------------

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
      'limite_dia', cfg.limite_dia, 'por_conta_dia', cfg.por_conta_dia, 'tipos_desligados', to_jsonb(cfg.tipos_desligados),
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
                          where f.cobrada and f.enviada_em > now() - interval '30 days'));
end
$$;

create or replace function public.admin_salvar_whatsapp(
  p_ativo boolean, p_para_todos boolean, p_numeros_teste text[], p_limite_dia integer, p_por_conta_dia integer,
  p_tipos_desligados text[]
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
         por_conta_dia = least(greatest(coalesce(p_por_conta_dia, por_conta_dia), 1), 20),
         tipos_desligados = coalesce(p_tipos_desligados, tipos_desligados),
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where id;
end
$$;

create or replace function public.admin_whatsapp_salvar_modelos(p_modelos jsonb)
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
  if jsonb_typeof(p_modelos) is distinct from 'object' then
    raise exception 'Modelos inválidos.' using errcode = '22023';
  end if;
  update privado.config_whatsapp set modelos = p_modelos, modelos_conferidos_em = now() where id;
end
$$;

revoke execute on function public.admin_whatsapp(),
  public.admin_salvar_whatsapp(boolean, boolean, text[], integer, integer, text[]),
  public.admin_whatsapp_salvar_modelos(jsonb) from public, anon;
grant execute on function public.admin_whatsapp(),
  public.admin_salvar_whatsapp(boolean, boolean, text[], integer, integer, text[]),
  public.admin_whatsapp_salvar_modelos(jsonb) to authenticated, service_role;

-- a tela na lista de Admin › Quem vê cada tela (só a equipe publike.org)
insert into privado.telas_do_admin (rota, somente_publike) values ('/admin/whatsapp', true)
on conflict (rota) do nothing;

notify pgrst, 'reload schema';
