-- "Quem você contratou?" com os nomes e um toque, e o freio do aviso de vaga nova (26/11/2026; Marcelo: "sente na
-- cadeira de dono e crie algo que seja relevante para o Publike... plano + execução" e, sobre o aviso de vaga nova,
-- "parar é desligar automático"; claude/estrategia-publike-necessario.md, o item 1: saber o resultado). Pode rodar de
-- novo.
--
-- O diagnóstico (produção, 26/11): 588 candidaturas com o contato liberado em vaga (544 pelo contato direto: a pessoa
-- recebe o WhatsApp da empresa na hora, e a conversa segue fora do Publike) e nenhum candidato em Contratados; 404
-- conquistas perguntadas e 1 "Comecei!"; 1 resposta ao "Quem você contratou?", que só aparece no site, ao encerrar a
-- vaga ou marcar como preenchida (5 vagas preenchidas e 2 encerradas; as outras vencem ou ficam no ar). Das 69 contas
-- com contato liberado em vaga, 56 têm e-mail, 18 aceitaram o WhatsApp e 10 entraram no site na última semana. O
-- Publike não sabe quem contrata.
--
-- 1. A pergunta vai até quem publicou: 5 dias depois do primeiro contato liberado numa vaga (o aceite, ou a candidatura
--    no contato direto; de novo a cada 7 dias, no máximo 3 vezes, enquanto não responde ou responde "Ainda não"), por
--    e-mail com o nome de cada pessoa num botão (um toque,
--    sem entrar no Publike), no sino, no celular e pelo WhatsApp (o modelo publike_quem_contratou, com o link). Uma vaga
--    por conta por dia, das 8h às 20h. Não pergunta da vaga que já tem alguém em Contratados, que já tem a resposta, que
--    tem um "Comecei!" esperando a confirmação, nem nos 5 dias depois do "Ainda está aberta?" (e vice-versa).
-- 2. A página do link (/quem-contratou/<código>, sem entrar): os aceitos com foto e o nome curto; "Contratei" (uma ou
--    mais pessoas, com "A vaga está completa"), "Ainda não contratei" (com a vaga no ar, vale a confirmação do "Ainda
--    está aberta?") ou "Não contratei ninguém daqui". A última resposta vale.
-- 3. Quem foi escolhido vai para Contratado (como no "Começou a trabalhar?" confirmado: sem as regras do processo, que
--    são do quadro), recebe os parabéns (o aviso da etapa) e, 7 dias depois, as perguntas de sempre ("Deu certo?" para a
--    pessoa; "Começou? Chamaria de novo?" para quem contratou). "A vaga está completa" tira do ar e avisa quem ficou.
-- 4. O selo "Contratou pelo Publike" conta também quem está em Contratado, se a pessoa não disse "Não deu certo".
-- 5. O aviso vaga_continua entra na fila do WhatsApp (faltava no gatilho: o modelo publike_vaga_continua nunca saía).
-- 6. O freio do aviso de vaga nova: para sozinho quando, das conversas avisadas desde o último religar (no máximo 7
--    dias), 5% ou mais (com 20 ou mais, e pelo menos 2 pessoas) responderam PARAR em até 3 dias depois do aviso ou
--    recusaram o marketing (o erro 131050 da Meta), ou quando a nota do número na Meta sai do verde. A equipe recebe o
--    e-mail; o Admin › Procuradas sem vaga › Aviso de vaga nova mostra por quê e tem o Religar.

-- 1. A pergunta de cada vaga ------------------------------------------------------------------------------------------

create table if not exists privado.perguntas_quem_contratou (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  autor_id uuid not null references public.perfis (id) on delete cascade,
  -- o código do link (e-mail, WhatsApp, sino e painel): a página responde sem entrar
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  perguntas smallint not null default 0,
  perguntada_em timestamptz,
  proxima_em timestamptz,
  -- a última resposta (o "Ainda não" volta a nulo quando o Publike pergunta de novo; `ainda_nao` conta quantos)
  resposta text check (resposta in ('contratei', 'ainda_nao', 'ninguem')),
  respondida_em timestamptz,
  respondida_por text check (respondida_por in ('link', 'painel')),
  ainda_nao smallint not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists perguntas_quem_contratou_autor_idx
  on privado.perguntas_quem_contratou (autor_id, perguntada_em desc);
alter table privado.perguntas_quem_contratou enable row level security;
revoke all on privado.perguntas_quem_contratou from public, anon, authenticated;

-- a resposta da pergunta também fica em privado.quem_contratou (o Admin › Retorno conta de lá)
do $$
declare
  d text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'privado.quem_contratou'::regclass and c.conname = 'quem_contratou_quando_check';
  if d is null or strpos(d, '''pergunta''') = 0 then
    alter table privado.quem_contratou drop constraint if exists quem_contratou_quando_check;
    alter table privado.quem_contratou add constraint quem_contratou_quando_check
      check (quando in ('encerrar', 'preenchida', 'pergunta'));
  end if;
end
$$;

-- 2. O aviso novo 'quem_contratou' (para quem publicou), no grupo do andamento: no sino, no celular e no WhatsApp. O
--    e-mail sai pelo robô, com os nomes nos botões (por isso fica fora do gatilho dos e-mails) ---------------------------

do $$
declare
  d text;
  f text;
  t text;
  antes text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'public.notificacoes'::regclass and c.conname = 'notificacoes_tipo_check';
  if strpos(d, '''quem_contratou''') = 0 then
    if strpos(d, '''vaga_continua_sim''::text') = 0 then
      raise exception 'notificacoes_tipo_check sem vaga_continua_sim (rode antes a 20271003120000): %', d;
    end if;
    d := replace(d, '''vaga_continua_sim''::text', '''vaga_continua_sim''::text, ''quem_contratou''::text');
    alter table public.notificacoes drop constraint notificacoes_tipo_check;
    execute 'alter table public.notificacoes add constraint notificacoes_tipo_check ' || d;
  end if;

  f := pg_get_functiondef('privado.grupo_do_aviso(text)'::regprocedure);
  if strpos(f, '''quem_contratou''') = 0 then
    antes := f;
    f := replace(f, '''vaga_continua'', ''vaga_continua_sim'') then ''andamento''',
                 '''vaga_continua'', ''vaga_continua_sim'', ''quem_contratou'') then ''andamento''');
    if f = antes then
      raise exception 'privado.grupo_do_aviso mudou: não achei a lista do andamento';
    end if;
    execute f;
  end if;

  -- o e-mail: fora do gatilho (o robô põe na fila, com os nomes)
  select pg_get_triggerdef(g.oid) into t from pg_trigger g
   where g.tgrelid = 'public.notificacoes'::regclass and g.tgname = 'notificacoes_por_email';
  if strpos(t, '''quem_contratou''') = 0 then
    if strpos(t, '''talentos_reativar''::text]') = 0 then
      raise exception 'notificacoes_por_email mudou: %', t;
    end if;
    t := replace(t, '''talentos_reativar''::text]', '''talentos_reativar''::text, ''quem_contratou''::text]');
    drop trigger notificacoes_por_email on public.notificacoes;
    execute t;
  end if;

  select pg_get_triggerdef(g.oid) into t from pg_trigger g
   where g.tgrelid = 'public.notificacoes'::regclass and g.tgname = 'notificacoes_para_celular';
  if strpos(t, '''quem_contratou''') = 0 then
    if strpos(t, '''vaga_continua_sim''::text]') = 0 then
      raise exception 'notificacoes_para_celular mudou: %', t;
    end if;
    t := replace(t, '''vaga_continua_sim''::text]', '''vaga_continua_sim''::text, ''quem_contratou''::text]');
    drop trigger notificacoes_para_celular on public.notificacoes;
    execute t;
  end if;

  -- o WhatsApp: o 'quem_contratou' e o 'vaga_continua', que faltava (a migração 20271003120000 pôs o modelo e os
  -- botões, mas não o tipo no gatilho)
  select pg_get_triggerdef(g.oid) into t from pg_trigger g
   where g.tgrelid = 'public.notificacoes'::regclass and g.tgname = 'notificacoes_para_whatsapp';
  if strpos(t, '''quem_contratou''') = 0 then
    if strpos(t, '''convite''::text]') = 0 then
      raise exception 'notificacoes_para_whatsapp mudou: %', t;
    end if;
    t := replace(t, '''convite''::text]',
                 '''convite''::text'
                 || case when strpos(t, '''vaga_continua''') = 0 then ', ''vaga_continua''::text' else '' end
                 || ', ''quem_contratou''::text]');
    drop trigger notificacoes_para_whatsapp on public.notificacoes;
    execute t;
  end if;

  -- as Preferências: dá para desligar o aviso novo no WhatsApp
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'privado.whatsapp_permissoes'::regclass and c.conname = 'whatsapp_permissoes_tipos_desligados_check';
  if d is not null and strpos(d, '''quem_contratou''') = 0 then
    if strpos(d, '''convite''::text]') = 0 then
      raise exception 'whatsapp_permissoes_tipos_desligados_check mudou: %', d;
    end if;
    d := replace(d, '''convite''::text]', '''convite''::text, ''quem_contratou''::text]');
    alter table privado.whatsapp_permissoes drop constraint whatsapp_permissoes_tipos_desligados_check;
    execute 'alter table privado.whatsapp_permissoes add constraint whatsapp_permissoes_tipos_desligados_check ' || d;
  end if;

  f := pg_get_functiondef('public.mudar_whatsapp_avisos(text[])'::regprocedure);
  if strpos(f, '''quem_contratou''') = 0 then
    antes := f;
    f := replace(f, '''interesse_local'', ''mensagem'', ''convite'']::text[]',
                 '''interesse_local'', ''mensagem'', ''convite'', ''quem_contratou'']::text[]');
    if f = antes then
      raise exception 'public.mudar_whatsapp_avisos mudou: não achei a lista dos avisos';
    end if;
    execute f;
  end if;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('quem_contratou', 'usuarios', 66, 'Quem você contratou?',
     'Para quem publicou: 5 dias depois do primeiro aceite numa vaga sem ninguém em Contratados, com o nome de cada aceito num botão (um toque, sem entrar no Publike), mais "Ainda não contratei" e "Não contratei ninguém daqui". De novo a cada 7 dias, no máximo 3 vezes, enquanto não responde ou responde "Ainda não". Uma vaga por conta por dia, das 8h às 20h.',
     array['nome', 'titulo', 'motivo', 'link'],
     'Você contratou alguém para a vaga “{{titulo}}”?',
     E'Oi, {{nome}}.\n\n{{motivo}}\n\nToque em quem você contratou. Não precisa entrar no Publike.',
     'Ver todos e responder')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do update
  set nome = excluded.nome, descricao = excluded.descricao, variaveis = excluded.variaveis,
      assunto = case when modelos_email.assunto = modelos_email.assunto_padrao then excluded.assunto
                     else modelos_email.assunto end,
      corpo = case when modelos_email.corpo = modelos_email.corpo_padrao then excluded.corpo
                   else modelos_email.corpo end,
      botao = case when modelos_email.botao = modelos_email.botao_padrao then excluded.botao
                   else modelos_email.botao end,
      assunto_padrao = excluded.assunto_padrao, corpo_padrao = excluded.corpo_padrao,
      botao_padrao = excluded.botao_padrao;

