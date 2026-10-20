-- Finalistas para o cliente (19/10/2026). Pode rodar de novo sem problema.
-- A agência escolhe, numa vaga, quem já deu match e manda um link ao cliente (a empresa da
-- vaga). O cliente abre sem conta e vê de cada finalista o currículo (sem telefone, e-mail,
-- WhatsApp nem o PDF, que pode ter contato), as respostas da vaga e o parecer da agência.
-- Ele responde "quero entrevistar" ou "não seguir", com um comentário; a agência vê no quadro
-- e recebe um aviso. O link vale 30 dias: a agência renova ou troca (o antigo para de abrir).
-- Quem desfaz o match sai da lista do cliente na hora.

-- 1. Tabelas -----------------------------------------------------------------------------

create table if not exists public.finalistas (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null,
  perfil_id uuid not null,
  -- o que a agência escreve sobre a pessoa para o cliente
  parecer text check (parecer is null or char_length(parecer) <= 2000),
  -- a resposta do cliente
  decisao text check (decisao in ('entrevistar', 'nao_seguir')),
  comentario text check (comentario is null or char_length(comentario) <= 600),
  quem text check (quem is null or char_length(quem) <= 80),
  decidido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (anuncio_id, perfil_id),
  foreign key (anuncio_id, perfil_id) references public.curtidas (anuncio_id, perfil_id) on delete cascade
);
alter table public.finalistas enable row level security;
revoke all on public.finalistas from anon, authenticated;
grant select on public.finalistas to authenticated;
grant select, insert, update, delete on public.finalistas to service_role;

drop policy if exists "quem publicou vê os finalistas" on public.finalistas;
create policy "quem publicou vê os finalistas" on public.finalistas
  for select to authenticated
  using (exists (select 1 from public.anuncios a where a.id = anuncio_id and a.autor_id = (select auth.uid())));

-- Um link por vaga. O token fica guardado (a agência copia de novo quando quiser) e só ela lê.
create table if not exists public.links_finalistas (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '30 days',
  -- quando o cliente abriu pela última vez, e quantas vezes
  aberto_em timestamptz,
  aberturas integer not null default 0
);
alter table public.links_finalistas enable row level security;
revoke all on public.links_finalistas from anon, authenticated;
grant select on public.links_finalistas to authenticated;
grant select, insert, update, delete on public.links_finalistas to service_role;

drop policy if exists "quem publicou vê o link dos finalistas" on public.links_finalistas;
create policy "quem publicou vê o link dos finalistas" on public.links_finalistas
  for select to authenticated
  using (exists (select 1 from public.anuncios a where a.id = anuncio_id and a.autor_id = (select auth.uid())));

-- 2. Avisos ------------------------------------------------------------------------------
-- "finalistas": o cliente respondeu (vai para a agência, com e-mail)

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas'));

create or replace function privado.notificacao_por_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_nota text;
  v_quem text;
  v_autor uuid;
  v_motivo text;
  v_futuro boolean;
  v_depois text;
