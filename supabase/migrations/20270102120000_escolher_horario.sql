-- O candidato escolhe o horário da entrevista e o lembrete na véspera (plano do retorno, parte 5). Pode rodar de novo.
-- 1) entrevistas.opcoes e a situação `escolher`: a empresa oferece de 2 a 5 horários (oferecer_horarios) e o
--    candidato escolhe um (escolher_horario), que vira `confirmada`. "Nenhum serve" é o `remarcar` de sempre.
--    Enquanto escolhe, `quando` guarda o primeiro horário (a coluna não aceita nulo) e não vai convite de agenda.
-- 2) marcar_entrevista troca uma escolha em aberto; responder_entrevista e mudar_entrevista conhecem a `escolher`.
-- 3) O lembrete na véspera, das 18h às 22h (Brasília), para o candidato e para quem marcou: o aviso
--    `entrevista_lembrete` (sino, celular e e-mail com o convite de agenda), pelo /api/filas (servidor_lembretes_entrevista).

-- 1. A escolha --------------------------------------------------------------------------------
alter table public.entrevistas add column if not exists opcoes timestamptz[];
alter table public.entrevistas drop constraint if exists entrevistas_situacao_check;
alter table public.entrevistas add constraint entrevistas_situacao_check
  check (situacao in ('marcada', 'confirmada', 'remarcar', 'cancelada', 'realizada', 'faltou', 'escolher'));
alter table public.entrevistas drop constraint if exists entrevistas_opcoes_check;
alter table public.entrevistas add constraint entrevistas_opcoes_check
  check (opcoes is null or cardinality(opcoes) between 2 and 5);

create or replace function public.oferecer_horarios(p_anuncio uuid, p_perfil uuid, p_opcoes timestamptz[], p_formato text,
                                                    p_local text default null, p_obs text default null,
                                                    p_duracao integer default 30)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  if p_formato not in ('presencial', 'video', 'telefone') then
    raise exception 'Escolha como vai ser a entrevista.' using errcode = '22023';
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
$$;

create or replace function public.escolher_horario(p_id uuid, p_quando timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  v public.entrevistas;
  v_autor uuid;
  v_titulo text;
  v_nome text;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  select * into v from public.entrevistas e where e.id = p_id and e.perfil_id = eu;
  if v.id is null or v.situacao <> 'escolher' then
    raise exception 'Esta entrevista não está esperando a sua escolha.' using errcode = 'P0001';
  end if;
  if p_quando is null or not (p_quando = any(v.opcoes)) then
    raise exception 'Escolha um dos horários oferecidos.' using errcode = '22023';
  end if;
  if p_quando < now() then
    raise exception 'Esse horário já passou. Escolha outro ou peça outros horários.' using errcode = '22023';
  end if;
  update public.entrevistas set quando = p_quando, situacao = 'confirmada', atualizado_em = now() where id = p_id;
  select a.autor_id, a.titulo into v_autor, v_titulo from public.anuncios a where a.id = v.anuncio_id;
  select split_part(p.nome, ' ', 1) into v_nome from public.perfis p where p.id = eu;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (v_autor, 'entrevista_resposta', v.anuncio_id, eu,
          left(coalesce(v_nome, 'O candidato') || ' escolheu ' || privado.data_da_entrevista(p_quando)
               || ' para a entrevista de “' || v_titulo || '”.', 300));
end
$$;

-- 2. As funções de antes conhecem a escolha ------------------------------------------------------
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

create or replace function public.responder_entrevista(p_id uuid, p_resposta text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  eu uuid := (select public.conta_atual());
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
  if v.id is null or v.situacao not in ('marcada', 'confirmada', 'remarcar', 'escolher') then
    raise exception 'Esta entrevista não está mais marcada.' using errcode = 'P0001';
  end if;
  -- com horários para escolher, confirmar é escolher um deles (escolher_horario); aqui só "nenhum serve"
  if v.situacao = 'escolher' and p_resposta = 'confirmada' then
    raise exception 'Escolha um dos horários.' using errcode = '22023';
  end if;
  update public.entrevistas set situacao = p_resposta, atualizado_em = now() where id = p_id;
  select a.autor_id, a.titulo into v_autor, v_titulo from public.anuncios a where a.id = v.anuncio_id;
  select split_part(p.nome, ' ', 1) into v_nome from public.perfis p where p.id = eu;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (v_autor, 'entrevista_resposta', v.anuncio_id, eu,
          left(coalesce(v_nome, 'O candidato')
               || case when v.situacao = 'escolher' then ' disse que nenhum dos horários serve para a entrevista de “'
                                                         || v_titulo || '”. Mande outros.'
                       when p_resposta = 'confirmada' then ' confirmou a entrevista de '
                                                         || privado.data_da_entrevista(v.quando) || ' (“' || v_titulo || '”).'
                       else ' pediu para remarcar a entrevista de '
                            || privado.data_da_entrevista(v.quando) || ' (“' || v_titulo || '”).' end, 300));
end
$function$;

create or replace function public.mudar_entrevista(p_id uuid, p_situacao text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  eu uuid := (select public.conta_atual());
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
  if p_situacao = 'cancelada' and v.situacao in ('marcada', 'confirmada', 'remarcar', 'escolher') then
    select a.titulo into v_titulo from public.anuncios a where a.id = v.anuncio_id;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (v.perfil_id, 'entrevista', v.anuncio_id, eu,
            left(case when v.situacao = 'escolher' then 'A entrevista para “' || v_titulo || '” foi cancelada.'
                      else 'A entrevista de ' || privado.data_da_entrevista(v.quando) || ' para “' || v_titulo || '” foi cancelada.' end, 300));
  end if;
end
$function$;

-- 3. O lembrete na véspera -------------------------------------------------------------------------
create table if not exists privado.entrevistas_lembradas (
  entrevista_id uuid not null references public.entrevistas(id) on delete cascade,
  quando timestamptz not null,
  lembrado_em timestamptz not null default now(),
  primary key (entrevista_id, quando)
);
alter table privado.entrevistas_lembradas enable row level security;

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
                  'dispensada', 'entrevista_lembrete'));

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
                    'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete') then 'andamento'
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
                     'lembrete_curtida', 'sem_resposta', 'pagamento', 'dispensada', 'entrevista_lembrete'))
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
                  'liberado', 'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete') then
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
    ('entrevista_lembrete', 'usuarios', 21, 'Lembrete da entrevista',
     'Na véspera da entrevista marcada (das 18h às 22h), para o candidato e para quem marcou.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     'Amanhã: entrevista de “{{titulo}}”',
     'Oi, {{nome}}.

{{motivo}}

Se não for dar, avise pelo Publike o quanto antes.',
     'Ver a entrevista')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

