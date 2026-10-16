-- =====================================================================
-- Recrutamento: entrevistas, mensagens prontas e visitas das vagas
--
-- 1. Entrevistas: quem publicou a vaga marca dia, hora e onde (ou o link)
--    com quem deu match. O candidato recebe o aviso e uma mensagem na
--    conversa, e confirma presença ou pede para remarcar.
-- 2. Mensagens prontas (modelos) de cada conta, para mandar a um ou a
--    vários candidatos de uma vez.
-- 3. Visitas de cada vaga (quantas vezes a página foi aberta por outra
--    pessoa), para o painel de recrutamento.
-- 4. Triagem: a resposta que a empresa procura em cada pergunta da vaga
--    (e se a pergunta elimina), visível só para quem publicou.
--
-- Rode ANTES de publicar o código novo. Rode depois de
-- 20261016120000_vaga_personalizada.sql. Pode rodar de novo.
-- =====================================================================

-- 0. Avisos novos -----------------------------------------------------------------------

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta'));

-- 1. Entrevistas -------------------------------------------------------------------------

create table if not exists public.entrevistas (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null,
  perfil_id uuid not null,
  quando timestamptz not null,
  duracao_min smallint not null default 30 check (duracao_min between 10 and 480),
  formato text not null check (formato in ('presencial', 'video', 'telefone')),
  -- presencial: o endereço; vídeo: o link; telefone: vazio (o WhatsApp já aparece no match)
  local text check (char_length(local) <= 300),
  obs text check (char_length(obs) <= 500),
  situacao text not null default 'marcada'
    check (situacao in ('marcada', 'confirmada', 'remarcar', 'cancelada', 'realizada', 'faltou')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (anuncio_id, perfil_id) references public.curtidas (anuncio_id, perfil_id) on delete cascade
);
-- uma entrevista em aberto por candidato em cada vaga (remarcar troca a data dela)
create unique index if not exists entrevistas_em_aberto_idx
  on public.entrevistas (anuncio_id, perfil_id) where situacao in ('marcada', 'confirmada', 'remarcar');
create index if not exists entrevistas_quando_idx on public.entrevistas (anuncio_id, quando);

alter table public.entrevistas enable row level security;
revoke all on public.entrevistas from anon, authenticated;
grant select on public.entrevistas to authenticated;
grant select, insert, update, delete on public.entrevistas to service_role;

drop policy if exists "quem publicou e o candidato veem a entrevista" on public.entrevistas;
create policy "quem publicou e o candidato veem a entrevista" on public.entrevistas
  for select to authenticated
  using (
    perfil_id = (select auth.uid())
    or exists (select 1 from public.anuncios a where a.id = anuncio_id and a.autor_id = (select auth.uid()))
  );

-- "qua, 22/10 às 14h" (ou "14h30"), no horário de Brasília
create or replace function privado.data_da_entrevista(p_quando timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'])[extract(dow from p_quando at time zone 'America/Sao_Paulo')::int + 1]
         || ', ' || to_char(p_quando at time zone 'America/Sao_Paulo', 'DD/MM')
         || ' às ' || extract(hour from p_quando at time zone 'America/Sao_Paulo')::int || 'h'
         || case when extract(minute from p_quando at time zone 'America/Sao_Paulo') = 0 then ''
                 else to_char(p_quando at time zone 'America/Sao_Paulo', 'MI') end
$$;

-- Quem publicou marca (ou remarca) a entrevista. Só com match: é quando o contato aparece.
create or replace function public.marcar_entrevista(
  p_anuncio uuid,
  p_perfil uuid,
  p_quando timestamptz,
  p_formato text,
  p_local text default null,
  p_obs text default null,
  p_duracao integer default 30
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_titulo text;
  v_status text;
  v_id uuid;
  v_local text := nullif(btrim(coalesce(p_local, '')), '');
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_texto text;
  v_remarcou boolean := false;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select a.titulo, c.status into v_titulo, v_status
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil and a.autor_id = eu and a.tipo = 'vaga';
  if v_titulo is null then
    raise exception 'Essa pessoa não se candidatou a uma vaga sua.' using errcode = '42501';
  end if;
  if v_status <> 'match' then
    raise exception 'Curta de volta primeiro: a entrevista vem depois do match.' using errcode = 'P0001', hint = 'sem_match';
  end if;
  if p_formato not in ('presencial', 'video', 'telefone') then
    raise exception 'Escolha como vai ser a entrevista.' using errcode = '22023';
  end if;
  if p_quando is null or p_quando < now() - interval '1 hour' or p_quando > now() + interval '120 days' then
    raise exception 'Escolha uma data a partir de hoje.' using errcode = '22023';
  end if;
  if p_formato = 'video' and (v_local is null or v_local !~* '^https://') then
    raise exception 'Cole o link da chamada de vídeo (começa com https://).' using errcode = '22023', hint = 'local';
  end if;
  if p_formato = 'presencial' and v_local is null then
    raise exception 'Diga o endereço da entrevista.' using errcode = '22023', hint = 'local';
  end if;
  if char_length(v_local) > 300 or char_length(v_obs) > 500 then
    raise exception 'O texto ficou longo demais.' using errcode = '22023';
  end if;
  perform privado.conferir_limite('etapa', 300, 'Você mexeu em muitos candidatos hoje. Tente de novo amanhã.');

  update public.entrevistas
     set quando = p_quando, formato = p_formato, local = v_local, obs = v_obs,
         duracao_min = greatest(10, least(480, coalesce(p_duracao, 30))),
         situacao = 'marcada', atualizado_em = now()
   where anuncio_id = p_anuncio and perfil_id = p_perfil and situacao in ('marcada', 'confirmada', 'remarcar')
  returning id into v_id;
  v_remarcou := v_id is not null;
  if v_id is null then
    insert into public.entrevistas (anuncio_id, perfil_id, quando, formato, local, obs, duracao_min)
    values (p_anuncio, p_perfil, p_quando, p_formato, v_local, v_obs, greatest(10, least(480, coalesce(p_duracao, 30))))
    returning id into v_id;
  end if;

  -- a etapa vai para Entrevista (a anotação fica como está)
  insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa)
  values (p_anuncio, p_perfil, 'entrevista')
  on conflict (anuncio_id, perfil_id) do update
    set etapa = 'entrevista',
        atualizado_em = case when public.etapas_candidatos.etapa <> 'entrevista' then now()
                             else public.etapas_candidatos.atualizado_em end;

  v_texto := case when v_remarcou then 'Entrevista remarcada' else 'Entrevista marcada' end
             || ' para “' || v_titulo || '”: ' || privado.data_da_entrevista(p_quando)
             || case p_formato when 'presencial' then ', em ' || v_local
                               when 'video' then ', por vídeo: ' || v_local
                               else ', por telefone' end
             || '.' || coalesce(' ' || v_obs, '')
             || ' Confirme a presença na página da vaga.';

  insert into public.mensagens (anuncio_id, perfil_id, autor_id, texto)
  values (p_anuncio, p_perfil, eu, left(v_texto, 2000));
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'entrevista', p_anuncio, eu,
          left(case when v_remarcou then 'Entrevista remarcada' else 'Entrevista marcada' end
               || ' para “' || v_titulo || '”: ' || privado.data_da_entrevista(p_quando) || '.', 300));
  return v_id;
end
$$;

-- Quem publicou cancela ou diz como foi (realizada ou faltou).
create or replace function public.mudar_entrevista(p_id uuid, p_situacao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v public.entrevistas;
  v_titulo text;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_situacao not in ('cancelada', 'realizada', 'faltou') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  select e.* into v
    from public.entrevistas e
    join public.anuncios a on a.id = e.anuncio_id
   where e.id = p_id and a.autor_id = eu;
  if v.id is null then
    raise exception 'Entrevista não encontrada.' using errcode = 'P0002';
  end if;
  update public.entrevistas set situacao = p_situacao, atualizado_em = now() where id = p_id;
  if p_situacao = 'cancelada' and v.situacao in ('marcada', 'confirmada', 'remarcar') then
    select a.titulo into v_titulo from public.anuncios a where a.id = v.anuncio_id;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (v.perfil_id, 'entrevista', v.anuncio_id, eu,
            left('A entrevista de ' || privado.data_da_entrevista(v.quando) || ' para “' || v_titulo || '” foi cancelada.', 300));
  end if;
end
$$;

-- O candidato confirma presença ou pede para remarcar.
create or replace function public.responder_entrevista(p_id uuid, p_resposta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v public.entrevistas;
  v_autor uuid;
  v_titulo text;
  v_nome text;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_resposta not in ('confirmada', 'remarcar') then
    raise exception 'Resposta inválida.' using errcode = '22023';
  end if;
  select * into v from public.entrevistas e where e.id = p_id and e.perfil_id = eu;
  if v.id is null or v.situacao not in ('marcada', 'confirmada', 'remarcar') then
    raise exception 'Esta entrevista não está mais marcada.' using errcode = 'P0001';
  end if;
  update public.entrevistas set situacao = p_resposta, atualizado_em = now() where id = p_id;
  select a.autor_id, a.titulo into v_autor, v_titulo from public.anuncios a where a.id = v.anuncio_id;
  select split_part(p.nome, ' ', 1) into v_nome from public.perfis p where p.id = eu;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (v_autor, 'entrevista_resposta', v.anuncio_id, eu,
          left(coalesce(v_nome, 'O candidato')
               || case when p_resposta = 'confirmada' then ' confirmou a entrevista de '
                       else ' pediu para remarcar a entrevista de ' end
               || privado.data_da_entrevista(v.quando) || ' (“' || v_titulo || '”).', 300));
end
$$;

revoke execute on function public.marcar_entrevista(uuid, uuid, timestamptz, text, text, text, integer),
                          public.mudar_entrevista(uuid, text),
                          public.responder_entrevista(uuid, text) from public, anon;
grant execute on function public.marcar_entrevista(uuid, uuid, timestamptz, text, text, text, integer),
                          public.mudar_entrevista(uuid, text),
                          public.responder_entrevista(uuid, text) to authenticated;

-- 2. Mensagens prontas -------------------------------------------------------------------

create table if not exists public.modelos_mensagem (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 2 and 60),
  texto text not null check (char_length(btrim(texto)) between 5 and 2000),
  criado_em timestamptz not null default now()
);
create index if not exists modelos_mensagem_autor_idx on public.modelos_mensagem (autor_id, criado_em);

alter table public.modelos_mensagem enable row level security;
revoke all on public.modelos_mensagem from anon, authenticated;
grant select, delete on public.modelos_mensagem to authenticated;
grant insert (nome, texto), update (nome, texto) on public.modelos_mensagem to authenticated;

drop policy if exists "cada conta mexe nos seus modelos" on public.modelos_mensagem;
create policy "cada conta mexe nos seus modelos" on public.modelos_mensagem
  for all to authenticated
  using (autor_id = (select auth.uid()))
  with check (autor_id = (select auth.uid()));

-- 3. Visitas das vagas ------------------------------------------------------------------
-- Numa tabela à parte: mexer no anúncio dispararia as regras de edição (limites, moderação).

create table if not exists public.anuncio_visitas (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  total integer not null default 0,
  atualizado_em timestamptz not null default now()
);
alter table public.anuncio_visitas enable row level security;
revoke all on public.anuncio_visitas from anon, authenticated;
grant select on public.anuncio_visitas to authenticated;
grant select, insert, update, delete on public.anuncio_visitas to service_role;

drop policy if exists "quem publicou vê as visitas" on public.anuncio_visitas;
create policy "quem publicou vê as visitas" on public.anuncio_visitas
  for select to authenticated
  using (exists (select 1 from public.anuncios a where a.id = anuncio_id and a.autor_id = (select auth.uid())));

-- Conta uma visita (quem publicou não conta). Chamada pelo servidor do site ao abrir a vaga.
create or replace function public.contar_visita(p_anuncio uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.anuncios a
     where a.id = p_anuncio and a.status = 'ativo' and a.autor_id is distinct from (select auth.uid())
  ) then
    return;
  end if;
  insert into public.anuncio_visitas (anuncio_id, total) values (p_anuncio, 1)
  on conflict (anuncio_id) do update
    set total = public.anuncio_visitas.total + 1, atualizado_em = now();
end
$$;

revoke execute on function public.contar_visita(uuid) from public;
grant execute on function public.contar_visita(uuid) to anon, authenticated;

-- 4. Triagem das perguntas ---------------------------------------------------------------
-- A resposta que a empresa procura em cada pergunta (e se ela elimina) fica aqui, à parte:
-- as perguntas da vaga são públicas, a triagem só quem publicou vê.

create table if not exists public.vaga_triagem (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  criterios jsonb not null default '{}'::jsonb
    check (jsonb_typeof(criterios) = 'object' and octet_length(criterios::text) <= 4000),
  atualizado_em timestamptz not null default now()
);
alter table public.vaga_triagem enable row level security;
revoke all on public.vaga_triagem from anon, authenticated;
grant select, insert, update, delete on public.vaga_triagem to authenticated;
grant select, insert, update, delete on public.vaga_triagem to service_role;

drop policy if exists "quem publicou mexe na triagem" on public.vaga_triagem;
create policy "quem publicou mexe na triagem" on public.vaga_triagem
  for all to authenticated
  using (exists (select 1 from public.anuncios a where a.id = anuncio_id and a.autor_id = (select auth.uid())))
  with check (exists (select 1 from public.anuncios a where a.id = anuncio_id and a.autor_id = (select auth.uid())));

notify pgrst, 'reload schema';
