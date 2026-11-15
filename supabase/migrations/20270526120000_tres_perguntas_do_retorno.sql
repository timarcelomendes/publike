-- As três perguntas que medem o que acontece no WhatsApp (15/11/2026, Marcelo: "Meu maior desafio, medir retorno.
-- Pois se a empresa responder no WhatsApp eu não sei..", e depois "Implemente"; claude/estrategia-publike-necessario.md).
--
--   1. Para a pessoa, 2 dias depois do contato numa vaga: "A {empresa} te respondeu?" (Sim / Ainda não / Desisti).
--      "Ainda não" avisa quem publicou que a pessoa ainda espera (no máximo um aviso a cada 3 dias) e a tela mostra
--      as vagas parecidas. No máximo 2 perguntas por vaga (a segunda 3 dias depois do "Ainda não" ou do silêncio).
--   2. Para a empresa, ao encerrar a vaga ou marcar como preenchida: "Quem você contratou?", com "Ninguém daqui".
--      Quem for tocado vai para Contratado (pelo caminho de sempre, no site); aqui fica guardada a resposta.
--   3. Para os dois, 7 dias depois: a pessoa recebe o "Deu certo? Você começou a trabalhar?" (a conquista, agora
--      7 dias depois do contato, ou 7 dias depois de ir para Contratado); a empresa, 7 dias depois de pôr alguém em
--      Contratado, "{nome} começou a trabalhar? Chamaria de novo?". O "Chamaria de novo?" é o começo da reputação de
--      quem trabalha.
--
-- Os avisos novos: 'te_respondeu' (a pergunta 1) e 'ainda_espera' (para quem publicou). A pergunta 3 da empresa usa o
-- 'conquista_confirmar' de sempre. Pode rodar de novo.

-- 1. Os tipos de aviso novos (no sino, no celular e por e-mail) ------------------------------------------------------

do $$
declare
  d text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'public.notificacoes'::regclass and c.conname = 'notificacoes_tipo_check';
  if d is null then
    raise exception 'notificacoes_tipo_check não existe';
  end if;
  if strpos(d, '''te_respondeu''') = 0 then
    if strpos(d, '''conquista_parabens''::text') = 0 then
      raise exception 'notificacoes_tipo_check sem conquista_parabens: %', d;
    end if;
    d := replace(d, '''conquista_parabens''::text',
                 '''conquista_parabens''::text, ''te_respondeu''::text, ''ainda_espera''::text');
    alter table public.notificacoes drop constraint notificacoes_tipo_check;
    execute 'alter table public.notificacoes add constraint notificacoes_tipo_check ' || d;
  end if;
end
$$;

-- o grupo das Preferências › Avisos ("andamento"), o texto do e-mail e o caminho do botão: a mesma função de antes,
-- com os dois tipos novos
do $$
declare
  f text;
  antes text;
begin
  f := pg_get_functiondef('privado.grupo_do_aviso(text)'::regprocedure);
  if strpos(f, '''te_respondeu''') = 0 then
    antes := f;
    f := replace(f, '''conquista_parabens'') then ''andamento''',
                 '''conquista_parabens'', ''te_respondeu'', ''ainda_espera'') then ''andamento''');
    if f = antes then
      raise exception 'privado.grupo_do_aviso mudou: não achei a lista do andamento';
    end if;
    execute f;
  end if;

  f := pg_get_functiondef('privado.notificacao_por_email()'::regprocedure);
  if strpos(f, '''te_respondeu''') = 0 then
    antes := f;
    f := replace(f, '''conquista_confirmar'', ''conquista_parabens'') then',
                 '''conquista_confirmar'', ''conquista_parabens'', ''te_respondeu'', ''ainda_espera'') then');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei a lista do motivo';
    end if;
    antes := f;
    f := replace(f, 'when ''conquista_pergunta'' then coalesce(new.link, ''/#conquista'')',
                 'when ''conquista_pergunta'' then coalesce(new.link, ''/#conquista'')'
                 || chr(10) || '                 when ''te_respondeu'' then coalesce(new.link, ''/#te-respondeu'')'
                 || chr(10) || '                 when ''ainda_espera'' then coalesce(new.link, ''/painel/anuncio/'' || new.anuncio_id || ''/quadro?candidato='' || new.ator_id)');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei o caminho da conquista';
    end if;
    execute f;
  end if;
end
$$;

do $$
declare
  t text;
begin
  select pg_get_triggerdef(g.oid) into t from pg_trigger g
   where g.tgrelid = 'public.notificacoes'::regclass and g.tgname = 'notificacoes_para_celular';
  if t is null then
    raise exception 'o gatilho notificacoes_para_celular não existe';
  end if;
  if strpos(t, '''te_respondeu''') = 0 then
    if strpos(t, '''conquista_parabens''::text]') = 0 then
      raise exception 'notificacoes_para_celular mudou: %', t;
    end if;
    t := replace(t, '''conquista_parabens''::text]',
                 '''conquista_parabens''::text, ''te_respondeu''::text, ''ainda_espera''::text]');
    drop trigger notificacoes_para_celular on public.notificacoes;
    execute t;
  end if;
