-- Automações por vaga e os números do processo (claude/plano-recursos-concorrentes.md, parte 6). Pode rodar de novo.
--   * regras por vaga, ligadas com um toque, cada uma com o registro do que fez (uma vez só por candidato):
--       - quem responde diferente numa pergunta eliminatória é dispensado (com o retorno de hoje, 15 min depois);
--       - ao mover para Em análise, Entrevista ou Contratados, a mensagem pronta escolhida vai na conversa;
--       - candidato parado há N dias gera um lembrete para a empresa (o aviso novo `parados`);
--       - pedir a entrevista em vídeo a todo novo candidato já existe (migração 20270105120000).
--   * os números: o funil, os tempos e a origem dos candidatos, por vaga (`numeros_do_processo`, `numeros_origem`).
-- Rode depois de 20270108120000_etapas_e_horarios.sql.

-- 1. As regras e o registro -------------------------------------------------------------------------
create table if not exists public.automacoes_vaga (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  dispensar_eliminados boolean not null default false,
  -- {"analise": "<id do modelo>", "entrevista": "...", "contratado": "..."}
  mensagens jsonb not null default '{}'::jsonb check (jsonb_typeof(mensagens) = 'object'),
  parado_dias smallint check (parado_dias between 2 and 30),
  atualizado_em timestamptz not null default now()
);
alter table public.automacoes_vaga enable row level security;
revoke all on table public.automacoes_vaga from public, anon, authenticated;

create table if not exists privado.automacoes_feitas (
  id bigint generated always as identity primary key,
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  regra text not null check (regra in ('dispensar', 'mensagem', 'parado')),
  -- a mensagem: a etapa; o parado: desde quando estava parado (um lembrete por parada)
  detalhe text not null default '',
  feito_em timestamptz not null default now()
);
create unique index if not exists automacoes_feitas_uma_vez
  on privado.automacoes_feitas (anuncio_id, perfil_id, regra, detalhe);
create index if not exists automacoes_feitas_vaga on privado.automacoes_feitas (anuncio_id, feito_em desc);
alter table privado.automacoes_feitas enable row level security;
revoke all on table privado.automacoes_feitas from public, anon, authenticated;

-- respondeu diferente do que a vaga procura numa pergunta eliminatória
create or replace function privado.elimina_pela_triagem(p_anuncio uuid, p_respostas jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.vaga_triagem t, jsonb_each(t.criterios) k
     where t.anuncio_id = p_anuncio
       and jsonb_typeof(k.value) = 'object'
       and coalesce((k.value ->> 'eliminatoria')::boolean, false)
       and coalesce(p_respostas, '{}'::jsonb) ? k.key
       and (p_respostas ->> k.key) is distinct from (k.value ->> 'esperada'))
$$;

create or replace function privado.dispensa_eliminado(p_anuncio uuid, p_respostas jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select x.dispensar_eliminados from public.automacoes_vaga x where x.anuncio_id = p_anuncio), false)
         and privado.elimina_pela_triagem(p_anuncio, p_respostas)
$$;

-- 2. Dispensar quem não passa na eliminatória ---------------------------------------------------------
create or replace function privado.automacao_ao_curtir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pendente'
     and exists (select 1 from public.anuncios a where a.id = new.anuncio_id and a.tipo = 'vaga')
     and privado.dispensa_eliminado(new.anuncio_id, new.respostas) then
    -- o gatilho curtidas_retorno põe o retorno na espera de 15 minutos, como no "Dispensar"
    update public.curtidas set status = 'dispensada', respondida_em = now()
     where anuncio_id = new.anuncio_id and perfil_id = new.perfil_id and status = 'pendente';
    insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra)
    values (new.anuncio_id, new.perfil_id, 'dispensar')
    on conflict do nothing;
  end if;
  return null;
end
$$;
drop trigger if exists curtidas_zzz_automacoes on public.curtidas;
create trigger curtidas_zzz_automacoes after insert on public.curtidas
  for each row execute function privado.automacao_ao_curtir();

-- quem a regra dispensa não recebe o pedido da entrevista em vídeo (o mesmo da 20270105120000, com o "e não")
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
  if v_autor is not null and privado.video_liberado(v_autor)
     and not (new.status = 'pendente' and privado.dispensa_eliminado(new.anuncio_id, new.respostas)) then
    perform privado.video_pedir_um(new.anuncio_id, new.perfil_id, v_autor);
  end if;
  return null;
end
$$;

-- 3. Ler e salvar as regras ---------------------------------------------------------------------------
create or replace function privado.minha_vaga_para_automacao(p_anuncio uuid)
returns public.anuncios
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
begin
  select * into a from public.anuncios x where x.id = p_anuncio and x.autor_id = public.conta_atual();
  if not found or a.tipo <> 'vaga' then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  return a;
