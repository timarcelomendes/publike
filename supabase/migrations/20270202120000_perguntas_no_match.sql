-- Perguntas no match (04/11/2026; claude/plano-match-no-chat.md). No match de vaga, o chat faz até 3 perguntas
-- curtas ao candidato, uma por mensagem, em nome da vaga: o que a vaga pede e o currículo não mostra (CNH,
-- experiência, horário, escolaridade) e quando pode começar. Cada resposta é um toque; no fim, a empresa recebe as
-- respostas resumidas num aviso (sino, celular e e-mail). Pode rodar de novo.
--   1. Os avisos: 'match_empresa' (o match que não foi a empresa que deu), 'respostas_match' e 'matches_sem_contato'.
--   2. mensagens.automatica e mensagens.pergunta; as perguntas de cada match (privado.perguntas_do_match).
--   3. A chave em Automações da vaga ("Perguntar no chat quando der match", ligada por padrão).
--   4. notificar_match: o aviso do candidato fala das perguntas; o da empresa só quando não foi ela que aceitou.
--   5. No match, a fila; o robô monta as perguntas com o currículo (servidor_perguntas_para_montar) e começa a
--      conversa (servidor_comecar_perguntas).
--   6. responder_pergunta_do_chat: o toque do candidato, a próxima pergunta e, no fim, o aviso para a empresa.
--   7. A anotação da equipe (agência) não conta as mensagens automáticas.
--   8. Os matches sem contato: a prévia e o aviso que o admin manda em Admin › Retorno.

-- 1. Os avisos novos ---------------------------------------------------------------------------------------------
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida', 'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao', 'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca', 'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao', 'recado_no_ar', 'recado_retido', 'recado_forca', 'convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine', 'curriculo_publico', 'visita', 'visitas_do_dia', 'visitas_novidade', 'avaliacao_liberada', 'avaliacao_removida', 'mensagem_equipe', 'vagas_semana', 'talentos_semana', 'comunicado', 'noticias_do_dia', 'teste_pedido', 'teste_feito', 'lembrete_curtida', 'sem_resposta', 'pagamento', 'dispensada', 'entrevista_lembrete', 'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida', 'talentos_reativar', 'match_empresa', 'matches_sem_contato', 'respostas_match'));

CREATE OR REPLACE FUNCTION privado.grupo_do_aviso(p_tipo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_tipo = 'mensagem' then 'mensagens'
    when p_tipo in ('curtida', 'match', 'match_desfeito', 'etapa', 'contratacao', 'entrevista', 'entrevista_resposta',
                    'aceite_curriculo', 'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas',
                    'vaga_preenchida', 'recomendacao', 'avaliacao', 'teste_pedido', 'teste_feito',
                    'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete',
                    'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida',
                    'match_empresa', 'matches_sem_contato', 'respostas_match') then 'andamento'
    when p_tipo = 'conexao' then 'conexoes'
    when p_tipo in ('busca', 'seguindo') then 'vagas_novas'
    when p_tipo in ('vagas_semana', 'talentos_semana', 'talentos_reativar', 'resumo_vagas') then 'semana'
    when p_tipo in ('convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos',
                    'convite_vitrine') then 'convites'
    when p_tipo = 'noticias_do_dia' then 'noticias'
    else null
  end
$function$;

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
                  'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida',
                  'match_empresa', 'matches_sem_contato', 'respostas_match') then
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
                 when 'match_empresa' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 when 'matches_sem_contato' then '/painel/matches'
                 when 'respostas_match' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
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
                 when 'proposta' then '/proposta/' || new.anuncio_id
                 when 'candidatura_recebida' then '/painel/curtidas'
                 when 'proposta_resposta' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
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

-- 2. As mensagens automáticas e as perguntas de cada match ---------------------------------------------------------
-- automatica: o Publike mandou em nome de quem publicou (não conta como contato da empresa no Retorno nem no
-- "Responde em"). pergunta: {chave, rotulo, opcoes: [texto do botão], resposta: o índice escolhido ou null}.
alter table public.mensagens add column if not exists automatica boolean not null default false;
alter table public.mensagens add column if not exists pergunta jsonb;

create table if not exists privado.perguntas_do_match (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  -- 'match': logo depois do match; 'retomada': o botão dos matches sem contato (Admin › Retorno)
  origem text not null default 'match' check (origem in ('match', 'retomada')),
  situacao text not null default 'montar'
    check (situacao in ('montar', 'perguntando', 'respondido', 'sem_perguntas', 'cancelado')),
  -- [{chave, rotulo, texto, opcoes: [{rotulo, resposta, resumo}]}], montadas pelo site com o currículo
  perguntas jsonb not null default '[]'::jsonb,
  -- {chave: o índice da opção escolhida}
  respostas jsonb not null default '{}'::jsonb,
  pegado_em timestamptz,
  criado_em timestamptz not null default now(),
  perguntado_em timestamptz,
  respondido_em timestamptz,
  primary key (anuncio_id, perfil_id)
);
create index if not exists perguntas_do_match_montar on privado.perguntas_do_match (criado_em)
  where situacao = 'montar';
alter table privado.perguntas_do_match enable row level security;

-- 3. A chave em Automações da vaga (uma das prontas e grátis) ---------------------------------------------------------
alter table public.automacoes_vaga add column if not exists perguntar_no_match boolean not null default true;

alter table privado.automacoes_feitas drop constraint if exists automacoes_feitas_regra_check;
alter table privado.automacoes_feitas add constraint automacoes_feitas_regra_check
  check (regra in ('dispensar', 'mensagem', 'parado', 'recado', 'triagem', 'encerrar', 'preenchida', 'horarios',
                   'completa', 'perguntas'));

-- a chave nova nas regras da vaga (ler, copiar para as outras vagas e usar nas novas) e no gravar
create or replace function privado.regras_em_json(r public.automacoes_vaga)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'dispensar_eliminados', coalesce(r.dispensar_eliminados, false),
    'mensagens', coalesce(r.mensagens, '{}'::jsonb),
    'parado_dias', r.parado_dias,
    'recado', r.recado,
    'triagem_para_analise', coalesce(r.triagem_para_analise, false),
    'encerrar_dias', r.encerrar_dias,
    'encerrar_ao_preencher', coalesce(r.encerrar_ao_preencher, false),
    'horarios', r.horarios,
    'preencher_ao_completar', coalesce(r.preencher_ao_completar, false),
    'perguntar_no_match', coalesce(r.perguntar_no_match, true))
$$;