end
$$;

-- 2. Pergunta 1: "A empresa te respondeu?" ---------------------------------------------------------------------------

create table if not exists privado.te_respondeu (
  anuncio_id uuid not null,
  perfil_id uuid not null,
  perguntas smallint not null default 0,
  perguntada_em timestamptz,
  proxima_pergunta_em timestamptz not null default now(),
  -- sim; ainda_nao (a empresa recebe o aviso); desisti
  resposta text check (resposta in ('sim', 'ainda_nao', 'desisti')),
  respondida_em timestamptz,
  empresa_avisada_em timestamptz,
  criado_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id),
  foreign key (anuncio_id, perfil_id) references public.curtidas (anuncio_id, perfil_id) on delete cascade
);
create index if not exists te_respondeu_perguntar_idx on privado.te_respondeu (proxima_pergunta_em)
  where resposta is null or resposta = 'ainda_nao';
create index if not exists te_respondeu_pessoa_idx on privado.te_respondeu (perfil_id);
alter table privado.te_respondeu enable row level security;
revoke all on privado.te_respondeu from public, anon, authenticated;

-- O robô das filas: os contatos de 2 a 7 dias atrás entram (uma vez cada; o contato é o match: o WhatsApp direto ou o
-- aceite da empresa) e a pergunta sai no sino. Quem já está em Contratado ou já contou da conquista não é perguntado.
create or replace function public.servidor_perguntar_se_respondeu(p_chave text, p_limite integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  n integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.te_respondeu (anuncio_id, perfil_id)
  select cu.anuncio_id, cu.perfil_id
    from public.curtidas cu
    join public.anuncios a on a.id = cu.anuncio_id and a.tipo = 'vaga' and a.status <> 'removido'
   where cu.status = 'match'
     and coalesce(cu.respondida_em, cu.criado_em) between now() - interval '7 days' and now() - interval '2 days'
     and cu.perfil_id <> a.autor_id
     and not exists (select 1 from privado.te_respondeu x where x.anuncio_id = cu.anuncio_id and x.perfil_id = cu.perfil_id)
     and not exists (select 1 from public.etapas_candidatos e
                      where e.anuncio_id = cu.anuncio_id and e.perfil_id = cu.perfil_id and e.etapa = 'contratado')
   limit 500
  on conflict do nothing;

  for c in
    select x.anuncio_id, x.perfil_id, a.titulo, a.autor_id, pa.nome as empresa
      from privado.te_respondeu x
      join public.curtidas cu on cu.anuncio_id = x.anuncio_id and cu.perfil_id = x.perfil_id and cu.status = 'match'
      join public.anuncios a on a.id = x.anuncio_id and a.status <> 'removido'
      join public.perfis pa on pa.id = a.autor_id
      join public.perfis pp on pp.id = x.perfil_id
     where (x.resposta is null or x.resposta = 'ainda_nao')
       and x.perguntas < 2
       and x.proxima_pergunta_em <= now()
       and (pp.suspenso_ate is null or pp.suspenso_ate <= now())
       and not exists (select 1 from public.etapas_candidatos e
                        where e.anuncio_id = x.anuncio_id and e.perfil_id = x.perfil_id and e.etapa = 'contratado')
       and not exists (select 1 from public.conquistas q
                        where q.anuncio_id = x.anuncio_id and q.perfil_id = x.perfil_id and q.resposta is not null)
     order by x.proxima_pergunta_em
     limit least(greatest(coalesce(p_limite, 100), 1), 500)
  loop
    -- uma pergunta por vaga no sino: a nova tira a anterior
    delete from public.notificacoes nt
     where nt.destinatario_id = c.perfil_id and nt.anuncio_id = c.anuncio_id and nt.tipo = 'te_respondeu';
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
    values (c.perfil_id, 'te_respondeu', c.anuncio_id, c.autor_id,
            coalesce(c.empresa, 'A empresa') || ' te respondeu sobre a vaga “' || c.titulo
            || '”? Conte para a gente: ajuda quem procura trabalho a saber quem responde.', '/#te-respondeu');
    update privado.te_respondeu x
       set perguntas = x.perguntas + 1, perguntada_em = now(), proxima_pergunta_em = now() + interval '3 days'
     where x.anuncio_id = c.anuncio_id and x.perfil_id = c.perfil_id;
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function public.servidor_perguntar_se_respondeu(text, integer) from public;
-- o robô usa a chave pública com a chave do servidor (como as outras funções do servidor)
grant execute on function public.servidor_perguntar_se_respondeu(text, integer) to anon, authenticated, service_role;

-- O que a pessoa tem para responder (perguntado nos últimos 14 dias e sem resposta depois da pergunta), no alto do feed.
create or replace function public.minhas_perguntas_de_resposta()
returns table (anuncio_id uuid, titulo text, empresa_nome text, perguntas integer)
language sql
stable
security definer
set search_path = ''
as $$
  select x.anuncio_id, a.titulo, pa.nome, x.perguntas::integer
    from privado.te_respondeu x
    join public.anuncios a on a.id = x.anuncio_id and a.status <> 'removido'
    join public.perfis pa on pa.id = a.autor_id
   where x.perfil_id = (select public.conta_atual())
     and x.perguntada_em > now() - interval '14 days'
     and (x.respondida_em is null or x.respondida_em < x.perguntada_em)
     and x.resposta is distinct from 'sim' and x.resposta is distinct from 'desisti'
   order by x.perguntada_em desc
   limit 3
$$;
revoke execute on function public.minhas_perguntas_de_resposta() from public, anon;
grant execute on function public.minhas_perguntas_de_resposta() to authenticated;

create or replace function public.responder_se_respondeu(p_anuncio uuid, p_resposta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
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
revoke execute on function public.responder_se_respondeu(uuid, text) from public, anon;
grant execute on function public.responder_se_respondeu(uuid, text) to authenticated;

-- 3. Pergunta 2: "Quem você contratou?" ------------------------------------------------------------------------------

create table if not exists privado.quem_contratou (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  autor_id uuid not null references public.perfis (id) on delete cascade,
  -- encerrar ou preenchida (de onde veio a resposta)
  quando text not null check (quando in ('encerrar', 'preenchida')),
  ninguem boolean not null default false,
  perfis uuid[] not null default '{}',
  respondido_em timestamptz not null default now()
);
create index if not exists quem_contratou_respondido_idx on privado.quem_contratou (respondido_em desc);
alter table privado.quem_contratou enable row level security;
revoke all on privado.quem_contratou from public, anon, authenticated;

-- Só quem publicou. "Ninguém daqui" ou as pessoas (só quem deu match na vaga fica guardado); a última resposta vale.
create or replace function public.registrar_quem_contratou(p_anuncio uuid, p_perfis uuid[], p_ninguem boolean, p_quando text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v_perfis uuid[];
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = conta and a.tipo = 'vaga') then
    raise exception 'Não encontramos essa vaga entre as suas.' using errcode = 'P0002';
  end if;
  if p_quando is null or p_quando not in ('encerrar', 'preenchida') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct cu.perfil_id), '{}') into v_perfis
    from public.curtidas cu
   where cu.anuncio_id = p_anuncio and cu.status = 'match' and cu.perfil_id = any (coalesce(p_perfis, '{}'));
  if not coalesce(p_ninguem, false) and cardinality(v_perfis) = 0 then
    raise exception 'Escolha quem foi contratado ou “Ninguém daqui”.' using errcode = '22023';
  end if;
  insert into privado.quem_contratou (anuncio_id, autor_id, quando, ninguem, perfis)
  values (p_anuncio, conta, p_quando, coalesce(p_ninguem, false) and cardinality(v_perfis) = 0,
          case when coalesce(p_ninguem, false) then '{}' else v_perfis end)
  on conflict (anuncio_id) do update
    set quando = excluded.quando, ninguem = excluded.ninguem, perfis = excluded.perfis, respondido_em = now();