end
$$;

create or replace function public.automacoes_da_vaga(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_automacao(p_anuncio);
  r public.automacoes_vaga;
begin
  select * into r from public.automacoes_vaga x where x.anuncio_id = a.id;
  return jsonb_build_object(
    'dispensar_eliminados', coalesce(r.dispensar_eliminados, false),
    'mensagens', coalesce(r.mensagens, '{}'::jsonb),
    'parado_dias', r.parado_dias,
    'tem_eliminatoria', exists (
      select 1 from public.vaga_triagem t, jsonb_each(t.criterios) k
       where t.anuncio_id = a.id and jsonb_typeof(k.value) = 'object'
         and coalesce((k.value ->> 'eliminatoria')::boolean, false)),
    'registro', coalesce((
      select jsonb_agg(jsonb_build_object('perfil_id', f.perfil_id, 'nome', p.nome, 'regra', f.regra,
                                          'detalhe', f.detalhe, 'feito_em', f.feito_em) order by f.feito_em desc)
        from (select * from privado.automacoes_feitas f where f.anuncio_id = a.id order by f.feito_em desc limit 30) f
        join public.perfis p on p.id = f.perfil_id), '[]'::jsonb));
end
$$;

create or replace function public.salvar_automacoes(p_anuncio uuid, p_dispensar boolean, p_mensagens jsonb,
                                                    p_parado_dias integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_automacao(p_anuncio);
  v_mensagens jsonb := '{}'::jsonb;
  k text;
  v_modelo uuid;
begin
  perform privado.exigir_conta_ativa();
  if p_parado_dias is not null and p_parado_dias not between 2 and 30 then
    raise exception 'O lembrete vai de 2 a 30 dias.' using errcode = '22023';
  end if;
  foreach k in array array['analise', 'entrevista', 'contratado'] loop
    if coalesce(p_mensagens ->> k, '') <> '' then
      begin
        v_modelo := (p_mensagens ->> k)::uuid;
      exception when invalid_text_representation then
        raise exception 'Mensagem pronta não encontrada.' using errcode = '22023';
      end;
      if not exists (select 1 from public.modelos_mensagem m
                      where m.id = v_modelo and m.autor_id in ((select auth.uid()), public.conta_atual())) then
        raise exception 'Mensagem pronta não encontrada.' using errcode = '22023';
      end if;
      v_mensagens := v_mensagens || jsonb_build_object(k, v_modelo);
    end if;
  end loop;
  insert into public.automacoes_vaga (anuncio_id, dispensar_eliminados, mensagens, parado_dias, atualizado_em)
  values (a.id, coalesce(p_dispensar, false), v_mensagens, p_parado_dias, now())
  on conflict (anuncio_id) do update
    set dispensar_eliminados = excluded.dispensar_eliminados, mensagens = excluded.mensagens,
        parado_dias = excluded.parado_dias, atualizado_em = now();
end
$$;

-- 4. A mensagem ao mover (o site chama depois de mover; uma vez por pessoa e etapa) ---------------------
create or replace function public.automacao_mensagem_ao_mover(p_anuncio uuid, p_perfis uuid[], p_etapa text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_automacao(p_anuncio);
  v_modelo text;
  v_empresa text;
  r record;
  n integer := 0;
begin
  if p_etapa not in ('analise', 'entrevista', 'contratado') then
    return 0;
  end if;
  select m.texto into v_modelo
    from public.automacoes_vaga x
    join public.modelos_mensagem m on m.id::text = x.mensagens ->> p_etapa
   where x.anuncio_id = a.id;
  if v_modelo is null then
    return 0;
  end if;
  select p.nome into v_empresa from public.perfis p where p.id = a.autor_id;
  for r in
    select c.perfil_id, p.nome
      from public.curtidas c
      join public.perfis p on p.id = c.perfil_id
      join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where c.anuncio_id = a.id and c.perfil_id = any (coalesce(p_perfis, '{}')) and c.status = 'match'
       and e.etapa = p_etapa
  loop
    insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra, detalhe)
    values (a.id, r.perfil_id, 'mensagem', p_etapa)
    on conflict do nothing;
    if found then
      perform public.enviar_mensagem(a.id, r.perfil_id,
        left(replace(replace(replace(v_modelo, '{nome}', coalesce(nullif(split_part(r.nome, ' ', 1), ''), r.nome)),
                             '{vaga}', a.titulo), '{empresa}', coalesce(v_empresa, '')), 2000));
      n := n + 1;
    end if;
  end loop;
  return n;
end
$$;

-- 5. O lembrete de quem está parado (pelas filas, das 8h às 20h) --------------------------------------
create or replace function public.servidor_automacoes_parados(p_chave text, p_agora timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v record;
  n integer := 0;
  v_novos integer;
  v_hora integer := extract(hour from (p_agora at time zone 'America/Sao_Paulo'))::integer;
begin
  perform privado.exigir_servidor(p_chave);
  if v_hora < 8 or v_hora >= 20 then
    return 0;
  end if;
  for v in
    select a.id, a.titulo, a.autor_id, x.parado_dias
      from public.automacoes_vaga x
      join public.anuncios a on a.id = x.anuncio_id
     where x.parado_dias is not null and a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
  loop
    with parados as (
      select c.perfil_id,
             greatest(c.criado_em, coalesce(c.respondida_em, c.criado_em),
                      coalesce((select max(h.em) from privado.historico_etapas h
                                 where h.anuncio_id = c.anuncio_id and h.perfil_id = c.perfil_id), c.criado_em)) as desde
        from public.curtidas c
        left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
       where c.anuncio_id = v.id and c.status in ('pendente', 'match')
         and coalesce(e.etapa, 'novo') in ('novo', 'analise', 'entrevista')
    ), novos as (
      insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra, detalhe)
      select v.id, p.perfil_id, 'parado', to_char(p.desde at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
        from parados p
       where p.desde <= p_agora - make_interval(days => v.parado_dias)
      on conflict do nothing
      returning 1
    )
    select count(*) into v_novos from novos;
    if v_novos > 0 then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
      values (v.autor_id, 'parados', v.id,
              left(case when v_novos = 1 then '1 candidato está parado'
                        else v_novos || ' candidatos estão parados' end
                   || ' há ' || v.parado_dias || ' dias ou mais em “' || v.titulo || '”. Mova no quadro ou dê o retorno.',
                   300));
      n := n + v_novos;
    end if;
  end loop;
  return n;
end
$$;

-- 6. O aviso novo `parados` (o mesmo da 20270105120000, com o 'parados') -----------------------------
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
                  'video_pedido', 'video_enviado', 'parados'));

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
                    'video_pedido', 'video_enviado', 'parados') then 'andamento'
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
                     'video_pedido', 'video_enviado', 'parados'))
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
                  'video_pedido', 'video_enviado', 'parados') then
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
                 when 'parados' then '/painel/anuncio/' || new.anuncio_id || '/quadro'
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
    ('parados', 'usuarios', 22, 'Candidatos parados',
     'Para quem publicou a vaga: a regra "Lembrar dos parados" achou candidatos na mesma etapa há dias.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     'Candidatos parados em “{{titulo}}”',
     'Oi, {{nome}}.

{{motivo}}',
     'Abrir o quadro')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- 7. Os números do processo ---------------------------------------------------------------------------