create or replace function public.servidor_lembretes_entrevista(p_chave text, p_agora timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_local timestamp := p_agora at time zone 'America/Sao_Paulo';
  v_amanha date := (p_agora at time zone 'America/Sao_Paulo')::date + 1;
  v_quando text;
  feitos integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  if extract(hour from v_local) < 18 or extract(hour from v_local) >= 22 then
    return 0;
  end if;
  for r in
    select e.id, e.quando, e.anuncio_id, e.perfil_id, e.formato, e.local, a.autor_id, a.titulo,
           split_part(pc.nome, ' ', 1) as candidato
      from public.entrevistas e
      join public.anuncios a on a.id = e.anuncio_id
      join public.perfis pc on pc.id = e.perfil_id
     where e.situacao in ('marcada', 'confirmada')
       and (e.quando at time zone 'America/Sao_Paulo')::date = v_amanha
       and not exists (select 1 from privado.entrevistas_lembradas l where l.entrevista_id = e.id and l.quando = e.quando)
     order by e.quando
     limit 300
  loop
    insert into privado.entrevistas_lembradas (entrevista_id, quando) values (r.id, r.quando) on conflict do nothing;
    v_quando := privado.data_da_entrevista(r.quando);
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, link, texto)
    values (r.perfil_id, 'entrevista_lembrete', r.anuncio_id, r.autor_id, '/anuncio/' || r.anuncio_id,
            left('Amanhã tem entrevista para “' || r.titulo || '”: ' || v_quando
                 || case r.formato when 'presencial' then ', em ' || coalesce(r.local, '')
                                   when 'video' then ', por vídeo: ' || coalesce(r.local, '')
                                   else ', por telefone' end || '.', 300));
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, link, texto)
    values (r.autor_id, 'entrevista_lembrete', r.anuncio_id, r.perfil_id,
            '/painel/anuncio/' || r.anuncio_id || '/quadro?candidato=' || r.perfil_id,
            left('Amanhã você entrevista ' || coalesce(r.candidato, 'o candidato') || ' para “' || r.titulo || '”: '
                 || v_quando || '.', 300));
    feitos := feitos + 1;
  end loop;
  return feitos;
end
$$;

revoke all on function public.oferecer_horarios(uuid, uuid, timestamptz[], text, text, text, integer),
                       public.escolher_horario(uuid, timestamptz) from public, anon;
grant execute on function public.oferecer_horarios(uuid, uuid, timestamptz[], text, text, text, integer),
                          public.escolher_horario(uuid, timestamptz) to authenticated;
revoke all on function public.servidor_lembretes_entrevista(text, timestamptz) from public;
grant execute on function public.servidor_lembretes_entrevista(text, timestamptz) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