end
$$;
revoke execute on function public.registrar_quem_contratou(uuid, uuid[], boolean, text) from public, anon;
grant execute on function public.registrar_quem_contratou(uuid, uuid[], boolean, text) to authenticated;

-- 4. Pergunta 3: 7 dias depois, "Começou a trabalhar?" e "Chamaria de novo?" -------------------------------------------

alter table public.conquistas add column if not exists empresa_perguntada_em timestamptz;
alter table public.conquistas add column if not exists chamaria boolean;
alter table public.conquistas add column if not exists chamaria_em timestamptz;

-- A conquista (20270322120000), agora 7 dias depois do contato (era 5) ou 7 dias depois de ir para Contratado; e,
-- para quem publicou, a pergunta de 7 dias depois de pôr alguém em Contratado.
create or replace function public.servidor_perguntar_conquistas(p_chave text, p_limite integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  n integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  -- os matches de vaga de 7 a 60 dias atrás entram na lista (uma vez cada); quem foi para Contratado há menos de 7
  -- dias espera os 7 dias
  insert into public.conquistas (anuncio_id, perfil_id, proxima_pergunta_em)
  select cu.anuncio_id, cu.perfil_id, now()
    from public.curtidas cu
    join public.anuncios a on a.id = cu.anuncio_id and a.tipo = 'vaga'
   where cu.status = 'match'
     and coalesce(cu.respondida_em, cu.criado_em) between now() - interval '60 days' and now() - interval '7 days'
     and cu.perfil_id <> a.autor_id
     and not exists (select 1 from public.conquistas x where x.anuncio_id = cu.anuncio_id and x.perfil_id = cu.perfil_id)
     and not exists (select 1 from public.etapas_candidatos e
                      where e.anuncio_id = cu.anuncio_id and e.perfil_id = cu.perfil_id and e.etapa = 'contratado'
                        and e.atualizado_em > now() - interval '7 days')
   limit 500
  on conflict do nothing;

  for c in
    select x.anuncio_id, x.perfil_id, a.titulo, a.autor_id, pa.nome as empresa
      from public.conquistas x
      join public.curtidas cu on cu.anuncio_id = x.anuncio_id and cu.perfil_id = x.perfil_id and cu.status = 'match'
      join public.anuncios a on a.id = x.anuncio_id
      join public.perfis pa on pa.id = a.autor_id
      join public.perfis pp on pp.id = x.perfil_id
     where (x.resposta is null or x.resposta = 'ainda_nao')
       and x.perguntas < 3
       and x.proxima_pergunta_em <= now()
       and x.empresa is distinct from 'negou'
       and (pp.suspenso_ate is null or pp.suspenso_ate <= now())
       and not exists (select 1 from public.etapas_candidatos e
                        where e.anuncio_id = x.anuncio_id and e.perfil_id = x.perfil_id and e.etapa = 'contratado'
                          and e.atualizado_em > now() - interval '7 days')
     order by x.proxima_pergunta_em
     limit least(greatest(coalesce(p_limite, 100), 1), 500)
  loop
    delete from public.notificacoes nt
     where nt.destinatario_id = c.perfil_id and nt.anuncio_id = c.anuncio_id and nt.tipo = 'conquista_pergunta';
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (c.perfil_id, 'conquista_pergunta', c.anuncio_id, c.autor_id,
            'Deu certo com ' || coalesce(c.empresa, 'a empresa') || '? Você começou a trabalhar na vaga “'
            || c.titulo || '”? Conte para a gente.');
    update public.conquistas x
       set perguntas = x.perguntas + 1, proxima_pergunta_em = now() + interval '7 days'
     where x.anuncio_id = c.anuncio_id and x.perfil_id = c.perfil_id;
    n := n + 1;
  end loop;

  -- para quem publicou: 7 dias depois de pôr alguém em Contratado (uma vez por pessoa, nos últimos 60 dias), se a
  -- empresa ainda não confirmou nem negou
  for c in
    select e.anuncio_id, e.perfil_id, a.titulo, a.autor_id, pp.nome
      from public.etapas_candidatos e
      join public.anuncios a on a.id = e.anuncio_id and a.tipo = 'vaga' and a.status <> 'removido'
      join public.curtidas cu on cu.anuncio_id = e.anuncio_id and cu.perfil_id = e.perfil_id
      join public.perfis pp on pp.id = e.perfil_id
      join public.perfis pa on pa.id = a.autor_id
     where e.etapa = 'contratado'
       and e.atualizado_em between now() - interval '60 days' and now() - interval '7 days'
       and e.perfil_id <> a.autor_id
       and (pa.suspenso_ate is null or pa.suspenso_ate <= now())
       and not exists (select 1 from public.conquistas x
                        where x.anuncio_id = e.anuncio_id and x.perfil_id = e.perfil_id
                          and (x.empresa_perguntada_em is not null or x.empresa is not null))
     order by e.atualizado_em
     limit least(greatest(coalesce(p_limite, 100), 1), 500)
  loop
    insert into public.conquistas (anuncio_id, perfil_id, proxima_pergunta_em, empresa_perguntada_em)
    values (c.anuncio_id, c.perfil_id, now(), now())
    on conflict (anuncio_id, perfil_id) do update set empresa_perguntada_em = now();
    delete from public.notificacoes nt
     where nt.destinatario_id = c.autor_id and nt.anuncio_id = c.anuncio_id and nt.ator_id = c.perfil_id
       and nt.tipo = 'conquista_confirmar';
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
    values (c.autor_id, 'conquista_confirmar', c.anuncio_id, c.perfil_id,
            coalesce(privado.nome_da_conquista(c.nome), 'A pessoa') || ' começou a trabalhar com vocês, pela vaga “'
            || c.titulo || '”? E chamaria de novo? Conte para a gente: é o começo da reputação de quem trabalha.',
            '/painel/anuncio/' || c.anuncio_id || '#conquistas');
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function public.servidor_perguntar_conquistas(text, integer) from public;
grant execute on function public.servidor_perguntar_conquistas(text, integer) to anon, authenticated, service_role;

-- Para a empresa: quem disse que começou ("confirmar") e quem a empresa pôs em Contratado há 7 dias ("comecou"), e,
-- depois do sim, o "Chamaria de novo?" ("chamaria").
drop function if exists public.conquistas_para_confirmar(uuid);
create or replace function public.conquistas_para_confirmar(p_anuncio uuid default null)
returns table (anuncio_id uuid, perfil_id uuid, titulo text, nome text, foto text, respondida_em timestamptz,
               pergunta text)
language sql
stable
security definer
set search_path = ''
as $$
  select x.anuncio_id, x.perfil_id, a.titulo, p.nome, p.foto,
         coalesce(x.respondida_em, x.empresa_perguntada_em, x.empresa_em),
         case when x.empresa = 'confirmou' then 'chamaria'
              when x.resposta = 'comecei' then 'confirmar'
              else 'comecou' end
    from public.conquistas x
    join public.anuncios a on a.id = x.anuncio_id
    join public.perfis p on p.id = x.perfil_id
   where a.autor_id = (select public.conta_atual())
     and (p_anuncio is null or x.anuncio_id = p_anuncio)
     and ((x.empresa is null and (x.resposta = 'comecei' or x.empresa_perguntada_em is not null))
          or (x.empresa = 'confirmou' and x.chamaria is null and x.empresa_em > now() - interval '30 days'))
   order by 6 desc
   limit 50
$$;
revoke execute on function public.conquistas_para_confirmar(uuid) from public, anon;
grant execute on function public.conquistas_para_confirmar(uuid) to authenticated;

-- Confirmar (ou negar): vale também quando a empresa foi perguntada antes de a pessoa contar.
create or replace function public.confirmar_conquista(p_anuncio uuid, p_perfil uuid, p_sim boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
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
revoke execute on function public.confirmar_conquista(uuid, uuid, boolean) from public, anon;
grant execute on function public.confirmar_conquista(uuid, uuid, boolean) to authenticated;

-- "Chamaria de novo?": só depois de a empresa confirmar que a pessoa começou.
create or replace function public.chamaria_de_novo(p_anuncio uuid, p_perfil uuid, p_sim boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
begin
  if conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_sim is null then
    raise exception 'Resposta inválida.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = conta) then
    raise exception 'Essa vaga não é sua.' using errcode = '42501';
  end if;
  update public.conquistas c set chamaria = p_sim, chamaria_em = now()
   where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil and c.empresa = 'confirmou';
  if not found then
    raise exception 'Primeiro confirme que a pessoa começou a trabalhar.' using errcode = 'P0001';
  end if;
end
$$;
revoke execute on function public.chamaria_de_novo(uuid, uuid, boolean) from public, anon;
grant execute on function public.chamaria_de_novo(uuid, uuid, boolean) to authenticated;

-- 5. Admin › Retorno: as respostas das três perguntas nos últimos N dias ---------------------------------------------

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
        'ninguem', count(*) filter (where q.ninguem))
       from privado.quem_contratou q, d where q.respondido_em >= d.desde),
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

-- 6. Os e-mails ----------------------------------------------------------------------------------------------------

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('te_respondeu', 'usuarios', 54, 'A empresa te respondeu?',
     'Para quem entrou em contato numa vaga: 2 dias depois, o Publike pergunta se a empresa respondeu. No máximo 2 vezes por vaga.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     '{{quem}} te respondeu?',
     E'Oi, {{nome}}.\n\n{{motivo}}\n\nSe ainda não responderam, a gente avisa a empresa e mostra outras vagas parecidas para você.',
     'Responder'),
    ('ainda_espera', 'usuarios', 55, 'Candidato ainda espera resposta',
     'Para quem publicou a vaga: a pessoa contou que ainda espera o retorno. No máximo um aviso a cada 3 dias por pessoa.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     '{{quem}} ainda espera o seu retorno',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver o candidato')
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

-- o e-mail da conquista dizia "5 dias depois"
update public.modelos_email set descricao = replace(descricao, '5 dias depois', '7 dias depois')
 where chave = 'conquista_pergunta' and descricao like '%5 dias depois%';

notify pgrst, 'reload schema';