create or replace function privado.aplicar_automacoes(p_anuncio uuid, p_conta uuid, p_eu uuid, p_regras jsonb,
                                                     p_estrito boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb := coalesce(p_regras, '{}'::jsonb);
  v_mensagens jsonb := '{}'::jsonb;
  k text;
  v text;
  v_parado integer;
  v_encerrar integer;
  v_recado text := nullif(btrim(coalesce(r ->> 'recado', '')), '');
  v_horarios jsonb;
  v_formato text;
  v_local text;
  v_duracao integer;
  v_medida boolean := privado.automacoes_liberado(p_conta);
  v_dispensar boolean := coalesce((r ->> 'dispensar_eliminados')::boolean, false);
  v_triagem boolean := coalesce((r ->> 'triagem_para_analise')::boolean, false);
  x public.automacoes_vaga;
begin
  if jsonb_typeof(r) <> 'object' then
    raise exception 'Confira as automações.' using errcode = '22023';
  end if;
  -- a mensagem pronta por etapa: as de hoje e as próprias da conta
  if jsonb_typeof(r -> 'mensagens') = 'object' then
    for k, v in select * from jsonb_each_text(r -> 'mensagens') loop
      continue when coalesce(v, '') = '';
      if not (k in ('analise', 'entrevista', 'contratado')
              or (k ~ '^sub:[0-9a-f-]{36}$'
                  and exists (select 1 from public.etapas_da_conta e
                               where e.id::text = substr(k, 5) and e.conta_id = p_conta)))
         or v !~ '^[0-9a-f-]{36}$'
         or not exists (select 1 from public.modelos_mensagem m
                         where m.id::text = v and m.autor_id in (p_eu, p_conta)) then
        if p_estrito then
          raise exception 'Mensagem pronta não encontrada.' using errcode = '22023';
        end if;
        continue;
      end if;
      v_mensagens := v_mensagens || jsonb_build_object(k, v);
    end loop;
  end if;
  v_parado := nullif(r ->> 'parado_dias', '')::integer;
  if v_parado is not null and v_parado not between 2 and 30 then
    if p_estrito then raise exception 'O lembrete vai de 2 a 30 dias.' using errcode = '22023'; end if;
    v_parado := null;
  end if;
  v_encerrar := nullif(r ->> 'encerrar_dias', '')::integer;
  if v_encerrar is not null and v_encerrar not between 3 and 60 then
    if p_estrito then raise exception 'O retorno automático vai de 3 a 60 dias.' using errcode = '22023'; end if;
    v_encerrar := null;
  end if;
  if v_recado is not null and char_length(v_recado) not between 10 and 400 then
    if p_estrito then raise exception 'O recado tem de 10 a 400 letras.' using errcode = '22023'; end if;
    v_recado := null;
  end if;
  -- sem as Automações sob medida (só na tela; a cópia e o padrão das vagas novas já pedem o recurso): as prontas,
  -- do jeito do Publike. O que a vaga já tinha antes fica como estava (dá para salvar de novo sem mexer).
  if p_estrito and not v_medida then
    select * into x from public.automacoes_vaga y where y.anuncio_id = p_anuncio;
    if (v_mensagens <> '{}'::jsonb and v_mensagens is distinct from coalesce(x.mensagens, '{}'::jsonb))
       or (v_dispensar and not coalesce(x.dispensar_eliminados, false))
       or (v_triagem and not coalesce(x.triagem_para_analise, false))
       or (v_recado is not null and v_recado <> privado.recado_pronto() and v_recado is distinct from x.recado)
       or (coalesce(v_parado, 5) <> 5 and v_parado is distinct from x.parado_dias)
       or (coalesce(v_encerrar, 7) <> 7 and v_encerrar is distinct from x.encerrar_dias) then
      raise exception 'Personalizar as automações é das Automações sob medida. Experimente 15 dias grátis na aba Automações.'
        using errcode = 'P0001', hint = 'automacoes_fechado';
    end if;
  end if;
  if jsonb_typeof(r -> 'horarios') = 'object' then
    v_formato := r -> 'horarios' ->> 'formato';
    v_local := nullif(left(btrim(coalesce(r -> 'horarios' ->> 'local', '')), 300), '');
    v_duracao := coalesce(nullif(r -> 'horarios' ->> 'duracao', '')::integer, 30);
    if v_formato not in ('presencial', 'telefone', 'video', 'publike') or v_duracao not between 15 and 180
       or (v_formato = 'presencial' and v_local is null)
       or (v_formato = 'video' and coalesce(v_local, '') !~* '^https://') then
      if p_estrito then
        raise exception 'Confira como vai ser a entrevista: o endereço ou o link da chamada.' using errcode = '22023';
      end if;
    else
      v_horarios := jsonb_build_object('formato', v_formato, 'local', v_local, 'duracao', v_duracao);
    end if;
  end if;
  insert into public.automacoes_vaga (anuncio_id, dispensar_eliminados, mensagens, parado_dias, recado,
                                      triagem_para_analise, encerrar_dias, encerrar_ao_preencher, horarios,
                                      preencher_ao_completar, perguntar_no_match, atualizado_em)
  values (p_anuncio, v_dispensar, v_mensagens, v_parado, v_recado, v_triagem, v_encerrar,
          coalesce((r ->> 'encerrar_ao_preencher')::boolean, false), v_horarios,
          coalesce((r ->> 'preencher_ao_completar')::boolean, false),
          coalesce((r ->> 'perguntar_no_match')::boolean, true), now())
  on conflict (anuncio_id) do update
    set dispensar_eliminados = excluded.dispensar_eliminados, mensagens = excluded.mensagens,
        parado_dias = excluded.parado_dias, recado = excluded.recado,
        triagem_para_analise = excluded.triagem_para_analise, encerrar_dias = excluded.encerrar_dias,
        encerrar_ao_preencher = excluded.encerrar_ao_preencher, horarios = excluded.horarios,
        preencher_ao_completar = excluded.preencher_ao_completar, perguntar_no_match = excluded.perguntar_no_match,
        atualizado_em = now();
end
$$;

-- 4. O match ---------------------------------------------------------------------------------------------------

-- as perguntas valem: vaga (nos serviços nada muda), a chave da vaga ligada (sem a linha, ligada) e quem deu match
-- já entrou alguma vez (quem a empresa trouxe de fora e nunca entrou não usa o chat)
create or replace function privado.perguntas_no_match_valem(p_anuncio uuid, p_perfil uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.anuncios a
                   left join public.automacoes_vaga x on x.anuncio_id = a.id
                  where a.id = p_anuncio and a.tipo = 'vaga' and coalesce(x.perguntar_no_match, true))
     and exists (select 1 from auth.users u where u.id = p_perfil and u.last_sign_in_at is not null)
$$;

CREATE OR REPLACE FUNCTION public.notificar_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_titulo text;
  v_tipo text;
  v_direto boolean;
  quem text;
  dono uuid;
  v_candidato text;
  v_agora boolean;
  v_perguntas boolean;
begin
  if new.status = 'match' and old.status is distinct from 'match' then
    select a.titulo, a.tipo, a.contato_direto, p.nome, p.id into v_titulo, v_tipo, v_direto, quem, dono
      from public.anuncios a join public.perfis p on p.id = a.autor_id
     where a.id = new.anuncio_id;
    -- o match da vaga de contato direto, que saiu agora com a curtida
    v_agora := coalesce(v_direto, false) and new.respondida_em > now() - interval '1 minute'
               and (select public.conta_atual()) is distinct from dono;
    v_perguntas := privado.perguntas_no_match_valem(new.anuncio_id, new.perfil_id);
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (new.perfil_id, 'match', new.anuncio_id, dono,
            left(case when v_agora
                      then 'Deu match! O contato de ' || coalesce(quem, 'quem publicou') || ' em “' || v_titulo
                           || '” já está liberado. Chame no WhatsApp.'
                      when v_tipo = 'servico'
                      then 'Deu match! ' || coalesce(quem, 'O profissional') || ' aceitou seu pedido em “' || v_titulo
                           || '”. Agora é só conversar.'
                      else 'Deu match! ' || coalesce(quem, 'Quem publicou') || ' curtiu você de volta em “' || v_titulo
                           || '”.' || case when v_perguntas then '' else ' Agora é só conversar.' end
                 end
                 || case when v_perguntas then ' Para adiantar, responda no chat as perguntas rápidas da vaga.'
                         else '' end, 300));
    -- a empresa: só quando o match não foi ela que deu (o currículo chegou depois do aceite, o Publike liberou o
    -- contato). Quando ela aceita, já vê na tela; na vaga de contato direto, o aviso da curtida já disse isso.
    if v_tipo = 'vaga' and not v_agora and (select public.conta_atual()) is distinct from dono then
      select p.nome into v_candidato from public.perfis p where p.id = new.perfil_id;
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
      values (dono, 'match_empresa', new.anuncio_id, new.perfil_id,
              left('Você e ' || coalesce(v_candidato, 'a pessoa') || ' deram match em “' || v_titulo
                   || '”. O contato de vocês está liberado: chame no WhatsApp ou mande uma mensagem pelo Publike.'
                   || case when v_perguntas
                           then ' Perguntamos no chat o que a vaga precisa; as respostas chegam para você.'
                           else '' end, 300));
    end if;
  end if;
  return null;
end
$function$;

-- e no celular também (a lista de 20270130120000, mais os três)
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
                     'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida',
                     'talentos_reativar', 'match_empresa', 'matches_sem_contato',
                     'respostas_match'))
  execute function privado.notificacao_para_celular();