-- por vaga da conta: o funil e as medianas (horas até a 1ª resposta; dias até a entrevista e até contratar), com
-- a linha de todas as vagas juntas primeiro (anuncio_id vazio). p_dias: só as candidaturas dos últimos N dias (null: todas).
create or replace function public.numeros_do_processo(p_dias integer default null)
returns table (anuncio_id uuid, titulo text, status text, criado_em timestamptz,
               candidatos integer, respondidos integer, analise integer, entrevista integer, contratados integer,
               nao_seguiu integer, horas_resposta numeric, dias_entrevista numeric, dias_contratar numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  return query
  with base as (
    select c.anuncio_id, c.perfil_id, c.status, c.criado_em,
           coalesce(c.aceita_em, c.respondida_em) as respondida,
           coalesce(e.etapa, 'novo') as etapa,
           (select min(h.em) from privado.historico_etapas h
             where h.anuncio_id = c.anuncio_id and h.perfil_id = c.perfil_id and h.o_que = 'etapa:analise') as h_analise,
           least((select min(h.em) from privado.historico_etapas h
                   where h.anuncio_id = c.anuncio_id and h.perfil_id = c.perfil_id and h.o_que = 'etapa:entrevista'),
                 (select min(x.criado_em) from public.entrevistas x
                   where x.anuncio_id = c.anuncio_id and x.perfil_id = c.perfil_id)) as h_entrevista,
           (select min(h.em) from privado.historico_etapas h
             where h.anuncio_id = c.anuncio_id and h.perfil_id = c.perfil_id and h.o_que = 'etapa:contratado') as h_contratado,
           e.atualizado_em as etapa_em
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where a.autor_id = eu and a.tipo = 'vaga'
       and (p_dias is null or c.criado_em >= now() - make_interval(days => p_dias))
  )
  select a.id, a.titulo, a.status, a.criado_em,
         count(b.perfil_id)::integer,
         (count(b.perfil_id) filter (where b.respondida is not null or b.status <> 'pendente'))::integer,
         (count(b.perfil_id) filter (where b.etapa in ('analise', 'entrevista', 'contratado')
                                        or b.h_analise is not null or b.h_entrevista is not null))::integer,
         (count(b.perfil_id) filter (where b.etapa in ('entrevista', 'contratado') or b.h_entrevista is not null))::integer,
         (count(b.perfil_id) filter (where b.etapa = 'contratado'))::integer,
         (count(b.perfil_id) filter (where b.etapa = 'nao_seguiu' or b.status in ('dispensada', 'desfeito')))::integer,
         round((percentile_cont(0.5) within group (
                  order by extract(epoch from (b.respondida - b.criado_em)) / 3600)
                  filter (where b.respondida is not null))::numeric, 1),
         round((percentile_cont(0.5) within group (
                  order by extract(epoch from (b.h_entrevista - b.criado_em)) / 86400)
                  filter (where b.h_entrevista is not null))::numeric, 1),
         round((percentile_cont(0.5) within group (
                  order by extract(epoch from (coalesce(b.h_contratado, b.etapa_em) - b.criado_em)) / 86400)
                  filter (where b.etapa = 'contratado'))::numeric, 1)
    from public.anuncios a
    left join base b on b.anuncio_id = a.id
   where a.autor_id = eu and a.tipo = 'vaga' and a.status <> 'removido'
   -- e uma linha a mais, com o id vazio: todas as vagas juntas (as medianas de todos, não a média das vagas)
   group by grouping sets ((a.id, a.titulo, a.status, a.criado_em), ())
   order by a.id is not null, a.criado_em desc;
end
$$;

-- de onde vieram os candidatos: chamados de fora, convidados por você, as campanhas do cadastro ou direto
create or replace function public.numeros_origem(p_dias integer default null, p_anuncio uuid default null)
returns table (origem text, candidatos integer, entrevista integer, contratados integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  return query
  with base as (
    select case
             when exists (select 1 from public.convites_candidato k
                           where k.anuncio_id = c.anuncio_id and k.perfil_id = c.perfil_id) then 'de_fora'
             when exists (select 1 from public.convites_vaga k
                           where k.anuncio_id = c.anuncio_id and k.perfil_id = c.perfil_id) then 'convite'
             else coalesce((select 'campanha:' || split_part(o.origem, ':', 1) from privado.origens o
                             where o.usuario_id = c.perfil_id order by o.criado_em limit 1), 'direto')
           end as origem,
           coalesce(e.etapa, 'novo') as etapa,
           exists (select 1 from public.entrevistas x where x.anuncio_id = c.anuncio_id and x.perfil_id = c.perfil_id)
             or exists (select 1 from privado.historico_etapas h where h.anuncio_id = c.anuncio_id
                          and h.perfil_id = c.perfil_id and h.o_que = 'etapa:entrevista') as teve_entrevista
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where a.autor_id = eu and a.tipo = 'vaga' and (p_anuncio is null or a.id = p_anuncio)
       and (p_dias is null or c.criado_em >= now() - make_interval(days => p_dias))
  )
  select b.origem, count(*)::integer,
         (count(*) filter (where b.teve_entrevista or b.etapa in ('entrevista', 'contratado')))::integer,
         (count(*) filter (where b.etapa = 'contratado'))::integer
    from base b
   group by b.origem
   order by count(*) desc;
end
$$;

-- 8. Permissões ---------------------------------------------------------------------------------------
revoke all on function privado.elimina_pela_triagem(uuid, jsonb), privado.dispensa_eliminado(uuid, jsonb),
                       privado.minha_vaga_para_automacao(uuid)
  from public, anon, authenticated;
revoke all on function public.automacoes_da_vaga(uuid), public.salvar_automacoes(uuid, boolean, jsonb, integer),
                       public.automacao_mensagem_ao_mover(uuid, uuid[], text), public.numeros_do_processo(integer),
                       public.numeros_origem(integer, uuid)
  from public, anon;
grant execute on function public.automacoes_da_vaga(uuid), public.salvar_automacoes(uuid, boolean, jsonb, integer),
                          public.automacao_mensagem_ao_mover(uuid, uuid[], text), public.numeros_do_processo(integer),
                          public.numeros_origem(integer, uuid)
  to authenticated;
revoke all on function public.servidor_automacoes_parados(text, timestamptz) from public;
grant execute on function public.servidor_automacoes_parados(text, timestamptz) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