begin
  select a.titulo, a.nota_moderacao, a.autor_id into v_titulo, v_nota, v_autor
    from public.anuncios a where a.id = new.anuncio_id;
  select p.nome into v_quem from public.perfis p where p.id = new.ator_id;
  if new.tipo = 'match_desfeito' then
    select public.rotulo_motivo_desfeito(d.motivo), d.futuro into v_motivo, v_futuro
      from public.matches_desfeitos d
     where d.anuncio_id = new.anuncio_id and d.desfeito_por = new.ator_id
     order by d.id desc limit 1;
    if v_futuro then
      v_depois := coalesce(v_quem, 'A outra pessoa') || ' disse que topa negociar com você em outro momento. '
                  || case when new.destinatario_id = v_autor
                          then 'Se quiser, dá para dar match de novo na lista de interessados.'
                          else 'Se ainda tiver interesse, dá para curtir o anúncio de novo.' end;
    end if;
  end if;
  if new.tipo in ('etapa', 'seguindo', 'recomendacao', 'contratacao', 'entrevista', 'entrevista_resposta', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas') then
    v_motivo := new.texto;
  end if;
  perform privado.enfileirar_email(new.destinatario_id, new.tipo, jsonb_build_object(
    'quem', coalesce(v_quem, 'Alguém'),
    'titulo', coalesce(v_titulo, ''),
    'motivo', coalesce(v_motivo, v_nota, ''),
    'depois', coalesce(v_depois, ''),
    'caminho', case new.tipo
                 when 'curtida' then '/painel/anuncio/' || new.anuncio_id
                 when 'match' then '/painel/matches'
                 when 'liberado' then '/anuncio/' || new.anuncio_id
                 when 'removido' then '/privacidade#regras'
                 when 'avaliacao' then '/painel/avaliacoes'
                 when 'avaliacao_retida' then '/privacidade#regras'
                 when 'match_desfeito' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/anuncio/' || new.anuncio_id end
                 when 'etapa' then '/painel/curtidas'
                 when 'mensagem' then '/painel/conversas/' || new.anuncio_id || '/' || new.ator_id
                 when 'seguindo' then '/anuncio/' || new.anuncio_id
                 when 'busca' then '/anuncio/' || new.anuncio_id
                 when 'convite' then '/anuncio/' || new.anuncio_id
                 when 'vaga_preenchida' then '/?tipo=vaga'
                 when 'recomendacao' then '/perfil/' || new.destinatario_id || '#recomendacoes'
                 when 'contratacao' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/painel/curtidas' end
                 when 'entrevista' then '/anuncio/' || new.anuncio_id
                 when 'entrevista_resposta' then '/painel/anuncio/' || new.anuncio_id || '/quadro'
                 when 'aceite_curriculo' then '/perfil/curriculo?next=%2Fanuncio%2F' || new.anuncio_id
                 when 'curriculo_recebido' then '/painel/anuncio/' || new.anuncio_id || '#candidato-' || new.ator_id
                 when 'finalistas' then '/painel/anuncio/' || new.anuncio_id || '/finalistas'
                 else '/painel'
               end));
  return null;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('finalistas', 'usuarios', 24, 'O cliente respondeu sobre os finalistas',
     'Quando o cliente da agência responde no link dos finalistas (quero entrevistar ou não seguir). Respostas seguidas viram um aviso só.',
     array['nome', 'titulo', 'motivo', 'link'],
     'O cliente respondeu sobre “{{titulo}}”',
     'Oi, {{nome}}.

{{motivo}}

Veja as respostas e os comentários no Publike.',
     'Ver as respostas')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- 3. A agência ---------------------------------------------------------------------------

-- A vaga é de quem está logado (e a conta está ativa). Devolve o título.
create or replace function privado.minha_vaga_para_finalistas(p_anuncio uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_titulo text;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select a.titulo into v_titulo from public.anuncios a where a.id = p_anuncio and a.autor_id = eu and a.tipo = 'vaga';
  if v_titulo is null then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  return v_titulo;
end
$$;
revoke execute on function privado.minha_vaga_para_finalistas(uuid) from public, anon, authenticated;

-- Põe na lista quem já deu match (os outros ficam de fora, sem erro). A pessoa recebe um aviso:
-- o currículo dela foi mostrado à empresa da vaga. Devolve quantos entraram.
create or replace function public.adicionar_finalistas(p_anuncio uuid, p_perfis uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_titulo text := privado.minha_vaga_para_finalistas(p_anuncio);
  v_texto text;
  p uuid;
  n integer := 0;
begin
  if cardinality(coalesce(p_perfis, '{}')) > 100 then
    raise exception 'Escolha até 100 pessoas de uma vez.' using errcode = '22023';
  end if;
  if (select count(*) from public.finalistas f where f.anuncio_id = p_anuncio)
     + cardinality(coalesce(p_perfis, '{}')) > 200 then
    raise exception 'A lista de finalistas desta vaga chegou a 200 pessoas.' using errcode = 'P0001';
  end if;
  v_texto := left('Boa notícia: seu currículo foi enviado para a empresa da vaga “' || v_titulo || '”.', 300);
  foreach p in array coalesce(p_perfis, '{}') loop
    insert into public.finalistas (anuncio_id, perfil_id)
    select c.anuncio_id, c.perfil_id
      from public.curtidas c
     where c.anuncio_id = p_anuncio and c.perfil_id = p and c.status = 'match'
    on conflict (anuncio_id, perfil_id) do nothing;
    if found then
      n := n + 1;
      -- um aviso por vaga: se ainda não viu um aviso de etapa desta vaga da última hora, troca o texto
      update public.notificacoes x
         set texto = v_texto, criado_em = now()
       where x.destinatario_id = p and x.tipo = 'etapa' and x.anuncio_id = p_anuncio
         and not x.lida and x.criado_em > now() - interval '1 hour';
      if not found then
        insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
        values (p, 'etapa', p_anuncio, eu, v_texto);
      end if;
    end if;
  end loop;
  return n;
end
$$;

create or replace function public.tirar_finalista(p_anuncio uuid, p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.minha_vaga_para_finalistas(p_anuncio);
  delete from public.finalistas f where f.anuncio_id = p_anuncio and f.perfil_id = p_perfil;
end
$$;

create or replace function public.salvar_parecer_finalista(p_anuncio uuid, p_perfil uuid, p_parecer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parecer text := nullif(btrim(coalesce(p_parecer, '')), '');
begin
  perform privado.minha_vaga_para_finalistas(p_anuncio);
  if char_length(v_parecer) > 2000 then
    raise exception 'O parecer passa de 2000 letras.' using errcode = '22023';
  end if;
  update public.finalistas f
     set parecer = v_parecer, atualizado_em = now()
   where f.anuncio_id = p_anuncio and f.perfil_id = p_perfil;
  if not found then
    raise exception 'Essa pessoa não está na lista de finalistas.' using errcode = 'P0001';
  end if;
end
$$;

-- O link da vaga: "pegar" cria se não existe; "renovar" dá mais 30 dias ao mesmo link;
-- "trocar" faz um link novo (o antigo para de abrir), também por 30 dias.
create or replace function public.link_dos_finalistas(p_anuncio uuid, p_acao text default 'pegar')
returns table (token text, expira_em timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  novo text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  perform privado.minha_vaga_para_finalistas(p_anuncio);
  if p_acao not in ('pegar', 'renovar', 'trocar') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  insert into public.links_finalistas as l (anuncio_id, token)
  values (p_anuncio, novo)
  on conflict (anuncio_id) do update
    set token = case when p_acao = 'trocar' then novo else l.token end,
        expira_em = case when p_acao in ('renovar', 'trocar') then now() + interval '30 days' else l.expira_em end,
        criado_em = case when p_acao = 'trocar' then now() else l.criado_em end,
        aberto_em = case when p_acao = 'trocar' then null else l.aberto_em end,
        aberturas = case when p_acao = 'trocar' then 0 else l.aberturas end;
  return query select l.token, l.expira_em from public.links_finalistas l where l.anuncio_id = p_anuncio;
end
$$;

revoke execute on function public.adicionar_finalistas(uuid, uuid[]),
                          public.tirar_finalista(uuid, uuid),
                          public.salvar_parecer_finalista(uuid, uuid, text),
                          public.link_dos_finalistas(uuid, text) from public, anon;
grant execute on function public.adicionar_finalistas(uuid, uuid[]),
                          public.tirar_finalista(uuid, uuid),
                          public.salvar_parecer_finalista(uuid, uuid, text),
                          public.link_dos_finalistas(uuid, text) to authenticated;

-- 4. O cliente (sem conta, pelo link) ------------------------------------------------------

-- A situação do link: 'valido', 'expirado' ou 'indisponivel' (vaga removida pela moderação ou
-- agência suspensa). Sem link: null.
create or replace function privado.situacao_link_finalistas(l public.links_finalistas)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when l.anuncio_id is null then null
    when exists (select 1 from public.anuncios a where a.id = l.anuncio_id and a.status = 'removido') then 'indisponivel'
    when exists (
      select 1 from public.anuncios a
        join public.suspensoes s on s.usuario_id = a.autor_id
       where a.id = l.anuncio_id and s.encerrada_em is null and s.fim > now()
    ) then 'indisponivel'
    when l.expira_em < now() then 'expirado'
    else 'valido'
  end
$$;
revoke execute on function privado.situacao_link_finalistas(public.links_finalistas) from public, anon, authenticated;

-- Tudo o que a página do cliente mostra. Nada de contato: nem telefone, nem e-mail, nem o PDF.
create or replace function public.finalistas_do_link(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.links_finalistas;
  v_situacao text;
  v_previa boolean;
  r jsonb;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into l from public.links_finalistas x where x.token = p_token;
  if not found then
    return null;
  end if;
  v_situacao := privado.situacao_link_finalistas(l);
  -- a própria agência olhando ("ver como o cliente"): não conta como o cliente abrindo
  v_previa := exists (select 1 from public.anuncios a where a.id = l.anuncio_id and a.autor_id = (select auth.uid()));
  if v_situacao = 'valido' and not v_previa then
    update public.links_finalistas x
       set aberto_em = now(), aberturas = x.aberturas + 1
     where x.anuncio_id = l.anuncio_id;
  end if;
  select jsonb_build_object(
    'situacao', v_situacao,
    'previa', v_previa,
    'expira_em', l.expira_em,
    'agencia', jsonb_build_object('nome', p.nome, 'foto', p.foto, 'verificado', p.verificado),
    'vaga', case when v_situacao = 'valido' then jsonb_build_object(
      'titulo', a.titulo,
      'cidade', a.cidade,
      'bairro', a.bairro,
      'regime', a.regime,
      'cliente', coalesce(ca.nome, nullif(btrim(a.contratante), '')),
      'perguntas', coalesce(a.perguntas, '[]'::jsonb)
    ) end,
    'finalistas', case when v_situacao = 'valido' then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id,
               'nome', pf.nome,
               'foto', pf.foto,
               'cidade', pf.cidade,
               'bairro', pf.bairro,
               'parecer', f.parecer,
               'decisao', f.decisao,
               'comentario', f.comentario,
               'quem', f.quem,
               'decidido_em', f.decidido_em,
               'respostas', c.respostas,
               'curriculo', case when cv.perfil_id is null then null else jsonb_build_object(
                 'titulo', cv.titulo,
                 'habilidades', cv.habilidades,
                 'escolaridade', cv.escolaridade,
                 'curso', cv.curso,
                 'estudos', cv.estudos,
                 'experiencias', cv.experiencias,
                 'cursos', cv.cursos,
                 'cnh', cv.cnh,
                 'disponibilidade', cv.disponibilidade,
                 'atualizado_em', cv.atualizado_em
               ) end
             ) order by f.criado_em, f.id)
        from public.finalistas f
        join public.curtidas c on c.anuncio_id = f.anuncio_id and c.perfil_id = f.perfil_id
        join public.perfis pf on pf.id = f.perfil_id
        left join public.curriculos cv on cv.perfil_id = f.perfil_id
       where f.anuncio_id = a.id and c.status = 'match'
    ), '[]'::jsonb) end
  ) into r
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join public.clientes_agencia ca on ca.id = a.cliente_id
   where a.id = l.anuncio_id;
  return r;
end
$$;

-- O cliente responde sobre um finalista. Respostas seguidas viram um aviso só para a agência
-- (o texto conta quantos ele quer entrevistar e quantos não seguem). Devolve 'ok', 'expirado'
-- ou 'invalido'.
create or replace function public.responder_finalista(
  p_token text,
  p_id uuid,
  p_decisao text,
  p_comentario text default null,
  p_quem text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.links_finalistas;
  v_situacao text;
  v_comentario text := nullif(btrim(coalesce(p_comentario, '')), '');
  v_quem text := nullif(btrim(regexp_replace(coalesce(p_quem, ''), '\s+', ' ', 'g')), '');
  v_autor uuid;
  v_titulo text;
  v_entrevistar integer;
  v_nao integer;
  v_texto text;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' or p_id is null then
    return 'invalido';
  end if;
  if p_decisao is not null and p_decisao not in ('entrevistar', 'nao_seguir') then
    return 'invalido';
  end if;
  select * into l from public.links_finalistas x where x.token = p_token;
  if not found then
    return 'invalido';
  end if;
  v_situacao := privado.situacao_link_finalistas(l);
  if v_situacao <> 'valido' then
    return case when v_situacao = 'expirado' then 'expirado' else 'invalido' end;
  end if;
  update public.finalistas f
     set decisao = p_decisao,
         comentario = left(v_comentario, 600),
         quem = left(v_quem, 80),
         decidido_em = case when p_decisao is null and v_comentario is null then null else now() end,
         atualizado_em = now()
   where f.id = p_id
     and f.anuncio_id = l.anuncio_id
     and exists (select 1 from public.curtidas c
                  where c.anuncio_id = f.anuncio_id and c.perfil_id = f.perfil_id and c.status = 'match');
  if not found then
    return 'invalido';
  end if;

  select a.autor_id, a.titulo into v_autor, v_titulo from public.anuncios a where a.id = l.anuncio_id;
  select count(*) filter (where f.decisao = 'entrevistar'), count(*) filter (where f.decisao = 'nao_seguir')
    into v_entrevistar, v_nao
    from public.finalistas f where f.anuncio_id = l.anuncio_id;
  v_texto := left(coalesce(v_quem, 'O cliente') || ' respondeu sobre os finalistas de “' || v_titulo || '”: '
                  || v_entrevistar || ' para entrevistar e ' || v_nao || ' para não seguir.', 300);
  -- respondendo um atrás do outro: troca o aviso que a agência ainda não viu, sem outro e-mail
  update public.notificacoes n
     set texto = v_texto, criado_em = now()
   where n.destinatario_id = v_autor and n.tipo = 'finalistas' and n.anuncio_id = l.anuncio_id
     and not n.lida and n.criado_em > now() - interval '2 hours';
  if not found then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (v_autor, 'finalistas', l.anuncio_id, null, v_texto);
  end if;
  return 'ok';
end
$$;

revoke execute on function public.finalistas_do_link(text),
                          public.responder_finalista(text, uuid, text, text, text) from public;
grant execute on function public.finalistas_do_link(text),
                          public.responder_finalista(text, uuid, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
