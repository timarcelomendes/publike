-- A entrevista na conversa (04/11/2026; claude/plano-entrevista-na-conversa.md): a mensagem de "Entrevista marcada"
-- (ou remarcada) e a de "Escolha o horário" trazem a entrevista (`mensagens.entrevista`), e a conversa mostra os botões
-- para o candidato ("Confirmar presença", "Pedir outro horário", um por horário, "Nenhum serve") e a situação para os
-- dois. A situação acompanha a entrevista (a página da vaga, o cancelamento, "realizada" ou "faltou"), e a mudança
-- chega ao vivo (o UPDATE da mensagem). Remarcar ou mandar outros horários tira os botões da mensagem de antes.
-- Pode rodar de novo.

-- 1. A entrevista da mensagem -----------------------------------------------------------------------------
-- {id, tipo: marcada | horarios, quando | opcoes, formato, local, obs, duracao, vaga,
--  estado: aberta | confirmada | remarcar | escolhido | substituida | cancelada | encerrada, escolhido}
alter table public.mensagens add column if not exists entrevista jsonb;
create index if not exists mensagens_entrevista_idx on public.mensagens ((entrevista ->> 'id'))
  where entrevista is not null;

-- 2. A situação acompanha a entrevista ---------------------------------------------------------------------
-- marcar e mandar horários (situação marcada ou escolher) cuidam das mensagens: a nova entra e a de antes sai
create or replace function privado.entrevista_na_mensagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  if new.situacao in ('marcada', 'escolher') or (new.situacao = old.situacao and new.quando = old.quando) then
    return null;
  end if;
  v_estado := case new.situacao
                when 'confirmada' then case when old.situacao = 'escolher' then 'escolhido' else 'confirmada' end
                when 'remarcar' then 'remarcar'
                when 'cancelada' then 'cancelada'
                else 'encerrada' end;
  update public.mensagens m
     set entrevista = m.entrevista || jsonb_build_object('estado', v_estado)
                      || case when v_estado = 'escolhido' then jsonb_build_object('escolhido', new.quando)
                              else '{}'::jsonb end
   where m.entrevista ->> 'id' = new.id::text and m.entrevista ->> 'estado' <> 'substituida';
  return null;
end
$$;
revoke execute on function privado.entrevista_na_mensagem() from public, anon, authenticated;
drop trigger if exists entrevistas_na_mensagem on public.entrevistas;
create trigger entrevistas_na_mensagem
  after update of situacao, quando on public.entrevistas
  for each row execute function privado.entrevista_na_mensagem();

-- 3. Marcar (ou remarcar): a de 20270106120000, com a entrevista na mensagem --------------------------------
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
             || ' Confirme aqui na conversa ou na página da vaga.';

  -- a mensagem de antes desta entrevista perde os botões (só a nova é confirmada)
  update public.mensagens m
     set entrevista = m.entrevista || '{"estado": "substituida"}'::jsonb
   where m.entrevista ->> 'id' = v_id::text and m.entrevista ->> 'estado' <> 'substituida';
  insert into public.mensagens (anuncio_id, perfil_id, autor_id, texto, entrevista)
  values (p_anuncio, p_perfil, eu, left(v_texto, 2000),
          jsonb_build_object('id', v_id, 'tipo', 'marcada', 'quando', p_quando, 'formato', p_formato,
                             'local', v_local, 'obs', v_obs, 'duracao', greatest(10, least(480, coalesce(p_duracao, 30))),
                             'vaga', v_titulo, 'estado', 'aberta'));
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'entrevista', p_anuncio, eu,
          left(case when v_remarcou then 'Entrevista remarcada' else 'Entrevista marcada' end
               || ' para “' || v_titulo || '”: ' || privado.data_da_entrevista(p_quando) || '.', 300));
  return v_id;
end
$function$;

-- 4. Mandar horários para escolher: a de 20270106120000, com a entrevista na mensagem ----------------------
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
             || ' Escolha aqui na conversa ou na página da vaga.';
  -- a mensagem de antes desta entrevista perde os botões (só a nova é confirmada)
  update public.mensagens m
     set entrevista = m.entrevista || '{"estado": "substituida"}'::jsonb
   where m.entrevista ->> 'id' = v_id::text and m.entrevista ->> 'estado' <> 'substituida';
  insert into public.mensagens (anuncio_id, perfil_id, autor_id, texto, entrevista)
  values (p_anuncio, p_perfil, eu, left(v_texto, 2000),
          jsonb_build_object('id', v_id, 'tipo', 'horarios', 'opcoes', to_jsonb(v_opcoes), 'formato', p_formato,
                             'local', v_local, 'obs', v_obs, 'duracao', greatest(10, least(480, coalesce(p_duracao, 30))),
                             'vaga', v_titulo, 'estado', 'aberta'));
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'entrevista', p_anuncio, eu,
          left('Escolha o horário da sua entrevista para “' || v_titulo || '”: '
               || cardinality(v_opcoes) || ' opções.', 300));
  return v_id;
end
$function$;

-- 5. Responder na conversa: a mesma regra da página da vaga, e a resposta entra na conversa ----------------
create or replace function public.responder_entrevista_no_chat(p_mensagem bigint, p_resposta text,
                                                                p_quando timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  m public.mensagens;
  v public.entrevistas;
  v_texto text;
  v_id bigint;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if coalesce(p_resposta, '') not in ('confirmada', 'remarcar', 'escolher') then
    raise exception 'Resposta inválida.' using errcode = '22023';
  end if;
  select * into m from public.mensagens x where x.id = p_mensagem and x.entrevista is not null;
  -- só o candidato da entrevista responde
  select * into v from public.entrevistas e where e.id = (m.entrevista ->> 'id')::uuid and e.perfil_id = eu;
  if m.id is null or v.id is null then
    raise exception 'Mensagem não encontrada.' using errcode = 'P0002';
  end if;
  if m.entrevista ->> 'estado' in ('substituida', 'cancelada', 'encerrada') then
    raise exception 'Esta entrevista mudou. Veja a mensagem mais nova da conversa.' using errcode = 'P0001';
  end if;
  if p_resposta = 'escolher' then
    perform public.escolher_horario(v.id, p_quando);
    v_texto := 'Escolhi ' || privado.data_da_entrevista(p_quando) || ' para a entrevista.';
  else
    perform public.responder_entrevista(v.id, p_resposta);
    v_texto := case
                 when p_resposta = 'confirmada' then
                   'Confirmo a presença na entrevista de ' || privado.data_da_entrevista(v.quando) || '.'
                 when v.situacao = 'escolher' then 'Nenhum desses horários serve para mim. Pode mandar outros?'
                 else 'Preciso de outro horário para a entrevista de ' || privado.data_da_entrevista(v.quando) || '.'
               end;
  end if;
  insert into public.mensagens (anuncio_id, perfil_id, autor_id, texto)
  values (v.anuncio_id, v.perfil_id, eu, left(v_texto, 2000))
  returning id into v_id;
  return jsonb_build_object('mensagens', jsonb_build_array(v_id));
end
$$;
revoke execute on function public.responder_entrevista_no_chat(bigint, text, timestamptz) from public, anon;
grant execute on function public.responder_entrevista_no_chat(bigint, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';