-- 3. A resposta (pelo link e pelo painel): quem foi para Contratado, a vaga completa e o "Ainda não" -------------------

create or replace function privado.gravar_quem_contratou(p_anuncio uuid, p_autor uuid, p_resposta text,
                                                         p_perfis uuid[], p_preencher boolean, p_por text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
  v_perfis uuid[] := '{}';
  v_novos uuid[] := '{}';
  v_empresa text;
  v_avisados integer := 0;
  v_preencheu boolean := false;
  v_confirmou boolean := false;
begin
  if p_resposta is null or p_resposta not in ('contratei', 'ainda_nao', 'ninguem')
     or p_por is null or p_por not in ('link', 'painel') then
    raise exception 'Resposta inválida.' using errcode = '22023';
  end if;
  select * into a from public.anuncios x where x.id = p_anuncio and x.autor_id = p_autor and x.tipo = 'vaga' for update;
  if not found then
    raise exception 'Vaga não encontrada.' using errcode = 'P0002';
  end if;
  if a.status = 'removido' then
    raise exception 'Esta vaga foi removida do Publike.' using errcode = '22023';
  end if;
  if exists (select 1 from public.perfis pf where pf.id = p_autor and pf.suspenso_ate > now()) then
    raise exception 'A conta está suspensa.' using errcode = '42501';
  end if;
  -- com alguém em Contratados, "Ainda não" e "Ninguém daqui" não combinam: tirar de Contratados é no quadro da vaga
  if p_resposta in ('ainda_nao', 'ninguem') and exists (
       select 1 from public.etapas_candidatos e
         join public.curtidas cu on cu.anuncio_id = e.anuncio_id and cu.perfil_id = e.perfil_id and cu.status = 'match'
        where e.anuncio_id = a.id and e.etapa = 'contratado') then
    raise exception 'Esta vaga já tem gente em Contratados. Contratou mais alguém? Toque em quem foi. Para tirar alguém de Contratados, use o quadro da vaga.'
      using errcode = '22023';
  end if;

  if p_resposta = 'contratei' then
    -- só quem foi aceito nesta vaga
    select coalesce(array_agg(distinct cu.perfil_id), '{}') into v_perfis
      from public.curtidas cu
     where cu.anuncio_id = a.id and cu.status = 'match' and cu.perfil_id <> a.autor_id
       and cu.perfil_id = any (coalesce(p_perfis, '{}'));
    if cardinality(v_perfis) = 0 then
      raise exception 'Escolha quem você contratou.' using errcode = '22023';
    end if;
    select coalesce(array_agg(x), '{}') into v_novos
      from unnest(v_perfis) x
     where not exists (select 1 from public.etapas_candidatos e
                        where e.anuncio_id = a.id and e.perfil_id = x and e.etapa = 'contratado');
    -- Contratado, como no "Começou a trabalhar?" confirmado (as regras do processo são do quadro)
    insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa)
    select a.id, x, 'contratado' from unnest(v_novos) x
    on conflict (anuncio_id, perfil_id) do update set etapa = 'contratado', atualizado_em = now()
      where public.etapas_candidatos.etapa is distinct from 'contratado';
    -- os parabéns (o aviso da etapa: o sino, o celular e o e-mail de sempre)
    select pf.nome into v_empresa from public.perfis pf where pf.id = a.autor_id;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    select x, 'etapa', a.id, a.autor_id,
           left('Parabéns! ' || coalesce(v_empresa, 'A empresa') || ' contou ao Publike que contratou você pela vaga “'
                || a.titulo || '”. Boa sorte no trabalho novo!', 300)
      from unnest(v_novos) x;
  end if;

  if p_resposta in ('contratei', 'ninguem') then
    insert into privado.quem_contratou (anuncio_id, autor_id, quando, ninguem, perfis)
    values (a.id, a.autor_id, 'pergunta', p_resposta = 'ninguem', v_perfis)
    on conflict (anuncio_id) do update
      set quando = excluded.quando, ninguem = excluded.ninguem, perfis = excluded.perfis, respondido_em = now();
  end if;

  insert into privado.perguntas_quem_contratou as q
    (anuncio_id, autor_id, token, resposta, respondida_em, respondida_por, proxima_em, ainda_nao)
  values (a.id, a.autor_id, encode(extensions.gen_random_bytes(32), 'hex'), p_resposta, now(), p_por,
          case when p_resposta = 'ainda_nao' then now() + interval '7 days' end,
          case when p_resposta = 'ainda_nao' then 1 else 0 end)
  on conflict (anuncio_id) do update
    set resposta = excluded.resposta, respondida_em = now(), respondida_por = excluded.respondida_por,
        proxima_em = case when excluded.resposta = 'ainda_nao' then now() + interval '7 days' else q.proxima_em end,
        ainda_nao = q.ainda_nao + excluded.ainda_nao;

  -- "Ainda não" com a vaga no ar: é a confirmação de que ela continua aberta (o "Ainda está aberta?")
  if p_resposta = 'ainda_nao' and a.status = 'ativo' and a.preenchida_em is null and a.expira_em > now() then
    perform privado.confirmar_continua_por(a.autor_id, a.id);
    v_confirmou := true;
  end if;
  -- a vaga está completa: tira do ar e avisa quem ficou (o mesmo do "Marcar como preenchida")
  if coalesce(p_preencher, false) and p_resposta in ('contratei', 'ninguem') and a.preenchida_em is null
     and a.status not in ('em_analise', 'removido') then
    v_avisados := privado.marcar_preenchida_por(a.autor_id, a.id);
    v_preencheu := true;
  end if;
  -- a pergunta respondida sai do sino
  update public.notificacoes nt set lida = true
   where nt.destinatario_id = a.autor_id and nt.anuncio_id = a.id and nt.tipo = 'quem_contratou' and not nt.lida;
  return jsonb_build_object(
    'resposta', p_resposta,
    'contratados', cardinality(v_perfis),
    'novos', cardinality(v_novos),
    'preenchida', v_preencheu or a.preenchida_em is not null,
    'avisados', v_avisados,
    'confirmou_aberta', v_confirmou);
