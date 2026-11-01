-- Entrevista ao vivo pelo Publike (claude/plano-recursos-concorrentes.md, parte 3). Pode rodar de novo.
-- O formato novo `publike`: a chamada de vídeo dentro do site, numa sala privada da Daily que o servidor cria na
-- primeira entrada (`entrevistas.sala`). Só o candidato e a conta da vaga entram, de 15 minutos antes até 2 horas
-- depois do horário. É da Entrevista em vídeo (recurso pago, migração 20270104120000).

alter table public.entrevistas drop constraint if exists entrevistas_formato_check;
alter table public.entrevistas add constraint entrevistas_formato_check
  check (formato in ('presencial', 'video', 'telefone', 'publike'));
alter table public.entrevistas add column if not exists sala text check (sala ~ '^https://[a-z0-9.-]+/[A-Za-z0-9_-]+$');

create or replace function public.marcar_entrevista(p_anuncio uuid, p_perfil uuid, p_quando timestamp with time zone, p_formato text, p_local text DEFAULT NULL::text, p_obs text DEFAULT NULL::text, p_duracao integer DEFAULT 30)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  eu uuid := (select public.conta_atual());
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
  if p_formato not in ('presencial', 'video', 'telefone', 'publike') then
    raise exception 'Escolha como vai ser a entrevista.' using errcode = '22023';
  end if;
  -- a chamada pelo Publike é da Entrevista em vídeo (recurso pago)
  if p_formato = 'publike' then
    perform privado.exigir_video();
    v_local := null;
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
     set quando = p_quando, formato = p_formato, local = v_local, obs = v_obs, opcoes = null,
         duracao_min = greatest(10, least(480, coalesce(p_duracao, 30))),
         situacao = 'marcada', atualizado_em = now()
   where anuncio_id = p_anuncio and perfil_id = p_perfil and situacao in ('marcada', 'confirmada', 'remarcar', 'escolher')
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
                               when 'publike' then ', por vídeo pelo Publike (o botão de entrar aparece na página da vaga)'
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
$function$;

create or replace function public.oferecer_horarios(p_anuncio uuid, p_perfil uuid, p_opcoes timestamp with time zone[], p_formato text, p_local text DEFAULT NULL::text, p_obs text DEFAULT NULL::text, p_duracao integer DEFAULT 30)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  eu uuid := (select public.conta_atual());
  v_titulo text;
  v_status text;
  v_id uuid;
  v_opcoes timestamptz[];
  v_local text := nullif(btrim(coalesce(p_local, '')), '');
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_lista text;
  v_texto text;
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
  select array_agg(distinct o order by o) into v_opcoes from unnest(coalesce(p_opcoes, '{}')) o where o is not null;
  if coalesce(cardinality(v_opcoes), 0) < 2 or cardinality(v_opcoes) > 5 then
    raise exception 'Ofereça de 2 a 5 horários diferentes.' using errcode = '22023', hint = 'opcoes';
  end if;
  if v_opcoes[1] < now() or v_opcoes[cardinality(v_opcoes)] > now() + interval '120 days' then
    raise exception 'Os horários precisam ser daqui para a frente (até 120 dias).' using errcode = '22023', hint = 'opcoes';
  end if;
  if p_formato not in ('presencial', 'video', 'telefone', 'publike') then
    raise exception 'Escolha como vai ser a entrevista.' using errcode = '22023';
  end if;
  if p_formato = 'publike' then
    perform privado.exigir_video();
    v_local := null;
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
     set quando = v_opcoes[1], opcoes = v_opcoes, formato = p_formato, local = v_local, obs = v_obs,
         duracao_min = greatest(10, least(480, coalesce(p_duracao, 30))),
         situacao = 'escolher', atualizado_em = now()
   where anuncio_id = p_anuncio and perfil_id = p_perfil and situacao in ('marcada', 'confirmada', 'remarcar', 'escolher')
  returning id into v_id;
  if v_id is null then
    insert into public.entrevistas (anuncio_id, perfil_id, quando, opcoes, formato, local, obs, duracao_min, situacao)
    values (p_anuncio, p_perfil, v_opcoes[1], v_opcoes, p_formato, v_local, v_obs,
            greatest(10, least(480, coalesce(p_duracao, 30))), 'escolher')
    returning id into v_id;
  end if;

  insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa)
  values (p_anuncio, p_perfil, 'entrevista')
  on conflict (anuncio_id, perfil_id) do update
    set etapa = 'entrevista',
        atualizado_em = case when public.etapas_candidatos.etapa <> 'entrevista' then now()
                             else public.etapas_candidatos.atualizado_em end;

  select string_agg(privado.data_da_entrevista(o), '; ' order by o) into v_lista from unnest(v_opcoes) o;
  v_texto := 'Escolha o horário da entrevista para “' || v_titulo || '”: ' || v_lista
             || case p_formato when 'presencial' then '. Em ' || v_local
                               when 'video' then '. Por vídeo: ' || v_local
                               when 'publike' then '. Por vídeo pelo Publike'
                               else '. Por telefone' end
             || '.' || coalesce(' ' || v_obs, '')
             || ' Escolha na página da vaga.';
  insert into public.mensagens (anuncio_id, perfil_id, autor_id, texto)
  values (p_anuncio, p_perfil, eu, left(v_texto, 2000));
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'entrevista', p_anuncio, eu,
          left('Escolha o horário da sua entrevista para “' || v_titulo || '”: '
               || cardinality(v_opcoes) || ' opções.', 300));
  return v_id;