-- os textos (Admin › E-mails › Textos) e as chaves (Todos os e-mails). Rodando de novo, o texto que o Admin não
-- mexeu acompanha.
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('match_empresa', 'usuarios', 3, 'Match: para quem publicou',
     'Para quem publicou a vaga: deu match sem ser pelo aceite na tela (o currículo chegou depois do aceite ou o Publike liberou o contato). Quando a empresa aceita, ela já vê na hora.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     '{{quem}} deu match com a sua vaga',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver a ficha'),
    ('respostas_match', 'usuarios', 3, 'Respostas do match',
     'Para quem publicou a vaga: o candidato respondeu às perguntas que o chat faz no match (Automações › Perguntar no chat quando der match), com o resumo das respostas.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     '{{quem}} respondeu às perguntas da vaga',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver a ficha'),
    ('matches_sem_contato', 'usuarios', 4, 'Matches esperando o seu contato',
     'Para quem tem match sem contato nenhum em vaga no ar: quem está esperando. Sai quando o admin manda, em Admin › Retorno (no máximo um a cada 7 dias para a mesma conta).',
     array['nome', 'motivo', 'link'],
     'Tem gente esperando o seu contato no Publike',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver os matches')
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

-- o e-mail sai no máximo 1 a cada 30 minutos para a mesma conta, como o da candidatura (o sino recebe todos)
insert into privado.regras_email (modelo, intervalo_min)
values ('match_empresa', 30), ('respostas_match', 30), ('matches_sem_contato', null)
on conflict (modelo) do update set intervalo_min = excluded.intervalo_min
 where regras_email.atualizado_por is null;

-- 5. No match, a fila das perguntas; o robô monta e começa a conversa ----------------------------------------------
create or replace function privado.perguntas_ao_dar_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if privado.perguntas_no_match_valem(new.anuncio_id, new.perfil_id) then
    -- uma vez por match: o match desfeito e refeito não pergunta de novo
    insert into privado.perguntas_do_match (anuncio_id, perfil_id) values (new.anuncio_id, new.perfil_id)
    on conflict (anuncio_id, perfil_id) do nothing;
  end if;
  return null;
end
$$;
drop trigger if exists curtidas_perguntas_no_match on public.curtidas;
create trigger curtidas_perguntas_no_match
  after update of status on public.curtidas
  for each row
  when (new.status = 'match' and old.status is distinct from 'match')
  execute function privado.perguntas_ao_dar_match();

-- a pergunta numa mensagem, em nome de quem publicou (os botões vão em `pergunta`)
create or replace function privado.mandar_pergunta_do_match(p_anuncio uuid, p_dono uuid, p_perfil uuid, p jsonb)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.mensagens (anuncio_id, perfil_id, autor_id, texto, automatica, pergunta)
  values (p_anuncio, p_perfil, p_dono, p ->> 'texto', true,
          jsonb_build_object('chave', p ->> 'chave', 'rotulo', p ->> 'rotulo',
                             'opcoes', (select jsonb_agg(x.o ->> 'rotulo' order by x.n)
                                          from jsonb_array_elements(p -> 'opcoes') with ordinality x(o, n)),
                             'resposta', null))
  returning id
$$;

-- "a, b e c"
create or replace function privado.lista_em_frase(p text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(cardinality(p), 0) = 0 then ''
              when cardinality(p) = 1 then p[1]
              else array_to_string(p[1:cardinality(p) - 1], ', ') || ' e ' || p[cardinality(p)] end
$$;

-- o que o site precisa para montar as perguntas: o que a vaga pede e o que o currículo mostra (o mesmo do % de match)
create or replace function public.servidor_perguntas_para_montar(p_chave text, p_limite integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  saida jsonb := '[]'::jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  for r in
    with escolhidos as (
      select q.anuncio_id, q.perfil_id from privado.perguntas_do_match q
       where q.situacao = 'montar' and (q.pegado_em is null or q.pegado_em < now() - interval '10 minutes')
       order by q.criado_em
       limit least(greatest(coalesce(p_limite, 20), 1), 100)
       for update skip locked)
    update privado.perguntas_do_match q set pegado_em = now()
      from escolhidos s
     where q.anuncio_id = s.anuncio_id and q.perfil_id = s.perfil_id
    returning q.anuncio_id, q.perfil_id, q.origem
  loop
    saida := saida || jsonb_build_array(jsonb_build_object(
      'anuncio_id', r.anuncio_id,
      'perfil_id', r.perfil_id,
      'origem', r.origem,
      'vaga', (select jsonb_build_object('escolaridade_minima', a.escolaridade_minima, 'experiencia', a.experiencia,
                                         'cnh', a.cnh, 'jornada', a.jornada, 'horario_detalhe', a.horario_detalhe,
                                         'perguntas', a.perguntas)
                 from public.anuncios a where a.id = r.anuncio_id),
      'curriculo', (select jsonb_build_object(
                             'escolaridade', cv.escolaridade, 'estudos', cv.estudos, 'cnh', cv.cnh,
                             'disponibilidade', cv.disponibilidade,
                             'experiencias', case when jsonb_typeof(cv.experiencias) = 'array'
                                                  then jsonb_array_length(cv.experiencias) else 0 end)
                      from public.curriculos cv where cv.perfil_id = r.perfil_id)));
  end loop;
  return saida;
end
$$;

-- começa a conversa: a mensagem de abertura e a primeira pergunta. O site monta as perguntas; o banco confere o
-- formato, que o match continua e que a conversa está aberta. Devolve quantas perguntas vão (0: nenhuma).
create or replace function public.servidor_comecar_perguntas(p_chave text, p_anuncio uuid, p_perfil uuid,
                                                             p_perguntas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  q privado.perguntas_do_match;
  a public.anuncios;
  v_lista jsonb := '[]'::jsonb;
  v_opcoes jsonb;
  p jsonb;
  o jsonb;
  n integer;
begin
  perform privado.exigir_servidor(p_chave);
  select * into q from privado.perguntas_do_match x
   where x.anuncio_id = p_anuncio and x.perfil_id = p_perfil for update;
  if q.anuncio_id is null or q.situacao <> 'montar' then
    return 0;
  end if;
  select * into a from public.anuncios x where x.id = p_anuncio;
  if not exists (select 1 from public.curtidas c
                  where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil and c.status = 'match')
     or a.status in ('em_analise', 'removido')
     or privado.ha_bloqueio(a.autor_id, p_perfil)
     or not privado.dupla_ligada(a.autor_id, p_perfil) then
    update privado.perguntas_do_match set situacao = 'cancelado'
     where anuncio_id = p_anuncio and perfil_id = p_perfil;
    return 0;
  end if;
  if jsonb_typeof(p_perguntas) = 'array' then
    for p in select x.value from jsonb_array_elements(p_perguntas) with ordinality x(value, n) order by x.n loop
      exit when jsonb_array_length(v_lista) >= 3;
      continue when jsonb_typeof(p) <> 'object'
        or coalesce(p ->> 'chave', '') not in ('cnh', 'experiencia', 'horario', 'escolaridade', 'comecar')
        or v_lista @> jsonb_build_array(jsonb_build_object('chave', p ->> 'chave'))
        or char_length(coalesce(p ->> 'texto', '')) not between 5 and 200
        or char_length(coalesce(p ->> 'rotulo', '')) not between 2 and 40
        or jsonb_typeof(p -> 'opcoes') is distinct from 'array'
        or jsonb_array_length(p -> 'opcoes') not between 2 and 4;
      v_opcoes := '[]'::jsonb;
      for o in select x.value from jsonb_array_elements(p -> 'opcoes') with ordinality x(value, n) order by x.n loop
        if jsonb_typeof(o) <> 'object'
           or char_length(coalesce(o ->> 'rotulo', '')) not between 1 and 30
           or char_length(coalesce(o ->> 'resposta', '')) not between 2 and 200
           or char_length(coalesce(o ->> 'resumo', '')) not between 2 and 120 then
          v_opcoes := null;
          exit;
        end if;
        v_opcoes := v_opcoes || jsonb_build_array(jsonb_build_object(
          'rotulo', o ->> 'rotulo', 'resposta', o ->> 'resposta', 'resumo', o ->> 'resumo'));
      end loop;
      continue when v_opcoes is null;
      v_lista := v_lista || jsonb_build_array(jsonb_build_object(
        'chave', p ->> 'chave', 'rotulo', p ->> 'rotulo', 'texto', p ->> 'texto', 'opcoes', v_opcoes));
    end loop;
  end if;
  n := jsonb_array_length(v_lista);
  if n = 0 then
    update privado.perguntas_do_match set situacao = 'sem_perguntas'
     where anuncio_id = p_anuncio and perfil_id = p_perfil;
    return 0;
  end if;

  insert into public.mensagens (anuncio_id, perfil_id, autor_id, texto, automatica)
  values (p_anuncio, p_perfil, a.autor_id,
          left(case when q.origem = 'retomada'
                    then 'Ainda tem interesse em “' || a.titulo || '”? Para adiantar, '
                    else 'Deu match em “' || a.titulo || '”! Para adiantar, ' end
               || case when n = 1 then '1 pergunta rápida.' else n || ' perguntas rápidas.' end, 2000),
          true);
  perform privado.mandar_pergunta_do_match(p_anuncio, a.autor_id, p_perfil, v_lista -> 0);
  update privado.perguntas_do_match
     set situacao = 'perguntando', perguntas = v_lista, perguntado_em = now()
   where anuncio_id = p_anuncio and perfil_id = p_perfil;
  -- no match, o aviso do match já falou das perguntas; nos matches sem contato (Admin › Retorno), o aviso de
  -- mensagem nova (um só até abrir a conversa, como no chat)
  if q.origem = 'retomada' and not exists (
    select 1 from public.notificacoes n
     where n.destinatario_id = p_perfil and n.tipo = 'mensagem' and n.ator_id = a.autor_id and not n.lida
  ) then
    insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
    select p_perfil, 'mensagem', a.autor_id,
           left(coalesce(privado.nome_nas_conversas(d.id, d.nome, d.tipo), 'Quem publicou')
                || ' quer saber se você ainda tem interesse em “' || a.titulo
                || '”. Responda no chat as perguntas rápidas.', 300)
      from public.perfis d where d.id = a.autor_id;
  end if;
  insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra, detalhe)
  values (p_anuncio, p_perfil, 'perguntas', q.origem)
  on conflict do nothing;
  return n;
end
$$;

-- 6. O toque do candidato -------------------------------------------------------------------------------------------
-- grava a resposta, manda a próxima pergunta ou, no fim, agradece e avisa quem publicou com o resumo. Devolve
-- {fim, mensagens: os ids das mensagens novas, na ordem}.
create or replace function public.responder_pergunta_do_chat(p_mensagem bigint, p_opcao integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  m public.mensagens;
  q privado.perguntas_do_match;
  a public.anuncios;
  p jsonb;
  v_proxima jsonb;
  v_resumos text[];
  v_nome text;
  v_tipo text;
  v_ids bigint[] := '{}';
  v_id bigint;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select * into m from public.mensagens x where x.id = p_mensagem;
  if m.id is null or not m.automatica or m.pergunta is null or m.perfil_id is distinct from eu then
    raise exception 'Pergunta não encontrada.' using errcode = 'P0002';
  end if;
  select * into q from privado.perguntas_do_match x
   where x.anuncio_id = m.anuncio_id and x.perfil_id = eu for update;
  if q.anuncio_id is null or q.situacao <> 'perguntando' or (m.pergunta ->> 'resposta') is not null
     or q.respostas ? (m.pergunta ->> 'chave') then
    raise exception 'Esta pergunta já foi respondida.' using errcode = 'P0001';
  end if;
  select x.value into p from jsonb_array_elements(q.perguntas) x where x.value ->> 'chave' = m.pergunta ->> 'chave';
  if p is null or p_opcao is null or p_opcao < 0 or p_opcao >= jsonb_array_length(p -> 'opcoes') then
    raise exception 'Escolha uma das respostas.' using errcode = '22023';
  end if;
  select * into a from public.anuncios x where x.id = m.anuncio_id;
  if not privado.dupla_ligada(eu, a.autor_id) then
    raise exception 'A conversa abre quando dá match ou quando a conexão é aceita.' using errcode = '42501';
  end if;
  perform privado.conferir_limite('mensagem', 300, 'Você mandou muitas mensagens hoje. Tente de novo amanhã.');

  update public.mensagens set pergunta = jsonb_set(pergunta, '{resposta}', to_jsonb(p_opcao)) where id = m.id;
  insert into public.mensagens (anuncio_id, perfil_id, autor_id, texto)
  values (a.id, eu, eu, p -> 'opcoes' -> p_opcao ->> 'resposta')
  returning id into v_id;
  v_ids := v_ids || v_id;
  update privado.perguntas_do_match
     set respostas = respostas || jsonb_build_object(p ->> 'chave', p_opcao)
   where anuncio_id = q.anuncio_id and perfil_id = eu
  returning * into q;

  select x.value into v_proxima
    from jsonb_array_elements(q.perguntas) with ordinality x(value, n)
   where not q.respostas ? (x.value ->> 'chave')
   order by x.n
   limit 1;
  if v_proxima is not null then
    v_ids := v_ids || privado.mandar_pergunta_do_match(a.id, a.autor_id, eu, v_proxima);
    return jsonb_build_object('fim', false, 'mensagens', to_jsonb(v_ids));
  end if;

  insert into public.mensagens (anuncio_id, perfil_id, autor_id, texto, automatica)
  values (a.id, eu, a.autor_id, 'Obrigado! Já recebemos as suas respostas.', true)
  returning id into v_id;
  v_ids := v_ids || v_id;
  update privado.perguntas_do_match set situacao = 'respondido', respondido_em = now()
   where anuncio_id = q.anuncio_id and perfil_id = eu;
  select array_agg(x.value -> 'opcoes' -> ((q.respostas ->> (x.value ->> 'chave'))::integer) ->> 'resumo'
                   order by x.n)
    into v_resumos
    from jsonb_array_elements(q.perguntas) with ordinality x(value, n);
  select privado.nome_nas_conversas(pp.id, pp.nome, pp.tipo), pp.tipo into v_nome, v_tipo
    from public.perfis pp where pp.id = eu;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (a.autor_id, 'respostas_match', a.id, eu,
          left(coalesce(case when v_tipo = 'pessoa' then split_part(v_nome, ' ', 1) else v_nome end, 'A pessoa')
               || ' respondeu às perguntas de “' || a.titulo || '”: ' || privado.lista_em_frase(v_resumos)
               || '. Chame no WhatsApp ou responda no chat.', 300));
  return jsonb_build_object('fim', true, 'mensagens', to_jsonb(v_ids));
end
$$;

-- as respostas de cada candidato da vaga, para o quadro: {perfil_id: [{rotulo, resposta (null: ainda não)}]}
create or replace function public.respostas_do_chat_da_vaga(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_automacao(p_anuncio);
begin
  return coalesce((
    select jsonb_object_agg(q.perfil_id, (
             select jsonb_agg(jsonb_build_object(
                      'rotulo', x.value ->> 'rotulo',
                      'resposta', x.value -> 'opcoes' -> ((q.respostas ->> (x.value ->> 'chave'))::integer) ->> 'rotulo')
                    order by x.n)
               from jsonb_array_elements(q.perguntas) with ordinality x(value, n)))
      from privado.perguntas_do_match q
     where q.anuncio_id = a.id and q.situacao in ('perguntando', 'respondido')), '{}'::jsonb);
end
$$;

-- 7. A anotação da equipe (agência): a mensagem automática não é alguém da equipe conversando ------------------
create or replace function privado.equipe_anota_mensagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor uuid;
  v_titulo text;
begin
  if new.automatica then
    return null;
  end if;
  select a.autor_id, a.titulo into v_autor, v_titulo from public.anuncios a where a.id = new.anuncio_id;
  if v_autor is null or new.autor_id is distinct from v_autor then
    return null;
  end if;
  if exists (select 1 from public.atividades_equipe x
              where x.agencia_id = v_autor and x.anuncio_id = new.anuncio_id and x.perfil_id = new.perfil_id
                and x.membro_id = (select auth.uid()) and x.texto like 'conversou com %'
                and x.criado_em > now() - interval '30 minutes') then
    return null;
  end if;
  perform privado.anotar_atividade(v_autor,
    'conversou com {candidato} sobre “' || v_titulo || '”',
    new.anuncio_id, new.perfil_id);
  return null;
end
$$;

revoke all on function privado.perguntas_no_match_valem(uuid, uuid), privado.perguntas_ao_dar_match(),
                       privado.mandar_pergunta_do_match(uuid, uuid, uuid, jsonb), privado.lista_em_frase(text[])
  from public, anon, authenticated;
revoke all on function public.servidor_perguntas_para_montar(text, integer),
                       public.servidor_comecar_perguntas(text, uuid, uuid, jsonb) from public;
grant execute on function public.servidor_perguntas_para_montar(text, integer),
                          public.servidor_comecar_perguntas(text, uuid, uuid, jsonb)
  to anon, authenticated, service_role;
revoke execute on function public.responder_pergunta_do_chat(bigint, integer),
                           public.respostas_do_chat_da_vaga(uuid) from public, anon;
grant execute on function public.responder_pergunta_do_chat(bigint, integer), public.respostas_do_chat_da_vaga(uuid)
  to authenticated;

-- 8. Os matches sem contato (Admin › Retorno) e os números sem as mensagens automáticas ---------------------------

-- o Retorno: a mensagem automática não é contato da empresa nem a última ação dela
create or replace function privado.retorno_das_candidaturas(p_desde timestamptz, p_conta uuid)
returns table (
  anuncio_id uuid,
  perfil_id uuid,
  autor_id uuid,
  status text,
  etapa text,
  criado_em timestamptz,
  respondida_em timestamptz,
  vista_em timestamptz,
  mensagens bigint,
  ultima_mensagem timestamptz,
  contato_em timestamptz,
  avisada boolean,
  respondida boolean,
  com_contato boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select cu.anuncio_id, cu.perfil_id, a.autor_id, cu.status, cu.criado_em, cu.respondida_em
      from public.curtidas cu
      join public.anuncios a on a.id = cu.anuncio_id
     where a.tipo = 'vaga'
       and (p_desde is null or cu.criado_em >= p_desde)
       and (p_conta is null or a.autor_id = p_conta)
  ), x as (
    select c.*,
           (select e.etapa from public.etapas_candidatos e
             where e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id) as etapa,
           (select v.vista_em from privado.candidaturas_vistas v
             where v.anuncio_id = c.anuncio_id and v.perfil_id = c.perfil_id) as vista_em,
           -- as mensagens da empresa (ou da equipe dela) para a pessoa, fora as automáticas (as perguntas do match): na conversa da vaga ou na conversa direta
           (select count(*) from public.mensagens m
             where m.autor_id <> c.perfil_id and not m.automatica
               and ((m.anuncio_id = c.anuncio_id and m.perfil_id = c.perfil_id)
                    or (m.conversa_id in (select cv.id from public.conversas cv
                                           where (cv.conta_a = c.autor_id and cv.conta_b = c.perfil_id)
                                              or (cv.conta_b = c.autor_id and cv.conta_a = c.perfil_id))
                        and m.criado_em >= c.criado_em))) as mensagens,
           (select max(m.criado_em) from public.mensagens m
             where m.autor_id <> c.perfil_id and not m.automatica
               and ((m.anuncio_id = c.anuncio_id and m.perfil_id = c.perfil_id)
                    or (m.conversa_id in (select cv.id from public.conversas cv
                                           where (cv.conta_a = c.autor_id and cv.conta_b = c.perfil_id)
                                              or (cv.conta_b = c.autor_id and cv.conta_a = c.perfil_id))
                        and m.criado_em >= c.criado_em))) as ultima_mensagem,
           (select min(h.em) from privado.historico_etapas h
             where h.anuncio_id = c.anuncio_id and h.perfil_id = c.perfil_id and h.o_que like 'contato:%') as contato_em,
           -- a pessoa recebeu o aviso do match, da etapa ou da dispensa (o retorno automático)
           exists (select 1 from public.notificacoes n
                    where n.destinatario_id = c.perfil_id and n.anuncio_id = c.anuncio_id
                      and n.tipo in ('match', 'dispensada', 'etapa', 'entrevista', 'contratacao')) as avisada
      from c
  )
  select x.anuncio_id, x.perfil_id, x.autor_id, x.status, x.etapa, x.criado_em, x.respondida_em, x.vista_em,
         x.mensagens, x.ultima_mensagem, x.contato_em, x.avisada,
         (x.status <> 'pendente' or coalesce(x.etapa, 'novo') <> 'novo' or x.mensagens > 0) as respondida,
         (x.mensagens > 0 or x.contato_em is not null) as com_contato
    from x
$$;

-- os números do produto: a mensagem automática não é alguém usando o Publike
create or replace function public.admin_metricas_produto()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v jsonb;
begin
  perform privado.exigir_admin();

  with
  contas as (
    select u.id, u.created_at as criada_em, (u.created_at at time zone 'America/Sao_Paulo')::date as criada, p.tipo
      from auth.users u
      left join public.perfis p on p.id = u.id
  ),
  -- um dia de uso por conta (os últimos 120 dias)
  uso as (
    select distinct q.conta_id, q.dia
      from (
        select a.conta_id, a.dia from privado.contas_ativas a where a.dia > hoje - 120
        union all
        select cu.perfil_id, (cu.criado_em at time zone 'America/Sao_Paulo')::date
          from public.curtidas cu where cu.criado_em > now() - interval '120 days'
        union all
        select an.autor_id, (cu.respondida_em at time zone 'America/Sao_Paulo')::date
          from public.curtidas cu join public.anuncios an on an.id = cu.anuncio_id
         where cu.respondida_em > now() - interval '120 days'
        union all
        select an.autor_id, (an.criado_em at time zone 'America/Sao_Paulo')::date
          from public.anuncios an where an.criado_em > now() - interval '120 days'
        union all
        select m.autor_id, (m.criado_em at time zone 'America/Sao_Paulo')::date
          from public.mensagens m where m.criado_em > now() - interval '120 days' and not m.automatica
        union all
        select cv.perfil_id, (cv.atualizado_em at time zone 'America/Sao_Paulo')::date
          from public.curriculos cv where cv.atualizado_em > now() - interval '120 days'
        union all
        select x.pedida_por, (x.criado_em at time zone 'America/Sao_Paulo')::date
          from public.conexoes x where x.criado_em > now() - interval '120 days'
        union all
        select c.id, c.criada from contas c where c.criada > hoje - 120
      ) q
      join contas c on c.id = q.conta_id
     where q.dia > hoje - 120 and q.dia <= hoje
  ),
  -- 8 blocos de 7 dias, o 0 termina hoje
  semanas as (
    select k, hoje - 7 * k - 6 as inicio, hoje - 7 * k as fim from generate_series(0, 7) k
  ),
  -- a primeira ação de valor de cada conta criada entre 37 e 8 dias atrás (a semana dela já terminou):
  -- quem procura, o currículo ou a primeira curtida; quem contrata ou presta serviço, o primeiro anúncio
  coorte_ativacao as (
    select c.id, c.criada_em, c.tipo,
           least(
             case when c.tipo = 'pessoa' then (select min(cv.criado_em) from public.curriculos cv where cv.perfil_id = c.id) end,
             case when c.tipo = 'pessoa' then (select min(cu.criado_em) from public.curtidas cu where cu.perfil_id = c.id) end,
             (select min(an.criado_em) from public.anuncios an where an.autor_id = c.id)
           ) as primeira
      from contas c
     where c.criada between hoje - 37 and hoje - 8
  ),
  -- quem criou a conta nos últimos 30 dias, para os funis
  novas as (
    select c.id, c.tipo,
           exists (select 1 from public.curriculos cv where cv.perfil_id = c.id) as curriculo,
           exists (select 1 from public.curtidas cu join public.anuncios an on an.id = cu.anuncio_id
                    where cu.perfil_id = c.id and an.tipo = 'vaga') as curtiu,
           exists (select 1 from public.curtidas cu join public.anuncios an on an.id = cu.anuncio_id
                    where cu.perfil_id = c.id and an.tipo = 'vaga' and cu.status = 'match') as match_pessoa,
           exists (select 1 from public.anuncios an where an.autor_id = c.id and an.tipo = 'vaga') as vaga,
           exists (select 1 from public.curtidas cu join public.anuncios an on an.id = cu.anuncio_id
                    where an.autor_id = c.id and an.tipo = 'vaga') as candidato,
           exists (select 1 from public.curtidas cu join public.anuncios an on an.id = cu.anuncio_id
                    where an.autor_id = c.id and an.tipo = 'vaga' and cu.status = 'match') as aceitou
      from contas c
     where c.criada > hoje - 30
  ),
  -- as vagas publicadas entre 37 e 8 dias atrás (os 7 dias delas já passaram)
  vagas_coorte as (
    select an.id, an.criado_em,
           (select min(cu.criado_em) from public.curtidas cu where cu.anuncio_id = an.id) as primeira,
           (select count(*) from public.curtidas cu where cu.anuncio_id = an.id) as candidatos
      from public.anuncios an
     where an.tipo = 'vaga' and an.status <> 'removido'
       and (an.criado_em at time zone 'America/Sao_Paulo')::date between hoje - 37 and hoje - 8
  ),
  -- as curtidas em vagas feitas entre 37 e 8 dias atrás (a resposta teve 7 dias)
  curtidas_coorte as (
    select cu.criado_em, cu.respondida_em, cu.status
      from public.curtidas cu join public.anuncios an on an.id = cu.anuncio_id and an.tipo = 'vaga'
     where (cu.criado_em at time zone 'America/Sao_Paulo')::date between hoje - 37 and hoje - 8
  ),
  por_dia as (select u.dia, count(*)::numeric as n from uso u group by u.dia)
  select jsonb_build_object(
    'hoje', hoje,
    -- desde quando "entrou no site" conta (antes, só as ações)
    'desde', (select min(a.dia) from privado.contas_ativas a),
    'ativos', jsonb_build_object(
      'dau_hoje', (select count(*) from uso u where u.dia = hoje),
      -- a média dos 7 dias inteiros antes de hoje (dia sem ninguém conta zero)
      'dau_media', (select round(avg(coalesce(d.n, 0)), 1)
                      from generate_series(hoje - 7, hoje - 1, interval '1 day') g(dia)
                      left join por_dia d on d.dia = g.dia::date),
      'wau', (select count(distinct u.conta_id) from uso u where u.dia > hoje - 7),
      'mau', (select count(distinct u.conta_id) from uso u where u.dia > hoje - 30),
      'mau_antes', (select count(distinct u.conta_id) from uso u where u.dia between hoje - 59 and hoje - 30),
      'mau_pessoas', (select count(distinct u.conta_id) from uso u join contas c on c.id = u.conta_id
                       where u.dia > hoje - 30 and c.tipo = 'pessoa'),
      'mau_empresas', (select count(distinct u.conta_id) from uso u join contas c on c.id = u.conta_id
                        where u.dia > hoje - 30 and c.tipo in ('empresa', 'comercio', 'agencia')),
      -- quantos dias, em média, cada conta ativa usou o Publike no mês
      'dias_por_conta', (select round(avg(x.n), 1) from (
                           select u.conta_id, count(*) as n from uso u where u.dia > hoje - 30 group by u.conta_id) x)
    ),
    'semanas', (select coalesce(jsonb_agg(jsonb_build_object(
        'inicio', s.inicio,
        'fim', s.fim,
        'contas', (select count(*) from contas c where c.criada between s.inicio and s.fim),
        'matches', (select count(*) from public.curtidas cu
                     where cu.status = 'match'
                       and (coalesce(cu.respondida_em, cu.criado_em) at time zone 'America/Sao_Paulo')::date
                           between s.inicio and s.fim),
        'ativos', (select count(distinct u.conta_id) from uso u where u.dia between s.inicio and s.fim),
        'curtidas', (select count(*) from public.curtidas cu
                      where (cu.criado_em at time zone 'America/Sao_Paulo')::date between s.inicio and s.fim),
        'vagas', (select count(*) from public.anuncios an
                   where an.tipo = 'vaga' and (an.criado_em at time zone 'America/Sao_Paulo')::date
                         between s.inicio and s.fim)
      ) order by s.k desc), '[]'::jsonb) from semanas s),
    'ativacao', (select jsonb_build_object(
        'contas', count(*),
        'com_perfil', count(*) filter (where a.tipo is not null),
        'ativadas', count(*) filter (where a.primeira <= a.criada_em + interval '7 days'),
        'pessoas', count(*) filter (where a.tipo = 'pessoa'),
        'pessoas_ativadas', count(*) filter (where a.tipo = 'pessoa' and a.primeira <= a.criada_em + interval '7 days'),
        'empresas', count(*) filter (where a.tipo in ('empresa', 'comercio', 'agencia')),
        'empresas_ativadas', count(*) filter (where a.tipo in ('empresa', 'comercio', 'agencia')
                                                and a.primeira <= a.criada_em + interval '7 days'),
        'mediana_horas', round((percentile_cont(0.5) within group (
                           order by greatest(0, extract(epoch from a.primeira - a.criada_em) / 3600))
                           filter (where a.primeira <= a.criada_em + interval '7 days'))::numeric, 1)
      ) from coorte_ativacao a),
    -- por semana de cadastro: o tamanho e quantos usaram na 1ª, 2ª, 3ª e 4ª semana depois
    -- (null: a semana ainda não terminou para todos dessa turma)
    'retencao', (select coalesce(jsonb_agg(jsonb_build_object(
        'inicio', s.inicio,
        'fim', s.fim,
        'tamanho', (select count(*) from contas c where c.criada between s.inicio and s.fim),
        'semanas', (select jsonb_agg(
            case when s.fim + 7 * w + 6 <= hoje - 1 then (
              select count(*) from contas c
               where c.criada between s.inicio and s.fim
                 and exists (select 1 from uso u where u.conta_id = c.id
                              and u.dia between c.criada + 7 * w and c.criada + 7 * w + 6))
            end order by w) from generate_series(1, 4) w)
      ) order by s.k desc), '[]'::jsonb) from semanas s),
    -- voltou em até 1, 7 e 30 dias (as contas dos últimos 90 dias que já tiveram esse tempo)
    'voltaram', (select jsonb_object_agg(n::text, jsonb_build_object(
        'base', (select count(*) from contas c where c.criada between hoje - 90 and hoje - n - 1),
        'voltaram', (select count(*) from contas c
                      where c.criada between hoje - 90 and hoje - n - 1
                        and exists (select 1 from uso u where u.conta_id = c.id
                                     and u.dia between c.criada + 1 and c.criada + n))
      )) from unnest(array[1, 7, 30]) n),
    'churn', jsonb_build_object(
      'base', (select count(distinct u.conta_id) from uso u where u.dia between hoje - 59 and hoje - 30),
      'sairam', (select count(*) from (select distinct u.conta_id from uso u where u.dia between hoje - 59 and hoje - 30) a
                  where not exists (select 1 from uso u2 where u2.conta_id = a.conta_id and u2.dia > hoje - 30))
    ),
    'funil', (select jsonb_build_object(
        'contas', count(*),
        'com_perfil', count(*) filter (where n.tipo is not null),
        'pessoas', count(*) filter (where n.tipo = 'pessoa'),
        'curriculo', count(*) filter (where n.tipo = 'pessoa' and n.curriculo),
        'curtiu', count(*) filter (where n.tipo = 'pessoa' and n.curtiu),
        'match', count(*) filter (where n.tipo = 'pessoa' and n.match_pessoa),
        'empresas', count(*) filter (where n.tipo in ('empresa', 'comercio', 'agencia')),
        'vaga', count(*) filter (where n.tipo in ('empresa', 'comercio', 'agencia') and n.vaga),
        'candidato', count(*) filter (where n.tipo in ('empresa', 'comercio', 'agencia') and n.candidato),
        'aceitou', count(*) filter (where n.tipo in ('empresa', 'comercio', 'agencia') and n.aceitou),
        -- visitas de quem não entrou na conta (uma por pessoa por dia), nos 30 dias
        'visitas', (select count(*) from privado.acessos_site s where s.dia > hoje - 30 and not s.com_conta)
      ) from novas n),
    'liquidez', jsonb_build_object(
      'vagas', (select count(*) from vagas_coorte),
      'com_candidato_7d', (select count(*) from vagas_coorte x where x.primeira <= x.criado_em + interval '7 days'),
      'mediana_horas_primeiro', (select round((percentile_cont(0.5) within group (
                                    order by extract(epoch from x.primeira - x.criado_em) / 3600))::numeric, 1)
                                   from vagas_coorte x where x.primeira is not null),
      'candidatos_media', (select round(avg(x.candidatos), 1) from vagas_coorte x),
      'curtidas', (select count(*) from curtidas_coorte),
      'respondidas_7d', (select count(*) from curtidas_coorte y where y.respondida_em <= y.criado_em + interval '7 days'),
      'mediana_horas_resposta', (select round((percentile_cont(0.5) within group (
                                    order by extract(epoch from y.respondida_em - y.criado_em) / 3600))::numeric, 1)
                                   from curtidas_coorte y where y.respondida_em is not null),
      'matches', (select count(*) from curtidas_coorte y where y.status = 'match'),
      'preenchidas_publike', (select count(*) from privado.encerramentos e
                               where e.tipo = 'vaga' and e.motivo = 'contratei_publike' and e.criado_em > now() - interval '30 days'),
      'encerradas_com_motivo', (select count(*) from privado.encerramentos e
                                 where e.tipo = 'vaga' and e.criado_em > now() - interval '30 days'),
      'vagas_no_ar', (select count(*) from public.anuncios an
                       where an.tipo = 'vaga' and an.status = 'ativo' and an.expira_em > now())
    ),
    'engajamento', jsonb_build_object(
      'acoes_7d', (select (select count(*) from public.curtidas cu where cu.criado_em > now() - interval '7 days')
                        + (select count(*) from public.mensagens m where m.criado_em > now() - interval '7 days' and not m.automatica)
                        + (select count(*) from public.anuncios an where an.criado_em > now() - interval '7 days')
                        + (select count(*) from public.conexoes x where x.criado_em > now() - interval '7 days')),
      'mensagens_7d', (select count(*) from public.mensagens m where m.criado_em > now() - interval '7 days' and not m.automatica)
    )
  ) into v;
  return v;
end
$$;

-- os aceitos em vaga no ar nos últimos 60 dias, sem mensagem nem contato da empresa (a regra do Retorno), fora de
-- Contratados e de Não seguiu. perguntavel: ainda não recebeu as perguntas e a vaga pergunta.
drop function if exists privado.matches_sem_contato();
create or replace function privado.matches_sem_contato()
returns table (conta uuid, anuncio_id uuid, perfil_id uuid, nome text, vaga text, aceito_em timestamptz,
               perguntavel boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.autor_id, r.anuncio_id, r.perfil_id, p.nome, a.titulo, r.respondida_em,
         privado.perguntas_no_match_valem(r.anuncio_id, r.perfil_id)
           and not exists (select 1 from privado.perguntas_do_match q
                            where q.anuncio_id = r.anuncio_id and q.perfil_id = r.perfil_id)
    from privado.retorno_das_candidaturas(now() - interval '1 year', null) r
    join public.anuncios a on a.id = r.anuncio_id
    join public.perfis dono on dono.id = a.autor_id
    join public.perfis p on p.id = r.perfil_id
   where r.status = 'match' and not r.com_contato
     and coalesce(r.etapa, '') not in ('contratado', 'nao_seguiu')
     and r.respondida_em > now() - interval '60 days'
     and a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null
     and not coalesce(dono.suspenso_ate > now(), false)
     and not privado.ha_bloqueio(a.autor_id, r.perfil_id)
$$;
revoke execute on function privado.matches_sem_contato() from public, anon, authenticated;

-- a prévia: quantos, de quantas empresas, quantos vão receber as perguntas e quantas empresas dá para avisar agora
create or replace function public.admin_matches_sem_contato()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform privado.exigir_admin();
  with m as (select * from privado.matches_sem_contato()),
  c as (
    select m.conta, count(*) as quantos, count(*) filter (where m.perguntavel) as perguntaveis,
           (select max(n.criado_em) from public.notificacoes n
             where n.destinatario_id = m.conta and n.tipo = 'matches_sem_contato') as avisada_em
      from m group by m.conta)
  select jsonb_build_object(
    'contas', (select count(*) from c),
    'matches', (select count(*) from m),
    'perguntas', (select count(*) from m where m.perguntavel),
    'prontas', (select count(*) from c where c.avisada_em is null or c.avisada_em < now() - interval '7 days'),
    'exemplos', coalesce((
      select jsonb_agg(jsonb_build_object('nome', p.nome, 'quantos', x.quantos, 'perguntaveis', x.perguntaveis,
                                          'avisada_em', x.avisada_em) order by x.quantos desc, p.nome)
        from (select * from c order by c.quantos desc limit 8) x
        join public.perfis p on p.id = x.conta), '[]'::jsonb))
    into v;
  return v;
end
$$;
revoke execute on function public.admin_matches_sem_contato() from public, anon;
grant execute on function public.admin_matches_sem_contato() to authenticated, service_role;

-- manda: as perguntas no chat de quem ainda não recebeu ("Ainda tem interesse em …?"; o robô monta e manda) e um
-- aviso por empresa (no máximo um a cada 7 dias). Devolve {perguntas, avisadas}.
create or replace function public.admin_avisar_matches_sem_contato()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perguntas integer := 0;
  v_avisadas integer := 0;
  c record;
begin
  perform privado.exigir_admin();
  insert into privado.perguntas_do_match (anuncio_id, perfil_id, origem)
  select m.anuncio_id, m.perfil_id, 'retomada' from privado.matches_sem_contato() m where m.perguntavel
  on conflict (anuncio_id, perfil_id) do nothing;
  get diagnostics v_perguntas = row_count;
  for c in
    select m.conta, count(*)::integer as quantos,
           count(*) filter (where exists (select 1 from privado.perguntas_do_match q
                                           where q.anuncio_id = m.anuncio_id and q.perfil_id = m.perfil_id
                                             and q.origem = 'retomada' and q.criado_em = now()))::integer
             as perguntadas,
           (array_agg(coalesce(nullif(split_part(m.nome, ' ', 1), ''), 'Alguém') || ' (' || m.vaga || ')'
                      order by m.aceito_em desc))[1:5] as pessoas,
           (select max(n.criado_em) from public.notificacoes n
             where n.destinatario_id = m.conta and n.tipo = 'matches_sem_contato') as avisada_em
      from privado.matches_sem_contato() m
     group by m.conta
  loop
    continue when c.avisada_em is not null and c.avisada_em > now() - interval '7 days';
    insert into public.notificacoes (destinatario_id, tipo, texto)
    values (c.conta, 'matches_sem_contato',
            left(case when c.quantos = 1 then '1 pessoa deu match com você e espera o seu contato: '
                      else c.quantos || ' pessoas deram match com você e esperam o seu contato: ' end
                 || array_to_string(c.pessoas, ', ') || case when c.quantos > 5 then ' e outras.' else '.' end
                 || case when c.perguntadas > 0
                         then ' Perguntamos no chat o que a vaga precisa; as respostas chegam para você.'
                         else '' end, 300));
    v_avisadas := v_avisadas + 1;
  end loop;
  return jsonb_build_object('perguntas', v_perguntas, 'avisadas', v_avisadas);
end
$$;
revoke execute on function public.admin_avisar_matches_sem_contato() from public, anon;
grant execute on function public.admin_avisar_matches_sem_contato() to authenticated, service_role;

notify pgrst, 'reload schema';