end
$$;

-- A página do link: a vaga, quem foi aceito e a última resposta (sem entrar; só com o código)
create or replace function public.quem_contratou_pelo_link(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q privado.perguntas_quem_contratou;
  a public.anuncios;
  pf public.perfis;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into q from privado.perguntas_quem_contratou x where x.token = p_token;
  if not found then
    return null;
  end if;
  select * into a from public.anuncios x where x.id = q.anuncio_id;
  if not found then
    return null;
  end if;
  select * into pf from public.perfis x where x.id = a.autor_id;
  return jsonb_build_object(
    'anuncio_id', a.id,
    'titulo', a.titulo,
    'vagas', greatest(coalesce(a.vagas, 1), 1),
    -- no contato direto, a pessoa recebeu o WhatsApp da empresa ao se candidatar (não houve aceite)
    'contato_direto', coalesce(a.contato_direto, false),
    'removida', a.status = 'removido',
    'no_ar', a.status = 'ativo' and a.preenchida_em is null and a.expira_em > now(),
    'preenchida', a.preenchida_em is not null,
    'empresa', pf.nome,
    'empresa_foto', pf.foto,
    'resposta', q.resposta,
    'respondida_em', q.respondida_em,
    'pessoas', coalesce((
      select jsonb_agg(jsonb_build_object('id', y.perfil_id, 'nome', y.nome, 'foto', y.foto, 'aceito_em', y.quando,
                                          'contratado', y.contratado)
                       order by y.contratado desc, y.quando desc)
        from (select cu.perfil_id, coalesce(privado.nome_da_conquista(p.nome), 'Sem nome') as nome, p.foto,
                     coalesce(cu.respondida_em, cu.criado_em) as quando,
                     coalesce(e.etapa = 'contratado', false) as contratado
                from public.curtidas cu
                join public.perfis p on p.id = cu.perfil_id
                left join public.etapas_candidatos e on e.anuncio_id = cu.anuncio_id and e.perfil_id = cu.perfil_id
               where cu.anuncio_id = a.id and cu.status = 'match' and cu.perfil_id <> a.autor_id
               order by coalesce(e.etapa = 'contratado', false) desc, coalesce(cu.respondida_em, cu.criado_em) desc
               limit 100) y), '[]'::jsonb));
end
$$;

-- A resposta pelo link (sem entrar): "contratei" (com as pessoas), "ainda_nao" ou "ninguem"; `p_preencher`: a vaga
-- está completa (tira do ar e avisa quem ficou)
create or replace function public.responder_quem_contratou_pelo_link(p_token text, p_resposta text,
                                                                     p_perfis uuid[] default null,
                                                                     p_preencher boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  q privado.perguntas_quem_contratou;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Este link não vale.' using errcode = 'P0002';
  end if;
  select * into q from privado.perguntas_quem_contratou x where x.token = p_token for update;
  if not found then
    raise exception 'Este link não vale.' using errcode = 'P0002';
  end if;
  return privado.gravar_quem_contratou(q.anuncio_id, q.autor_id, p_resposta, p_perfis, p_preencher, 'link');
end
$$;

-- O painel de quem contrata: as perguntas que esperam a resposta (o cartão "Quem você contratou?" leva à página do link)
drop function if exists public.minhas_perguntas_quem_contratou();
create or replace function public.minhas_perguntas_quem_contratou()
returns table (anuncio_id uuid, titulo text, token text, aceitos integer, contato_direto boolean,
               perguntada_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select q.anuncio_id, a.titulo, q.token,
         (select count(*)::integer from public.curtidas cu
           where cu.anuncio_id = q.anuncio_id and cu.status = 'match' and cu.perfil_id <> a.autor_id),
         coalesce(a.contato_direto, false),
         q.perguntada_em
    from privado.perguntas_quem_contratou q
    join public.anuncios a on a.id = q.anuncio_id and a.status <> 'removido'
   where q.autor_id = (select public.conta_atual())
     and q.perguntada_em is not null
     and q.resposta is null
     and not exists (select 1 from privado.quem_contratou h where h.anuncio_id = q.anuncio_id)
     and not exists (select 1 from public.etapas_candidatos e where e.anuncio_id = q.anuncio_id and e.etapa = 'contratado')
   order by q.perguntada_em desc
   limit 10
$$;

-- 4. O robô das filas: a pergunta para quem publicou -------------------------------------------------------------------

-- `p_agora`: sem a janela das 8h às 20h (os testes e o "Perguntar agora" do Admin)
create or replace function public.servidor_perguntar_quem_contratou(p_chave text, p_limite integer default 30,
                                                                    p_agora boolean default false)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hora integer := extract(hour from now() at time zone 'America/Sao_Paulo');
  r record;
  n integer := 0;
  v_token text;
  v_total integer;
  v_lista jsonb;
  v_nomes text;
  v_aceitos text;
  v_contato text;
  v_texto text;
  v_motivo text;
  v_link text;
  v_opcoes jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  -- das 8h às 20h
  if not coalesce(p_agora, false) and (hora < 8 or hora >= 20) then
    return 0;
  end if;
  for r in
    with aceitos as materialized (
      -- os aceites dos últimos 45 dias, por vaga
      select cu.anuncio_id, a.autor_id, a.titulo, coalesce(a.contato_direto, false) as contato_direto,
             min(coalesce(cu.respondida_em, cu.criado_em)) as primeiro,
             max(coalesce(cu.respondida_em, cu.criado_em)) as ultimo
        from public.curtidas cu
        join public.anuncios a on a.id = cu.anuncio_id
       where cu.status = 'match' and a.tipo = 'vaga' and a.status <> 'removido' and cu.perfil_id <> a.autor_id
         and coalesce(cu.respondida_em, cu.criado_em) > now() - interval '45 days'
       group by cu.anuncio_id, a.autor_id, a.titulo, a.contato_direto
    ),
    vagas as (
      select x.*
        from aceitos x
        join public.perfis pf on pf.id = x.autor_id
        left join privado.perguntas_quem_contratou q on q.anuncio_id = x.anuncio_id
       where x.primeiro <= now() - interval '5 days'
         and (pf.suspenso_ate is null or pf.suspenso_ate <= now())
         and coalesce(q.perguntas, 0) < 3
         and (q.resposta is null or q.resposta = 'ainda_nao')
         and coalesce(q.proxima_em, '-infinity') <= now()
         -- já respondeu (aqui, ao encerrar ou ao marcar como preenchida) ou já pôs alguém em Contratado
         and not exists (select 1 from privado.quem_contratou h where h.anuncio_id = x.anuncio_id)
         and not exists (select 1 from public.etapas_candidatos e
                          where e.anuncio_id = x.anuncio_id and e.etapa = 'contratado')
         -- quem disse que começou espera a confirmação de quem publicou (o "Começou a trabalhar?")
         and not exists (select 1 from public.conquistas c
                          where c.anuncio_id = x.anuncio_id and c.resposta = 'comecei' and c.empresa is null)
         -- nos 5 dias depois do "Ainda está aberta?", não pergunta outra coisa da mesma vaga
         and not exists (select 1 from privado.vagas_continua vc
                          where vc.anuncio_id = x.anuncio_id and vc.perguntada_em > now() - interval '5 days')
         -- uma vaga por conta por dia
         and not exists (select 1 from privado.perguntas_quem_contratou q2
                          where q2.autor_id = x.autor_id and q2.perguntada_em > now() - interval '20 hours')
    )
    -- a vaga com o aceite mais recente de cada conta
    select distinct on (v.autor_id) v.anuncio_id, v.autor_id, v.titulo, v.contato_direto
      from vagas v
     order by v.autor_id, v.ultimo desc
     limit least(greatest(coalesce(p_limite, 30), 1), 200)
  loop
    insert into privado.perguntas_quem_contratou (anuncio_id, autor_id, token)
    values (r.anuncio_id, r.autor_id, encode(extensions.gen_random_bytes(32), 'hex'))
    on conflict (anuncio_id) do nothing;
    select q.token into v_token from privado.perguntas_quem_contratou q where q.anuncio_id = r.anuncio_id;
    v_link := '/quem-contratou/' || v_token;

    select count(*)::integer into v_total
      from public.curtidas cu
     where cu.anuncio_id = r.anuncio_id and cu.status = 'match' and cu.perfil_id <> r.autor_id;
    -- os 6 aceites mais recentes ganham o botão no e-mail; os 3 primeiros entram no texto do sino
    select jsonb_agg(jsonb_build_object('id', y.perfil_id, 'nome', y.nome) order by y.ordem),
           string_agg(y.nome, ', ' order by y.ordem) filter (where y.ordem <= 3)
      into v_lista, v_nomes
      from (select cu.perfil_id, coalesce(privado.nome_da_conquista(p.nome), 'Sem nome') as nome,
                   row_number() over (order by coalesce(cu.respondida_em, cu.criado_em) desc, cu.perfil_id) as ordem
              from public.curtidas cu
              join public.perfis p on p.id = cu.perfil_id
             where cu.anuncio_id = r.anuncio_id and cu.status = 'match' and cu.perfil_id <> r.autor_id) y
     where y.ordem <= 6;
    v_aceitos := case when v_total = 1 then '1 pessoa' else v_total || ' pessoas' end;
    -- no contato direto, ninguém foi aceito: a pessoa recebeu o WhatsApp da empresa ao se candidatar
    v_contato := case when r.contato_direto
                      then case when v_total = 1 then '1 pessoa recebeu' else v_total || ' pessoas receberam' end
                           || ' o seu contato pela vaga “' || r.titulo || '”'
                      else 'Você aceitou ' || v_aceitos || ' na vaga “' || r.titulo || '”' end;

    v_texto := v_contato
               || coalesce(': ' || v_nomes || case when v_total > 3 then ' e mais ' || (v_total - 3) else '' end, '');
    -- o nome curto já acaba em ponto ("Ana S."): sem o ponto dobrado
    v_texto := v_texto || case when right(v_texto, 1) = '.' then ' ' else '. ' end
               || 'Já contratou alguém? Conte com um toque: quem foi escolhido recebe os parabéns, e quem ficou, o retorno.';
    v_motivo := v_contato || ', no Publike. Já contratou alguém? '
                || 'Quem você escolher recebe os parabéns, e quem ficou recebe o retorno, sem ficar esperando.';
    v_opcoes := coalesce((select jsonb_agg(jsonb_build_object('rotulo', 'Contratei ' || (e->>'nome'),
                                                              'caminho', v_link || '?p=' || (e->>'id')))
                            from jsonb_array_elements(coalesce(v_lista, '[]'::jsonb)) e), '[]'::jsonb)
                || jsonb_build_array(
                     jsonb_build_object('rotulo', 'Ainda não contratei', 'caminho', v_link || '?r=ainda',
                                        'tom', 'secundario'),
                     jsonb_build_object('rotulo', 'Não contratei ninguém daqui', 'caminho', v_link || '?r=ninguem',
                                        'tom', 'secundario'));

    -- uma pergunta por vaga no sino: a nova tira a anterior
    delete from public.notificacoes nt
     where nt.destinatario_id = r.autor_id and nt.anuncio_id = r.anuncio_id and nt.tipo = 'quem_contratou';
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
    values (r.autor_id, 'quem_contratou', r.anuncio_id, left(v_texto, 300), v_link);
    perform privado.enfileirar_email(r.autor_id, 'quem_contratou', jsonb_build_object(
      'titulo', r.titulo,
      'motivo', v_motivo,
      'caminho', v_link,
      'opcoes', v_opcoes));
    -- o "Ainda não" volta a esperar a resposta
    update privado.perguntas_quem_contratou q
       set perguntas = q.perguntas + 1, perguntada_em = now(), proxima_em = now() + interval '7 days',
           resposta = case when q.resposta = 'ainda_nao' then null else q.resposta end
     where q.anuncio_id = r.anuncio_id;
    n := n + 1;
  end loop;
  return n;
end
$$;

-- o "Ainda está aberta?" também espera 5 dias depois do "Quem você contratou?" da mesma vaga
do $$
declare
  f text;
  antes text;
begin
  f := pg_get_functiondef('public.servidor_perguntar_se_continua(text, integer, boolean)'::regprocedure);
  if strpos(f, 'perguntas_quem_contratou') = 0 then
    antes := f;
    f := replace(f,
      '       and coalesce(vc.perguntada_em, ''-infinity'') < now() - interval ''7 days''' || chr(10),
      '       and coalesce(vc.perguntada_em, ''-infinity'') < now() - interval ''7 days''' || chr(10)
      || '       -- nem nos 5 dias depois do "Quem você contratou?" (migração 20271006120000)' || chr(10)
      || '       and not exists (select 1 from privado.perguntas_quem_contratou q' || chr(10)
      || '                        where q.anuncio_id = a.id and q.perguntada_em > now() - interval ''5 days'')' || chr(10));
    if f = antes then
      raise exception 'servidor_perguntar_se_continua mudou: não achei o intervalo de 7 dias';
    end if;
    execute f;
  end if;
end
$$;

-- 5. O selo "Contratou pelo Publike": também quem está em Contratado, se a pessoa não disse "Não deu certo" -----------

do $$
declare
  f text;
  antes text;
begin
  f := pg_get_functiondef('privado.selos_calculados(uuid)'::regprocedure);
  if strpos(f, 'etapas_candidatos') = 0 then
    antes := f;
    f := replace(f,
      '  select count(distinct c.perfil_id) into v_contratou' || chr(10)
      || '    from public.conquistas c' || chr(10)
      || '    join public.anuncios a on a.id = c.anuncio_id' || chr(10)
      || '   where a.autor_id = p_conta and c.resposta = ''comecei'' and c.empresa is distinct from ''negou'';',
      '  -- e quem está em Contratado (o quadro, o "Quem você contratou?"), se a pessoa não disse "Não deu certo"' || chr(10)
      || '  -- (migração 20271006120000)' || chr(10)
      || '  select count(distinct x.perfil_id) into v_contratou' || chr(10)
      || '    from (select c.perfil_id' || chr(10)
      || '            from public.conquistas c' || chr(10)
      || '            join public.anuncios a on a.id = c.anuncio_id' || chr(10)
      || '           where a.autor_id = p_conta and c.resposta = ''comecei'' and c.empresa is distinct from ''negou''' || chr(10)
      || '          union' || chr(10)
      || '          select e.perfil_id' || chr(10)
      || '            from public.etapas_candidatos e' || chr(10)
      || '            join public.anuncios a on a.id = e.anuncio_id and a.tipo = ''vaga''' || chr(10)
      || '            join public.curtidas cu on cu.anuncio_id = e.anuncio_id and cu.perfil_id = e.perfil_id' || chr(10)
      || '                                   and cu.status = ''match''' || chr(10)
      || '            left join public.conquistas c on c.anuncio_id = e.anuncio_id and c.perfil_id = e.perfil_id' || chr(10)
      || '           where a.autor_id = p_conta and e.etapa = ''contratado'' and e.perfil_id <> a.autor_id' || chr(10)
      || '             and c.resposta is distinct from ''nao_deu'' and c.empresa is distinct from ''negou'') x;');
    if f = antes then
      raise exception 'privado.selos_calculados mudou: não achei a conta do "Contratou pelo Publike"';
    end if;
    execute f;
  end if;
end
$$;

-- 6. Admin › Retorno: a pergunta à empresa entra nos números ----------------------------------------------------------

create or replace function public.admin_respostas_do_retorno(p_dias integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with d as (select now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365))) as desde)
  select jsonb_build_object(
    'te_respondeu', (select jsonb_build_object(
        'perguntadas', count(*),
        'sim', count(*) filter (where t.resposta = 'sim'),
        'ainda_nao', count(*) filter (where t.resposta = 'ainda_nao'),
        'desisti', count(*) filter (where t.resposta = 'desisti'),
        'sem_resposta', count(*) filter (where t.resposta is null))
       from privado.te_respondeu t, d where t.perguntada_em >= d.desde),
    'quem_contratou', (select jsonb_build_object(
        'respostas', count(*),
        'daqui', count(*) filter (where cardinality(q.perfis) > 0),
        'pessoas', coalesce(sum(cardinality(q.perfis)), 0),
        'ninguem', count(*) filter (where q.ninguem),
        'pela_pergunta', count(*) filter (where q.quando = 'pergunta'))
       from privado.quem_contratou q, d where q.respondido_em >= d.desde),
    -- a pergunta que vai até quem publicou (migração 20271006120000)
    'pergunta_empresa', (select jsonb_build_object(
        'perguntadas', count(*) filter (where p.perguntada_em >= d.desde),
        'respondidas', count(*) filter (where p.respondida_em >= d.desde),
        'contratei', count(*) filter (where p.resposta = 'contratei' and p.respondida_em >= d.desde),
        'ainda_nao', count(*) filter (where p.ainda_nao > 0 and p.respondida_em >= d.desde),
        'ninguem', count(*) filter (where p.resposta = 'ninguem' and p.respondida_em >= d.desde),
        'pelo_link', count(*) filter (where p.respondida_por = 'link' and p.respondida_em >= d.desde))
       from privado.perguntas_quem_contratou p, d),
    'comecou', (select jsonb_build_object(
        'pessoa_comecei', count(*) filter (where c.resposta = 'comecei'),
        'pessoa_nao_deu', count(*) filter (where c.resposta = 'nao_deu'),
        'empresa_confirmou', count(*) filter (where c.empresa = 'confirmou'),
        'empresa_negou', count(*) filter (where c.empresa = 'negou'),
        'chamaria_sim', count(*) filter (where c.chamaria is true),
        'chamaria_nao', count(*) filter (where c.chamaria is false))
       from public.conquistas c, d
      where greatest(c.respondida_em, c.empresa_em, c.chamaria_em) >= d.desde))
$$;
revoke execute on function public.admin_respostas_do_retorno(integer) from public, anon, authenticated;
grant execute on function public.admin_respostas_do_retorno(integer) to service_role;

-- 7. O freio do aviso de vaga nova ("parar é desligar automático") ----------------------------------------------------

alter table privado.config_whatsapp add column if not exists avisos_vaga_freio_pct smallint not null default 5;
alter table privado.config_whatsapp add column if not exists avisos_vaga_freado_em timestamptz;
alter table privado.config_whatsapp add column if not exists avisos_vaga_freio_motivo text;
alter table privado.config_whatsapp add column if not exists avisos_vaga_religado_em timestamptz;
-- a nota do número na Meta (GREEN, YELLOW, RED, UNKNOWN), que o robô das filas confere a cada meia hora
alter table privado.config_whatsapp add column if not exists numero_qualidade text;
alter table privado.config_whatsapp add column if not exists numero_qualidade_em timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'privado.config_whatsapp'::regclass and c.conname = 'config_whatsapp_freio_pct_check') then
    alter table privado.config_whatsapp add constraint config_whatsapp_freio_pct_check
      check (avisos_vaga_freio_pct between 1 and 50);
  end if;