end
$function$;

-- quem vai entrar: a entrevista, o papel (empresa ou candidato) e o nome para a chamada
create or replace function public.entrevista_para_entrar(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.entrevistas;
  a public.anuncios;
  v_papel text;
  v_nome text;
begin
  select * into e from public.entrevistas x where x.id = p_id;
  if e.id is null then
    raise exception 'Entrevista não encontrada.' using errcode = '42501';
  end if;
  select * into a from public.anuncios x where x.id = e.anuncio_id;
  if e.perfil_id = (select auth.uid()) then
    v_papel := 'candidato';
    select p.nome into v_nome from public.perfis p where p.id = e.perfil_id;
  elsif a.autor_id = public.conta_atual() then
    v_papel := 'empresa';
    select coalesce(split_part(pp.nome, ' ', 1) || ' (' || pc.nome || ')', pc.nome) into v_nome
      from public.perfis pc left join public.perfis pp on pp.id = (select auth.uid()) and pp.id <> pc.id
     where pc.id = a.autor_id;
  else
    raise exception 'Entrevista não encontrada.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'id', e.id, 'anuncio_id', e.anuncio_id, 'quando', e.quando, 'duracao_min', e.duracao_min,
    'situacao', e.situacao, 'formato', e.formato, 'sala', e.sala, 'papel', v_papel, 'nome', v_nome,
    'vaga', a.titulo, 'empresa', (select p.nome from public.perfis p where p.id = a.autor_id),
    'candidato', (select p.nome from public.perfis p where p.id = e.perfil_id),
    'abre_em', e.quando - interval '15 minutes',
    'fecha_em', e.quando + make_interval(mins => e.duracao_min) + interval '2 hours');
end
$$;

-- a sala que o servidor criou na Daily (uma por entrevista)
create or replace function public.entrevista_guardar_sala(p_id uuid, p_sala text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.entrevistas e join public.anuncios a on a.id = e.anuncio_id
     where e.id = p_id and e.formato = 'publike'
       and (e.perfil_id = (select auth.uid()) or a.autor_id = public.conta_atual())) then
    raise exception 'Entrevista não encontrada.' using errcode = '42501';
  end if;
  update public.entrevistas set sala = p_sala where id = p_id and sala is null;
end
$$;

revoke all on function public.entrevista_para_entrar(uuid), public.entrevista_guardar_sala(uuid, text) from public, anon;
grant execute on function public.entrevista_para_entrar(uuid), public.entrevista_guardar_sala(uuid, text) to authenticated;

notify pgrst, 'reload schema';
