-- Entrevista gravada com IA (claude/plano-recursos-concorrentes.md, parte 2). Pode rodar de novo.
-- A empresa monta de 2 a 6 perguntas na vaga e pede a entrevista a quem curtiu (ou a todo novo candidato). O
-- candidato grava cada resposta pelo celular (ou responde por texto, quando a empresa deixa; em vaga exclusiva
-- para PCD, sempre) e envia; a IA transcreve e resume (pelo servidor, `servidor_video_guardar_ia`). Os vídeos
-- ficam no bucket privado `entrevistas-video` (`<pessoa>/<entrevista>/<pergunta>-<n>.<ext>`): a pessoa vê os seus;
-- a conta da vaga vê os da vaga até 6 meses depois que a vaga sai do ar (`privado.video_vence_em`). Depois
-- disso, ninguém abre, e os arquivos são apagados pela empresa (ao abrir o painel) ou pelo Admin.
-- Recurso pago `video` (migração 20270104120000).

-- 1. Tabelas ----------------------------------------------------------------------------------------
create table if not exists public.video_perguntas (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  -- [{"id": "p1", "texto": "..."}], de 2 a 6
  perguntas jsonb not null default '[]'::jsonb,
  segundos smallint not null default 90 check (segundos between 30 and 180),
  segunda_chance boolean not null default true,
  aceita_texto boolean not null default true,
  pedir_a_todos boolean not null default false,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.entrevistas_video (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null,
  perfil_id uuid not null,
  -- as perguntas e as regras de quando foi pedida (mudar a vaga depois não muda o pedido)
  perguntas jsonb not null,
  segundos smallint not null,
  segunda_chance boolean not null,
  aceita_texto boolean not null,
  situacao text not null default 'pedida'
    check (situacao in ('pedida', 'respondendo', 'enviada', 'vencida', 'apagada')),
  pedida_em timestamptz not null default now(),
  prazo timestamptz not null default now() + interval '5 days',
  lembrado_em timestamptz,
  enviada_em timestamptz,
  -- o resumo da IA: {"resumo": "...", "fortes": [...], "conferir": [...]}
  resumo jsonb,
  ia_em timestamptz,
  -- os arquivos foram apagados (o prazo de 6 meses passou); a transcrição e o resumo ficam
  videos_apagados_em timestamptz,
  unique (anuncio_id, perfil_id),
  foreign key (anuncio_id, perfil_id) references public.curtidas (anuncio_id, perfil_id) on delete cascade
);
create index if not exists entrevistas_video_prazo on public.entrevistas_video (prazo) where situacao in ('pedida', 'respondendo');

create table if not exists public.entrevistas_video_respostas (
  entrevista_id uuid not null references public.entrevistas_video (id) on delete cascade,
  pergunta_id text not null,
  vista_em timestamptz not null default now(),
  tipo text check (tipo in ('video', 'texto')),
  caminho text,
  duracao smallint,
  tentativas smallint not null default 0,
  texto text check (char_length(texto) <= 2000),
  transcricao text,
  respondida_em timestamptz,
  primary key (entrevista_id, pergunta_id)
);

alter table public.video_perguntas enable row level security;
alter table public.entrevistas_video enable row level security;
alter table public.entrevistas_video_respostas enable row level security;
-- tudo pelas funções abaixo
revoke all on public.video_perguntas, public.entrevistas_video, public.entrevistas_video_respostas from public, anon, authenticated;

-- 2. O bucket e quem abre -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entrevistas-video', 'entrevistas-video', false, 41943040, array['video/*'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- até quando a conta da vaga vê os vídeos: 6 meses depois que a vaga sai do ar (o fim do prazo ou o preenchimento)
create or replace function privado.video_vence_em(p_entrevista uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(coalesce(e.enviada_em, e.pedida_em), least(a.expira_em, coalesce(a.preenchida_em, a.expira_em)))
         + interval '6 months'
    from public.entrevistas_video e join public.anuncios a on a.id = e.anuncio_id
   where e.id = p_entrevista
$$;

create or replace function privado.video_pode_enviar(p_entrevista text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_entrevista ~ '^[0-9a-f-]{36}$' and exists (
    select 1 from public.entrevistas_video e
     where e.id = p_entrevista::uuid and e.perfil_id = (select auth.uid())
       and e.situacao in ('pedida', 'respondendo') and e.prazo > now())
$$;

create or replace function privado.video_pode_ver(p_entrevista text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_entrevista ~ '^[0-9a-f-]{36}$' and exists (
    select 1 from public.entrevistas_video e join public.anuncios a on a.id = e.anuncio_id
     where e.id = p_entrevista::uuid
       and (e.perfil_id = (select auth.uid())
            or (a.autor_id = public.conta_atual() and e.situacao = 'enviada'
                and now() < privado.video_vence_em(e.id))))
$$;

-- a conta da vaga apaga os vídeos vencidos (ao abrir o painel), mesmo sem poder abrir
create or replace function privado.video_pode_apagar(p_entrevista text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_entrevista ~ '^[0-9a-f-]{36}$' and exists (
    select 1 from public.entrevistas_video e join public.anuncios a on a.id = e.anuncio_id
     where e.id = p_entrevista::uuid
       and (e.perfil_id = (select auth.uid()) or a.autor_id = public.conta_atual()))
$$;

drop policy if exists "publike: entrevista em vídeo, enviar" on storage.objects;
drop policy if exists "publike: entrevista em vídeo, ver" on storage.objects;
drop policy if exists "publike: entrevista em vídeo, apagar" on storage.objects;
create policy "publike: entrevista em vídeo, enviar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'entrevistas-video'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and privado.video_pode_enviar((storage.foldername(name))[2]));
create policy "publike: entrevista em vídeo, ver" on storage.objects
  for select to authenticated
  using (bucket_id = 'entrevistas-video' and privado.video_pode_ver((storage.foldername(name))[2]));
create policy "publike: entrevista em vídeo, apagar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'entrevistas-video' and privado.video_pode_apagar((storage.foldername(name))[2]));

-- 3. Para a empresa ------------------------------------------------------------------------------------
create or replace function privado.minha_vaga_para_video(p_anuncio uuid)
returns public.anuncios
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
begin
  select * into a from public.anuncios x where x.id = p_anuncio and x.autor_id = public.conta_atual() and x.tipo = 'vaga';
  if a.id is null then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  return a;
end
$$;

create or replace function public.video_config(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_video(p_anuncio);
  c public.video_perguntas;
begin
  select * into c from public.video_perguntas v where v.anuncio_id = a.id;
  return jsonb_build_object(
    'perguntas', coalesce(c.perguntas, '[]'::jsonb),
    'segundos', coalesce(c.segundos, 90),
    'segunda_chance', coalesce(c.segunda_chance, true),
    'aceita_texto', coalesce(c.aceita_texto, true) or a.pcd = 'exclusiva',
    'pedir_a_todos', coalesce(c.pedir_a_todos, false),
    'pcd', a.pcd = 'exclusiva',
    'liberado', privado.video_liberado(public.conta_atual()));
end
$$;

create or replace function public.video_salvar_config(p_anuncio uuid, p_perguntas text[], p_segundos integer,
                                                      p_segunda_chance boolean, p_aceita_texto boolean,
                                                      p_pedir_a_todos boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_video(p_anuncio);
  v_lista jsonb := '[]'::jsonb;
  t text;
  i integer := 0;
begin
  perform privado.exigir_conta_ativa();
  perform privado.exigir_video();
  foreach t in array coalesce(p_perguntas, '{}') loop
    t := nullif(btrim(regexp_replace(coalesce(t, ''), '[[:space:]]+', ' ', 'g')), '');
    continue when t is null;
    if char_length(t) < 10 or char_length(t) > 300 then
      raise exception 'Cada pergunta tem de 10 a 300 letras.' using errcode = '22023', hint = 'perguntas';
    end if;
    if t ~* '(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|[0-9][0-9 ().-]{7,}[0-9])' then
      raise exception 'Tire telefone, e-mail e link das perguntas.' using errcode = '22023', hint = 'perguntas';
    end if;
    i := i + 1;
    v_lista := v_lista || jsonb_build_object('id', 'p' || i, 'texto', t);
  end loop;
  if i < 2 or i > 6 then
    raise exception 'Faça de 2 a 6 perguntas.' using errcode = '22023', hint = 'perguntas';
  end if;
  insert into public.video_perguntas (anuncio_id, perguntas, segundos, segunda_chance, aceita_texto, pedir_a_todos, atualizado_em)
  values (a.id, v_lista, greatest(30, least(180, coalesce(p_segundos, 90))), coalesce(p_segunda_chance, true),
          coalesce(p_aceita_texto, true) or a.pcd = 'exclusiva', coalesce(p_pedir_a_todos, false), now())
  on conflict (anuncio_id) do update
    set perguntas = excluded.perguntas, segundos = excluded.segundos, segunda_chance = excluded.segunda_chance,
        aceita_texto = excluded.aceita_texto, pedir_a_todos = excluded.pedir_a_todos, atualizado_em = now();
end
$$;

-- pede (ou pede de novo, a quem deixou vencer) e avisa; devolve quantos receberam o pedido
create or replace function privado.video_pedir_um(p_anuncio uuid, p_perfil uuid, p_quem uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.video_perguntas;
  v_titulo text;
  v_quem text;
  v_status text;
  v_atual text;
begin
  select * into c from public.video_perguntas v where v.anuncio_id = p_anuncio;
  if c.anuncio_id is null or jsonb_array_length(c.perguntas) < 2 then
    return false;
  end if;
  select k.status into v_status from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p_perfil;
  if v_status is null or v_status not in ('pendente', 'match') then
    return false;
  end if;
  select e.situacao into v_atual from public.entrevistas_video e where e.anuncio_id = p_anuncio and e.perfil_id = p_perfil;
  if v_atual is not null and v_atual <> 'vencida' then
    return false;
  end if;
  insert into public.entrevistas_video (anuncio_id, perfil_id, perguntas, segundos, segunda_chance, aceita_texto)
  values (p_anuncio, p_perfil, c.perguntas, c.segundos, c.segunda_chance,
          c.aceita_texto or exists (select 1 from public.anuncios a where a.id = p_anuncio and a.pcd = 'exclusiva'))
  on conflict (anuncio_id, perfil_id) do update
    set perguntas = excluded.perguntas, segundos = excluded.segundos, segunda_chance = excluded.segunda_chance,
        aceita_texto = excluded.aceita_texto, situacao = 'pedida', pedida_em = now(),
        prazo = now() + interval '5 days', lembrado_em = null, enviada_em = null, resumo = null, ia_em = null;
  delete from public.entrevistas_video_respostas r
   using public.entrevistas_video e
   where r.entrevista_id = e.id and e.anuncio_id = p_anuncio and e.perfil_id = p_perfil;
  select a.titulo, p.nome into v_titulo, v_quem
    from public.anuncios a join public.perfis p on p.id = a.autor_id where a.id = p_anuncio;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'video_pedido', p_anuncio, p_quem,
          left(coalesce(v_quem, 'A empresa') || ' pediu uma entrevista em vídeo para a vaga “' || v_titulo
               || '”: ' || jsonb_array_length(c.perguntas) || ' perguntas, pelo celular, em até 5 dias.', 300));
  return true;
end
$$;

create or replace function public.video_pedir(p_anuncio uuid, p_perfis uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_video(p_anuncio);
  p uuid;
  n integer := 0;
begin
  perform privado.exigir_conta_ativa();
  perform privado.exigir_video();
  if cardinality(coalesce(p_perfis, '{}')) > 100 then
    raise exception 'Escolha até 100 pessoas de uma vez.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.video_perguntas v where v.anuncio_id = a.id and jsonb_array_length(v.perguntas) >= 2) then
    raise exception 'Monte as perguntas da vaga primeiro, na aba Entrevista em vídeo.' using errcode = 'P0001', hint = 'sem_perguntas';
  end if;
  perform privado.conferir_limite('etapa', 300, 'Você mexeu em muitos candidatos hoje. Tente de novo amanhã.');
  foreach p in array coalesce(p_perfis, '{}') loop
    if privado.video_pedir_um(a.id, p, public.conta_atual()) then
      n := n + 1;
    end if;
  end loop;
  return n;
end
$$;

-- pedir a todos os novos: a curtida nova numa vaga com a regra ligada (e a conta com o recurso)
create or replace function privado.video_pedir_ao_curtir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor uuid;
begin
  select a.autor_id into v_autor from public.anuncios a
    join public.video_perguntas v on v.anuncio_id = a.id
   where a.id = new.anuncio_id and a.tipo = 'vaga' and v.pedir_a_todos;
  if v_autor is not null and privado.video_liberado(v_autor) then
    perform privado.video_pedir_um(new.anuncio_id, new.perfil_id, v_autor);
  end if;
  return null;
end
$$;
drop trigger if exists curtidas_pedir_video on public.curtidas;
create trigger curtidas_pedir_video after insert on public.curtidas
  for each row execute function privado.video_pedir_ao_curtir();

-- as entrevistas da vaga (para o quadro e a aba): sem os caminhos dos arquivos
create or replace function public.video_da_vaga(p_anuncio uuid)
returns table (id uuid, perfil_id uuid, situacao text, pedida_em timestamptz, prazo timestamptz,
               enviada_em timestamptz, resumo jsonb, videos_apagados boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_video(p_anuncio);
begin
  return query
  select e.id, e.perfil_id,
         case when e.situacao in ('pedida', 'respondendo') and e.prazo <= now() then 'vencida' else e.situacao end,
         e.pedida_em, e.prazo, e.enviada_em, e.resumo,
         e.videos_apagados_em is not null or now() >= privado.video_vence_em(e.id)
    from public.entrevistas_video e
   where e.anuncio_id = a.id;
end
$$;

-- uma entrevista enviada, para assistir: as perguntas, as respostas e os caminhos (o site cria os links)
create or replace function public.video_da_entrevista(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.entrevistas_video;
  v_vence timestamptz;
begin
  select x.* into e from public.entrevistas_video x join public.anuncios a on a.id = x.anuncio_id
   where x.id = p_id and (a.autor_id = public.conta_atual() or x.perfil_id = (select auth.uid()));
  if e.id is null then
    raise exception 'Entrevista não encontrada.' using errcode = '42501';
  end if;
  v_vence := privado.video_vence_em(e.id);
  return jsonb_build_object(
    'id', e.id, 'anuncio_id', e.anuncio_id, 'perfil_id', e.perfil_id, 'situacao', e.situacao,
    'enviada_em', e.enviada_em, 'resumo', e.resumo, 'ia_em', e.ia_em, 'vence_em', v_vence,
    'videos', e.videos_apagados_em is null and now() < v_vence,
    'respostas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pergunta_id', q ->> 'id', 'pergunta', q ->> 'texto', 'tipo', r.tipo,
               'caminho', case when e.videos_apagados_em is null and now() < v_vence then r.caminho end,
               'duracao', r.duracao, 'texto', r.texto, 'transcricao', r.transcricao) order by n)
        from jsonb_array_elements(e.perguntas) with ordinality as t(q, n)
        left join public.entrevistas_video_respostas r on r.entrevista_id = e.id and r.pergunta_id = q ->> 'id'),
      '[]'::jsonb));
end
$$;

-- 4. Para o candidato ----------------------------------------------------------------------------------
create or replace function public.video_minha(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.entrevistas_video;
  v_vaga text;
  v_empresa text;
begin
  select * into e from public.entrevistas_video x where x.anuncio_id = p_anuncio and x.perfil_id = (select auth.uid());
  if e.id is null then
    return null;
  end if;
  select a.titulo, p.nome into v_vaga, v_empresa
    from public.anuncios a join public.perfis p on p.id = a.autor_id where a.id = p_anuncio;
  return jsonb_build_object(
    'id', e.id, 'vaga', v_vaga, 'empresa', v_empresa,
    'situacao', case when e.situacao in ('pedida', 'respondendo') and e.prazo <= now() then 'vencida' else e.situacao end,
    'prazo', e.prazo, 'segundos', e.segundos, 'segunda_chance', e.segunda_chance, 'aceita_texto', e.aceita_texto,
    'enviada_em', e.enviada_em,
    'perguntas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q ->> 'id', 'ordem', n,
               -- a pergunta só aparece depois de vista (como no Teste Prático)
               'texto', case when r.entrevista_id is not null then q ->> 'texto' end,
               'vista', r.entrevista_id is not null, 'tipo', r.tipo, 'tentativas', coalesce(r.tentativas, 0),
               'caminho', r.caminho, 'duracao', r.duracao, 'resposta_texto', r.texto,
               'respondida', r.respondida_em is not null) order by n)
        from jsonb_array_elements(e.perguntas) with ordinality as t(q, n)
        left join public.entrevistas_video_respostas r on r.entrevista_id = e.id and r.pergunta_id = q ->> 'id'),
      '[]'::jsonb));
end
$$;

create or replace function privado.minha_entrevista_aberta(p_id uuid)
returns public.entrevistas_video
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.entrevistas_video;
begin
  select * into e from public.entrevistas_video x where x.id = p_id and x.perfil_id = (select auth.uid());
  if e.id is null then
    raise exception 'Entrevista não encontrada.' using errcode = '42501';
  end if;
  if e.situacao not in ('pedida', 'respondendo') then
    raise exception 'Esta entrevista já foi enviada ou não está mais aberta.' using errcode = 'P0001';
  end if;
  if e.prazo <= now() then
    raise exception 'O prazo desta entrevista acabou.' using errcode = 'P0001', hint = 'vencida';
  end if;
  return e;
end
$$;

create or replace function public.video_ver_pergunta(p_id uuid, p_pergunta text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.entrevistas_video := privado.minha_entrevista_aberta(p_id);
  v_texto text;
begin
  select q ->> 'texto' into v_texto from jsonb_array_elements(e.perguntas) q where q ->> 'id' = p_pergunta;
  if v_texto is null then
    raise exception 'Pergunta não encontrada.' using errcode = '22023';
  end if;
  insert into public.entrevistas_video_respostas (entrevista_id, pergunta_id) values (e.id, p_pergunta)
  on conflict (entrevista_id, pergunta_id) do nothing;
  update public.entrevistas_video set situacao = 'respondendo' where id = e.id and situacao = 'pedida';
  return v_texto;
end
$$;

-- a gravação já está no bucket: guarda o caminho; devolve o arquivo de antes (o site apaga)
create or replace function public.video_registrar(p_id uuid, p_pergunta text, p_caminho text, p_duracao integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.entrevistas_video := privado.minha_entrevista_aberta(p_id);
  r public.entrevistas_video_respostas;
begin
  select * into r from public.entrevistas_video_respostas x where x.entrevista_id = e.id and x.pergunta_id = p_pergunta;
  if r.entrevista_id is null then
    raise exception 'Veja a pergunta antes de gravar.' using errcode = 'P0001';
  end if;
  if r.tentativas >= (case when e.segunda_chance then 2 else 1 end) then
    raise exception 'Você já gravou esta resposta.' using errcode = 'P0001', hint = 'sem_tentativas';
  end if;
  if coalesce(p_caminho, '') not like (select auth.uid())::text || '/' || e.id::text || '/%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'entrevistas-video' and o.name = p_caminho) then
    raise exception 'A gravação não chegou. Tente enviar de novo.' using errcode = 'P0001', hint = 'sem_arquivo';
  end if;
  if p_duracao is null or p_duracao < 1 or p_duracao > e.segundos + 15 then
    raise exception 'A gravação passou do tempo.' using errcode = '22023';
  end if;
  update public.entrevistas_video_respostas
     set tipo = 'video', caminho = p_caminho, duracao = p_duracao, tentativas = tentativas + 1, texto = null,
         transcricao = null, respondida_em = now()
   where entrevista_id = e.id and pergunta_id = p_pergunta;
  return case when r.caminho is distinct from p_caminho then r.caminho end;
end
$$;

create or replace function public.video_responder_texto(p_id uuid, p_pergunta text, p_texto text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.entrevistas_video := privado.minha_entrevista_aberta(p_id);
  r public.entrevistas_video_respostas;
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  if not e.aceita_texto then
    raise exception 'Esta entrevista pede as respostas em vídeo.' using errcode = 'P0001';
  end if;
  select * into r from public.entrevistas_video_respostas x where x.entrevista_id = e.id and x.pergunta_id = p_pergunta;
  if r.entrevista_id is null then
    raise exception 'Veja a pergunta antes de responder.' using errcode = 'P0001';
  end if;
  if char_length(v_texto) < 10 or char_length(v_texto) > 2000 then
    raise exception 'Escreva de 10 a 2.000 letras.' using errcode = '22023';
  end if;
  update public.entrevistas_video_respostas
     set tipo = 'texto', texto = v_texto, caminho = null, duracao = null, transcricao = null, respondida_em = now()
   where entrevista_id = e.id and pergunta_id = p_pergunta;
  return r.caminho;
end
$$;

-- envia; devolve os caminhos dos vídeos (para a IA transcrever)
create or replace function public.video_enviar(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.entrevistas_video := privado.minha_entrevista_aberta(p_id);
  v_falta integer;
  v_autor uuid;
  v_titulo text;
  v_nome text;
begin
  select count(*) into v_falta
    from jsonb_array_elements(e.perguntas) q
    left join public.entrevistas_video_respostas r on r.entrevista_id = e.id and r.pergunta_id = q ->> 'id'
   where r.respondida_em is null;
  if v_falta > 0 then
    raise exception 'Responda todas as perguntas antes de enviar.' using errcode = 'P0001', hint = 'falta';
  end if;
  update public.entrevistas_video set situacao = 'enviada', enviada_em = now() where id = e.id;
  select a.autor_id, a.titulo into v_autor, v_titulo from public.anuncios a where a.id = e.anuncio_id;
  select split_part(p.nome, ' ', 1) into v_nome from public.perfis p where p.id = e.perfil_id;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (v_autor, 'video_enviado', e.anuncio_id, e.perfil_id,
          left(coalesce(v_nome, 'Um candidato') || ' respondeu a entrevista em vídeo da vaga “' || v_titulo || '”.', 300));
  return array(select r.caminho from public.entrevistas_video_respostas r
                where r.entrevista_id = e.id and r.tipo = 'video' and r.caminho is not null);
end
$$;

-- o candidato apaga tudo (os vídeos, as transcrições e o resumo); devolve os caminhos (o site apaga os arquivos)
create or replace function public.video_apagar(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.entrevistas_video;
  v_caminhos text[];
begin
  select * into e from public.entrevistas_video x where x.id = p_id and x.perfil_id = (select auth.uid());
  if e.id is null then
    raise exception 'Entrevista não encontrada.' using errcode = '42501';
  end if;
  v_caminhos := array(select r.caminho from public.entrevistas_video_respostas r
                       where r.entrevista_id = e.id and r.caminho is not null);
  delete from public.entrevistas_video_respostas where entrevista_id = e.id;
  update public.entrevistas_video set situacao = 'apagada', resumo = null, ia_em = null, videos_apagados_em = now()
   where id = e.id;
  return v_caminhos;
end
$$;

-- 5. O servidor: a IA, os prazos e os vídeos vencidos --------------------------------------------------
create or replace function public.servidor_video_guardar_ia(p_chave text, p_id uuid, p_transcricoes jsonb, p_resumo jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
begin
  perform privado.exigir_servidor(p_chave);
  for k in select jsonb_object_keys(coalesce(p_transcricoes, '{}'::jsonb)) loop
    update public.entrevistas_video_respostas
       set transcricao = left(p_transcricoes ->> k, 6000)
     where entrevista_id = p_id and pergunta_id = k;
  end loop;
  if p_resumo is not null then
    update public.entrevistas_video set resumo = p_resumo, ia_em = now() where id = p_id and situacao = 'enviada';
  end if;
end
$$;

create or replace function public.servidor_video_prazos(p_chave text, p_agora timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
  v_hora integer := extract(hour from (p_agora at time zone 'America/Sao_Paulo'))::integer;
begin
  perform privado.exigir_servidor(p_chave);
  update public.entrevistas_video set situacao = 'vencida'
   where situacao in ('pedida', 'respondendo') and prazo <= p_agora;
  -- o lembrete, uma vez, quando faltam 2 dias (das 8h às 20h)
  if v_hora between 8 and 19 then
    for r in
      select e.id, e.anuncio_id, e.perfil_id, a.autor_id, a.titulo, p.nome as empresa
        from public.entrevistas_video e
        join public.anuncios a on a.id = e.anuncio_id
        join public.perfis p on p.id = a.autor_id
       where e.situacao in ('pedida', 'respondendo') and e.lembrado_em is null
         and e.prazo > p_agora and e.prazo <= p_agora + interval '2 days'
       limit 300
    loop
      update public.entrevistas_video set lembrado_em = p_agora where id = r.id;
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
      values (r.perfil_id, 'video_pedido', r.anuncio_id, r.autor_id,
              left('Faltam 2 dias para responder a entrevista em vídeo de ' || coalesce(r.empresa, 'a empresa')
                   || ' para a vaga “' || r.titulo || '”.', 300));
      n := n + 1;
    end loop;
  end if;
  return n;
end
$$;

-- os vídeos que passaram dos 6 meses: a conta (os da vaga dela), a pessoa (os seus) ou o Admin (todos)
create or replace function public.video_vencidos(p_limite integer default 200)
returns table (entrevista_id uuid, caminho text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, r.caminho
    from public.entrevistas_video e
    join public.anuncios a on a.id = e.anuncio_id
    join public.entrevistas_video_respostas r on r.entrevista_id = e.id and r.caminho is not null
   where e.videos_apagados_em is null and now() >= privado.video_vence_em(e.id)
     and (auth.role() = 'service_role' or a.autor_id = public.conta_atual() or e.perfil_id = (select auth.uid()))
   limit greatest(1, least(coalesce(p_limite, 200), 1000))
$$;

create or replace function public.video_marcar_apagados(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.entrevistas_video_respostas r set caminho = null
    from public.entrevistas_video e join public.anuncios a on a.id = e.anuncio_id
   where r.entrevista_id = e.id and e.id = any(coalesce(p_ids, '{}'))
     and now() >= privado.video_vence_em(e.id)
     and (auth.role() = 'service_role' or a.autor_id = public.conta_atual() or e.perfil_id = (select auth.uid()));
  update public.entrevistas_video e set videos_apagados_em = now()
    from public.anuncios a
   where a.id = e.anuncio_id and e.id = any(coalesce(p_ids, '{}')) and e.videos_apagados_em is null
     and now() >= privado.video_vence_em(e.id)
     and (auth.role() = 'service_role' or a.autor_id = public.conta_atual() or e.perfil_id = (select auth.uid()))
     and not exists (select 1 from public.entrevistas_video_respostas r where r.entrevista_id = e.id and r.caminho is not null);
end
$$;

-- 6. Os avisos ---------------------------------------------------------------------------------------
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'recado_no_ar', 'recado_retido', 'recado_forca',
                  'convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine',
                  'curriculo_publico', 'visita', 'visitas_do_dia', 'visitas_novidade',
                  'avaliacao_liberada', 'avaliacao_removida', 'mensagem_equipe',
                  'vagas_semana', 'talentos_semana', 'comunicado', 'noticias_do_dia',
                  'teste_pedido', 'teste_feito', 'lembrete_curtida', 'sem_resposta', 'pagamento',
                  'dispensada', 'entrevista_lembrete',
                  'video_pedido', 'video_enviado'));

create or replace function privado.grupo_do_aviso(p_tipo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_tipo = 'mensagem' then 'mensagens'
    when p_tipo in ('curtida', 'match', 'match_desfeito', 'etapa', 'contratacao', 'entrevista', 'entrevista_resposta',
                    'aceite_curriculo', 'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas',
                    'vaga_preenchida', 'recomendacao', 'avaliacao', 'teste_pedido', 'teste_feito',
                    'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete',
                    'video_pedido', 'video_enviado') then 'andamento'
    when p_tipo = 'conexao' then 'conexoes'
    when p_tipo in ('busca', 'seguindo') then 'vagas_novas'
    when p_tipo in ('vagas_semana', 'talentos_semana') then 'semana'
    when p_tipo in ('convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos',
                    'convite_vitrine') then 'convites'
    when p_tipo = 'noticias_do_dia' then 'noticias'
    else null
  end
$$;

drop trigger if exists notificacoes_para_celular on public.notificacoes;
create trigger notificacoes_para_celular
  after insert on public.notificacoes
  for each row
  when (new.tipo in ('curtida', 'match', 'mensagem', 'conexao', 'em_analise', 'removido', 'liberado',
                     'etapa', 'entrevista', 'entrevista_resposta', 'contratacao', 'aceite_curriculo',
                     'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas', 'vaga_preenchida',
                     'seguindo', 'busca', 'avaliacao', 'recado_retido', 'mensagem_equipe', 'equipe',
                     'vagas_semana', 'talentos_semana', 'noticias_do_dia', 'teste_pedido', 'teste_feito',
                     'lembrete_curtida', 'sem_resposta', 'pagamento', 'dispensada', 'entrevista_lembrete',
                     'video_pedido', 'video_enviado'))
  execute function privado.notificacao_para_celular();

CREATE OR REPLACE FUNCTION privado.notificacao_por_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_titulo text;
  v_nota text;
  v_quem text;
  v_autor uuid;
  v_motivo text;
  v_futuro boolean;
  v_depois text;
  v_entrevista jsonb;
  v_status text;
  v_categoria text;
begin
  select a.titulo, a.nota_moderacao, a.autor_id, a.status, a.categoria into v_titulo, v_nota, v_autor, v_status, v_categoria
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
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'liberado', 'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete',
                  'video_pedido', 'video_enviado') then
    v_motivo := new.texto;
  end if;
  -- entrevista: os dados para o convite de agenda (.ics) que vai anexo no e-mail
  if new.tipo in ('entrevista', 'entrevista_resposta', 'entrevista_lembrete') then
    select jsonb_build_object(
             'id', e.id,
             'quando', e.quando,
             'duracao_min', e.duracao_min,
             'formato', e.formato,
             'local', e.local,
             'obs', e.obs,
             'situacao', e.situacao,
             'atualizado_em', e.atualizado_em,
             'anuncio_id', e.anuncio_id,
             'perfil_id', e.perfil_id,
             'vaga', a.titulo,
             'empresa', pa.nome,
             'candidato', pc.nome,
             'para', case when new.destinatario_id = a.autor_id then 'empresa' else 'candidato' end)
      into v_entrevista
      from public.entrevistas e
      join public.anuncios a on a.id = e.anuncio_id
      join public.perfis pa on pa.id = a.autor_id
      join public.perfis pc on pc.id = e.perfil_id
     where e.anuncio_id = new.anuncio_id
       and e.perfil_id = case when new.destinatario_id = a.autor_id then new.ator_id else new.destinatario_id end
     order by e.atualizado_em desc
     limit 1;
  end if;
  perform privado.enfileirar_email(new.destinatario_id, new.tipo, jsonb_build_object(
    'quem', coalesce(v_quem, 'Alguém'),
    'titulo', coalesce(v_titulo, ''),
    'motivo', coalesce(v_motivo, v_nota, ''),
    'depois', coalesce(v_depois, ''),
    'caminho', case new.tipo
                 -- a ficha de quem curtiu na Caixa de entrada, com o Aceitar e o Dispensar (o serviço volta para o anúncio)
                 when 'curtida' then '/painel/caixa?aba=responder&c=' || new.anuncio_id || ':' || new.ator_id
                 when 'lembrete_curtida' then '/painel/caixa?aba=responder&vaga=' || new.anuncio_id
                 when 'sem_resposta' then '/?tipo=vaga&categoria=' || coalesce(v_categoria, 'outros')
                 when 'dispensada' then '/anuncio/' || new.anuncio_id || '/parecidas'
                 when 'match' then '/painel/matches'
                 when 'liberado' then
                   case when v_status = 'ativo' then '/anuncio/' || new.anuncio_id else '/painel/anuncios' end
                 when 'removido' then '/privacidade#regras'
                 when 'avaliacao' then '/painel/avaliacoes'
                 when 'avaliacao_retida' then '/privacidade#regras'
                 when 'match_desfeito' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/anuncio/' || new.anuncio_id end
                 when 'etapa' then '/painel/curtidas'
                 when 'mensagem' then coalesce('/painel/conversas/' || new.ator_id, '/painel/conversas')
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
                 when 'video_pedido' then '/entrevista-video/' || new.anuncio_id
                 when 'video_enviado' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 when 'entrevista_lembrete' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                        else '/anuncio/' || new.anuncio_id end
                 when 'aceite_curriculo' then '/perfil/curriculo?next=%2Fanuncio%2F' || new.anuncio_id
                 when 'curriculo_recebido' then '/painel/anuncio/' || new.anuncio_id || '#candidato-' || new.ator_id
                 when 'finalistas' then '/painel/anuncio/' || new.anuncio_id || '/finalistas'
                 when 'convite_candidato' then '/painel/anuncio/' || new.anuncio_id || '/convidar'
                 when 'equipe' then '/painel/equipe'
                 when 'conexao' then '/painel/conexoes/' || new.ator_id
                 else '/painel'
               end)
    || case when v_entrevista is null then '{}'::jsonb else jsonb_build_object('entrevista', v_entrevista) end);
  return null;
end
$function$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('video_pedido', 'usuarios', 22, 'Entrevista em vídeo pedida',
     'Para quem curtiu a vaga: a empresa pediu a entrevista em vídeo (e o lembrete, quando faltam 2 dias).',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     'Entrevista em vídeo: “{{titulo}}”',
     'Oi, {{nome}}.

{{motivo}}

Você grava as respostas pelo celular, na hora que puder. Se não puder gravar, a página mostra o que fazer.',
     'Responder a entrevista'),
    ('video_enviado', 'usuarios', 22, 'Entrevista em vídeo respondida',
     'Para quem publicou a vaga: o candidato enviou a entrevista em vídeo.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     '{{quem}} respondeu a entrevista em vídeo',
     'Oi, {{nome}}.

{{motivo}}

Assista às respostas no quadro da vaga, com a transcrição e o resumo da IA.',
     'Assistir')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- 7. Permissões --------------------------------------------------------------------------------------
revoke all on function privado.video_vence_em(uuid), privado.video_pode_enviar(text), privado.video_pode_ver(text),
                       privado.video_pode_apagar(text), privado.minha_vaga_para_video(uuid),
                       privado.video_pedir_um(uuid, uuid, uuid), privado.minha_entrevista_aberta(uuid)
  from public, anon;
grant execute on function privado.video_pode_enviar(text), privado.video_pode_ver(text), privado.video_pode_apagar(text)
  to authenticated;
revoke all on function public.video_config(uuid), public.video_salvar_config(uuid, text[], integer, boolean, boolean, boolean),
                       public.video_pedir(uuid, uuid[]), public.video_da_vaga(uuid), public.video_da_entrevista(uuid),
                       public.video_minha(uuid), public.video_ver_pergunta(uuid, text),
                       public.video_registrar(uuid, text, text, integer), public.video_responder_texto(uuid, text, text),
                       public.video_enviar(uuid), public.video_apagar(uuid), public.video_vencidos(integer),
                       public.video_marcar_apagados(uuid[])
  from public, anon;
grant execute on function public.video_config(uuid), public.video_salvar_config(uuid, text[], integer, boolean, boolean, boolean),
                          public.video_pedir(uuid, uuid[]), public.video_da_vaga(uuid), public.video_da_entrevista(uuid),
                          public.video_minha(uuid), public.video_ver_pergunta(uuid, text),
                          public.video_registrar(uuid, text, text, integer), public.video_responder_texto(uuid, text, text),
                          public.video_enviar(uuid), public.video_apagar(uuid), public.video_vencidos(integer),
                          public.video_marcar_apagados(uuid[])
  to authenticated, service_role;
revoke all on function public.servidor_video_guardar_ia(text, uuid, jsonb, jsonb),
                       public.servidor_video_prazos(text, timestamptz) from public;
grant execute on function public.servidor_video_guardar_ia(text, uuid, jsonb, jsonb),
                          public.servidor_video_prazos(text, timestamptz) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