end
$$;

-- As contas do freio, desde o último religar (no máximo 7 dias): as conversas avisadas, as que disseram PARAR em até 3
-- dias depois de um aviso e as que recusaram o marketing na Meta (131050)
create or replace function privado.freio_dos_avisos_de_vaga()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
  v_desde timestamptz;
  v_avisadas integer;
  v_pararam integer;
  v_recusaram integer;
begin
  select * into cfg from privado.config_whatsapp c where c.id;
  v_desde := greatest(now() - interval '7 days', coalesce(cfg.avisos_vaga_religado_em, '-infinity'::timestamptz));
  select count(distinct a.conversa),
         count(distinct a.conversa) filter (
           where exists (select 1 from privado.whatsapp_conversas cv
                          where cv.chave = a.conversa
                            and cv.avisos_parados_em between a.mandado_em and a.mandado_em + interval '3 days'))
    into v_avisadas, v_pararam
    from privado.whatsapp_avisos_de_vaga a
   where a.mandado_em >= v_desde and a.falhou is null;
  select count(distinct a.conversa) into v_recusaram
    from privado.whatsapp_avisos_de_vaga a
   where a.mandado_em >= v_desde and position('131050' in coalesce(a.falhou, '')) > 0;
  return jsonb_build_object(
    'desde', v_desde,
    'avisadas', v_avisadas + v_recusaram,
    'pararam', v_pararam,
    'recusaram', v_recusaram,
    'pct', coalesce(cfg.avisos_vaga_freio_pct, 5),
    'qualidade', cfg.numero_qualidade,
    'qualidade_em', cfg.numero_qualidade_em,
    'freado_em', cfg.avisos_vaga_freado_em,
    'motivo', cfg.avisos_vaga_freio_motivo,
    'religado_em', cfg.avisos_vaga_religado_em);
