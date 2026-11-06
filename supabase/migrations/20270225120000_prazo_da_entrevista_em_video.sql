-- Entrevista em vídeo: a empresa escolhe o prazo para gravar (06/11/2026; claude/plano-prazo-da-entrevista-em-video.md).
-- 2, 3, 5, 7 ou 10 dias (5, como era). O pedido usa o prazo da vaga e o aviso diz "em até N dias"; o lembrete sai na
-- metade do prazo, no máximo quando faltam 2 dias. Pode rodar de novo; depois da 20270105120000.

-- 1. O prazo da vaga -----------------------------------------------------------------------------------------------
alter table public.video_perguntas add column if not exists dias smallint not null default 5;
alter table public.video_perguntas drop constraint if exists video_perguntas_dias_check;
alter table public.video_perguntas add constraint video_perguntas_dias_check check (dias in (2, 3, 5, 7, 10));

-- 2. Ler e salvar ---------------------------------------------------------------------------------------------------
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
    'dias', coalesce(c.dias, 5),
    'pcd', a.pcd = 'exclusiva',
    'liberado', privado.video_liberado(public.conta_atual()));
end
$$;

-- a versão de 6 parâmetros sai (a nova, com p_dias padrão 5, atende quem ainda chama sem o prazo)
drop function if exists public.video_salvar_config(uuid, text[], integer, boolean, boolean, boolean);
create or replace function public.video_salvar_config(p_anuncio uuid, p_perguntas text[], p_segundos integer,
                                                      p_segunda_chance boolean, p_aceita_texto boolean,
                                                      p_pedir_a_todos boolean, p_dias integer default 5)
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
  if coalesce(p_dias, 5) not in (2, 3, 5, 7, 10) then
    raise exception 'Escolha o prazo: 2, 3, 5, 7 ou 10 dias.' using errcode = '22023', hint = 'dias';
  end if;
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
  insert into public.video_perguntas (anuncio_id, perguntas, segundos, segunda_chance, aceita_texto, pedir_a_todos,
                                      dias, atualizado_em)
  values (a.id, v_lista, greatest(30, least(180, coalesce(p_segundos, 90))), coalesce(p_segunda_chance, true),
          coalesce(p_aceita_texto, true) or a.pcd = 'exclusiva', coalesce(p_pedir_a_todos, false), coalesce(p_dias, 5),
          now())
  on conflict (anuncio_id) do update
    set perguntas = excluded.perguntas, segundos = excluded.segundos, segunda_chance = excluded.segunda_chance,
        aceita_texto = excluded.aceita_texto, pedir_a_todos = excluded.pedir_a_todos, dias = excluded.dias,
        atualizado_em = now();
end
$$;

-- 3. O pedido usa o prazo da vaga -------------------------------------------------------------------------------------
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
  v_prazo timestamptz;
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
  v_prazo := now() + make_interval(days => coalesce(c.dias, 5));
  insert into public.entrevistas_video (anuncio_id, perfil_id, perguntas, segundos, segunda_chance, aceita_texto, prazo)
  values (p_anuncio, p_perfil, c.perguntas, c.segundos, c.segunda_chance,
          c.aceita_texto or exists (select 1 from public.anuncios a where a.id = p_anuncio and a.pcd = 'exclusiva'),
          v_prazo)
  on conflict (anuncio_id, perfil_id) do update
    set perguntas = excluded.perguntas, segundos = excluded.segundos, segunda_chance = excluded.segunda_chance,
        aceita_texto = excluded.aceita_texto, situacao = 'pedida', pedida_em = now(),
        prazo = excluded.prazo, lembrado_em = null, enviada_em = null, resumo = null, ia_em = null;
  delete from public.entrevistas_video_respostas r
   using public.entrevistas_video e
   where r.entrevista_id = e.id and e.anuncio_id = p_anuncio and e.perfil_id = p_perfil;
  select a.titulo, p.nome into v_titulo, v_quem
    from public.anuncios a join public.perfis p on p.id = a.autor_id where a.id = p_anuncio;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'video_pedido', p_anuncio, p_quem,
          left(coalesce(v_quem, 'A empresa') || ' pediu uma entrevista em vídeo para a vaga “' || v_titulo
               || '”: ' || jsonb_array_length(c.perguntas) || ' perguntas, pelo celular, em até '
               || coalesce(c.dias, 5) || ' dias.', 300));
  return true;
end
$$;

-- 4. O lembrete: na metade do prazo, no máximo quando faltam 2 dias -----------------------------------------------------
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
  v_dias integer;
begin
  perform privado.exigir_servidor(p_chave);
  update public.entrevistas_video set situacao = 'vencida'
   where situacao in ('pedida', 'respondendo') and prazo <= p_agora;
  -- uma vez, das 8h às 20h
  if v_hora between 8 and 19 then
    for r in
      select e.id, e.anuncio_id, e.perfil_id, e.prazo, a.autor_id, a.titulo, p.nome as empresa
        from public.entrevistas_video e
        join public.anuncios a on a.id = e.anuncio_id
        join public.perfis p on p.id = a.autor_id
       where e.situacao in ('pedida', 'respondendo') and e.lembrado_em is null
         and e.prazo > p_agora
         and e.prazo <= p_agora + least(interval '2 days', (e.prazo - e.pedida_em) / 2)
       limit 300
    loop
      update public.entrevistas_video set lembrado_em = p_agora where id = r.id;
      v_dias := greatest(1, round(extract(epoch from (r.prazo - p_agora)) / 86400)::integer);
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
      values (r.perfil_id, 'video_pedido', r.anuncio_id, r.autor_id,
              left(case when v_dias = 1 then 'Falta 1 dia' else 'Faltam ' || v_dias || ' dias' end
                   || ' para responder a entrevista em vídeo de ' || coalesce(r.empresa, 'a empresa')
                   || ' para a vaga “' || r.titulo || '”.', 300));
      n := n + 1;
    end loop;
  end if;
  return n;
end
$$;

-- 5. Permissões ------------------------------------------------------------------------------------------------------
revoke all on function public.video_salvar_config(uuid, text[], integer, boolean, boolean, boolean, integer)
  from public, anon;
grant execute on function public.video_salvar_config(uuid, text[], integer, boolean, boolean, boolean, integer)
  to authenticated, service_role;
revoke all on function privado.video_pedir_um(uuid, uuid, uuid) from public, anon;
revoke all on function public.servidor_video_prazos(text, timestamptz) from public;
grant execute on function public.servidor_video_prazos(text, timestamptz) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