end
$$;

-- O freio está puxado? Se ainda não, confere agora e puxa (com o e-mail para a equipe)
create or replace function privado.avisos_de_vaga_freados()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
  j jsonb;
  v_avisadas integer;
  v_ruins integer;
  v_motivo text;
begin
  select * into cfg from privado.config_whatsapp c where c.id;
  if not found then
    return true;
  end if;
  if cfg.avisos_vaga_freado_em is not null then
    return true;
  end if;
  if cfg.numero_qualidade in ('YELLOW', 'RED') then
    v_motivo := 'A nota do número do Publike na Meta saiu do verde (ficou '
                || case cfg.numero_qualidade when 'YELLOW' then 'amarela' else 'vermelha' end
                || '). O aviso de vaga nova é marketing: parou para proteger os avisos de candidatura e o atendimento.';
  else
    j := privado.freio_dos_avisos_de_vaga();
    v_avisadas := (j->>'avisadas')::integer;
    v_ruins := (j->>'pararam')::integer + (j->>'recusaram')::integer;
    if v_avisadas >= 20 and v_ruins >= 2 and v_ruins * 100 >= (j->>'pct')::integer * v_avisadas then
      v_motivo := v_ruins || ' de ' || v_avisadas || ' pessoas avisadas ('
                  || round(v_ruins * 100.0 / v_avisadas)::integer || '%) pediram para parar '
                  || case when cfg.avisos_vaga_religado_em > now() - interval '7 days'
                          then 'desde o último religar, em '
                               || to_char(cfg.avisos_vaga_religado_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
                          else 'nos últimos 7 dias' end
                  || ': ' || (j->>'pararam') || ' responderam PARAR e ' || (j->>'recusaram')
                  || ' recusaram o marketing na Meta. O freio é de ' || (j->>'pct') || '%.';
    end if;
  end if;
  if v_motivo is null then
    return false;
  end if;
  update privado.config_whatsapp c
     set avisos_vaga_freado_em = now(), avisos_vaga_freio_motivo = left(v_motivo, 500)
   where c.id and c.avisos_vaga_freado_em is null;
  if found then
    perform privado.avisar_equipe('aviso_sistema', jsonb_build_object(
      'titulo', 'O aviso de vaga nova pelo WhatsApp parou sozinho',
      'detalhe', left(v_motivo || ' Para mandar de novo: Admin › Procuradas sem vaga › Aviso de vaga nova › Religar.', 1000),
      'caminho', '/admin/procuradas?aba=aviso'));
  end if;
  return true;
end
$$;

-- o robô do aviso: com o freio puxado, não manda nada (antes da conta do dia)
do $$
declare
  f text;
  antes text;
begin
  f := pg_get_functiondef('public.servidor_avisos_de_vaga_para_mandar(text, integer, boolean)'::regprocedure);
  if strpos(f, 'avisos_de_vaga_freados') = 0 then
    antes := f;
    f := replace(f,
      '  select count(*) into v_hoje from privado.whatsapp_avisos_de_vaga a' || chr(10),
      '  -- o freio (migração 20271006120000): PARAR ou recusa de muita gente, ou a nota do número fora do verde' || chr(10)
      || '  if privado.avisos_de_vaga_freados() then' || chr(10)
      || '    return;' || chr(10)
      || '  end if;' || chr(10)
      || '  select count(*) into v_hoje from privado.whatsapp_avisos_de_vaga a' || chr(10));
    if f = antes then
      raise exception 'servidor_avisos_de_vaga_para_mandar mudou: não achei a conta do dia';
    end if;
    execute f;
  end if;
end
$$;

-- a promessa do atendimento ("eu te aviso aqui") só com o aviso valendo, sem o freio puxado
create or replace function public.servidor_avisos_de_vaga_ligado(p_chave text, p_conversa text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_whatsapp c where c.id;
  if not found or not cfg.ativo or 'aviso_de_vaga' = any (cfg.tipos_desligados) or cfg.avisos_vaga_por_dia <= 0
     or cfg.avisos_vaga_freado_em is not null then
    return false;
  end if;
  if p_conversa is null then
    return true;
  end if;
  return exists (select 1 from privado.whatsapp_conversas cv
                  where cv.chave = p_conversa and cv.avisos_parados_em is null
                    and (cfg.para_todos or privado.chave_do_numero(cv.numero) = any (
                           select privado.chave_do_numero(t) from unnest(cfg.numeros_teste) t)));
end
$$;

-- a nota do número, do robô das filas (a cada meia hora, junto com a conferência dos modelos)
create or replace function public.servidor_guardar_qualidade_do_numero(p_chave text, p_qualidade text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.config_whatsapp c
     set numero_qualidade = nullif(upper(left(btrim(coalesce(p_qualidade, '')), 20)), ''), numero_qualidade_em = now()
   where c.id;
end
$$;

-- O Admin: os números, o freio e o teto
create or replace function public.admin_avisos_de_vaga_whatsapp()
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
  return (
    select jsonb_build_object(
      'ligado', not ('aviso_de_vaga' = any (c.tipos_desligados)),
      'por_dia', c.avisos_vaga_por_dia,
      'whatsapp_ativo', c.ativo,
      'hoje', (select count(*) from privado.whatsapp_avisos_de_vaga a
                where a.falhou is null
                  and a.mandado_em >= ((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo'),
      'semana', (select count(*) from privado.whatsapp_avisos_de_vaga a
                  where a.mandado_em > now() - interval '7 days' and a.falhou is null),
      'semana_modelo', (select count(*) from privado.whatsapp_avisos_de_vaga a
                         where a.mandado_em > now() - interval '7 days' and a.pelo_modelo and a.falhou is null),
      'semana_falhas', (select count(*) from privado.whatsapp_avisos_de_vaga a
                         where a.mandado_em > now() - interval '7 days' and a.falhou is not null),
      -- quem se candidatou depois do aviso (a conta do número curtiu a vaga do aviso)
      'semana_candidaturas', (select count(*) from privado.whatsapp_avisos_de_vaga a
                               join privado.whatsapp_conversas cv on cv.chave = a.conversa
                               join auth.users u on u.phone = privado.telefone_do_login(cv.numero)
                               join public.curtidas cu on cu.perfil_id = u.id and cu.anuncio_id = a.anuncio_id
                                                      and cu.criado_em >= a.mandado_em
                              where a.mandado_em > now() - interval '7 days' and a.falhou is null),
      'pessoas', (select count(distinct p.conversa) from privado.whatsapp_procuras p
                   join privado.whatsapp_conversas cv on cv.chave = p.conversa
                  where p.procurada_em > now() - interval '30 days' and cv.avisos_parados_em is null),
      'pararam', (select count(*) from privado.whatsapp_conversas cv where cv.avisos_parados_em is not null),
      'freio', privado.freio_dos_avisos_de_vaga())
      from privado.config_whatsapp c where c.id);
end
$$;

-- o teto do dia e o freio (o % de quem pede para parar); `p_freio_pct` nulo deixa como está
drop function if exists public.admin_salvar_avisos_de_vaga_whatsapp(integer);
create or replace function public.admin_salvar_avisos_de_vaga_whatsapp(p_por_dia integer, p_freio_pct integer default null)
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
  if p_por_dia is not null and (p_por_dia < 0 or p_por_dia > 5000) then
    raise exception 'O teto do dia vai de 0 a 5.000 avisos.' using errcode = '22023';
  end if;
  if p_freio_pct is not null and (p_freio_pct < 1 or p_freio_pct > 50) then
    raise exception 'O freio vai de 1%% a 50%% de quem pede para parar.' using errcode = '22023';
  end if;
  update privado.config_whatsapp c
     set avisos_vaga_por_dia = coalesce(p_por_dia, c.avisos_vaga_por_dia),
         avisos_vaga_freio_pct = coalesce(p_freio_pct, c.avisos_vaga_freio_pct),
         atualizado_em = now(), atualizado_por = auth.uid()
   where c.id;
end
$$;

-- Religar: solta o freio e as contas recomeçam de agora (o que já passou não puxa de novo)
create or replace function public.admin_religar_avisos_de_vaga_whatsapp()
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
  update privado.config_whatsapp c
     set avisos_vaga_freado_em = null, avisos_vaga_freio_motivo = null, avisos_vaga_religado_em = now(),
         atualizado_em = now(), atualizado_por = auth.uid()
   where c.id;
end
$$;

-- 8. As permissões ----------------------------------------------------------------------------------------------------

revoke execute on function
  privado.gravar_quem_contratou(uuid, uuid, text, uuid[], boolean, text),
  privado.freio_dos_avisos_de_vaga(),
  privado.avisos_de_vaga_freados()
from public, anon, authenticated;

revoke execute on function
  public.quem_contratou_pelo_link(text),
  public.responder_quem_contratou_pelo_link(text, text, uuid[], boolean),
  public.minhas_perguntas_quem_contratou(),
  public.servidor_perguntar_quem_contratou(text, integer, boolean),
  public.servidor_guardar_qualidade_do_numero(text, text),
  public.admin_avisos_de_vaga_whatsapp(),
  public.admin_salvar_avisos_de_vaga_whatsapp(integer, integer),
  public.admin_religar_avisos_de_vaga_whatsapp()
from public;
-- a página do link abre sem entrar
grant execute on function
  public.quem_contratou_pelo_link(text),
  public.responder_quem_contratou_pelo_link(text, text, uuid[], boolean)
to anon, authenticated;
revoke execute on function public.minhas_perguntas_quem_contratou() from anon;
grant execute on function public.minhas_perguntas_quem_contratou() to authenticated;
grant execute on function
  public.servidor_perguntar_quem_contratou(text, integer, boolean),
  public.servidor_guardar_qualidade_do_numero(text, text)
to anon, authenticated, service_role;
revoke execute on function
  public.admin_avisos_de_vaga_whatsapp(),
  public.admin_salvar_avisos_de_vaga_whatsapp(integer, integer),
  public.admin_religar_avisos_de_vaga_whatsapp()
from anon;
grant execute on function
  public.admin_avisos_de_vaga_whatsapp(),
  public.admin_salvar_avisos_de_vaga_whatsapp(integer, integer),
  public.admin_religar_avisos_de_vaga_whatsapp()
to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271006120000_quem_contratou_e_freio');
