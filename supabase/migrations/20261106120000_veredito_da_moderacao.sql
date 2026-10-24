-- Veredito da moderação: quem teve um item retido fica sabendo que entrou em análise e o que foi decidido.
--   * Anúncio: o aviso de liberado (sino e e-mail) sai mesmo quando ele volta pausado, encerrado ou
--     vencido, como estava antes da análise, com o caminho para pôr no ar (antes só saía se voltasse ao ar).
--   * Avaliação e resposta: quem escreveu recebe no sino se foi liberada ou removida (tipos novos
--     avaliacao_liberada e avaliacao_removida, só no sino).
--   * Recado: tirado do ar por denúncias avisa quem escreveu; liberado depois de retido diz que foi a moderação.


-- 1. Anúncio

create or replace function public.notificar_moderacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pela_ia boolean := coalesce(current_setting('publike.origem', true), '') = 'ia';
begin
  if new.status is distinct from old.status then
    if new.status = 'em_analise' then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
      values (new.autor_id, 'em_analise', new.id,
              case when pela_ia
                   then 'Seu anúncio “' || new.titulo || '” saiu do ar por enquanto: a moderação vai dar uma olhada. Você recebe um aviso quando terminar.'
                   else 'Seu anúncio “' || new.titulo || '” recebeu denúncias e saiu do ar até a moderação analisar.'
              end);
      perform privado.avisar_equipe('aviso_retirado', jsonb_build_object(
        'titulo', new.titulo,
        'origem', case when pela_ia
                       then 'a moderação automática (IA) achou o anúncio suspeito.'
                       else 'o anúncio recebeu denúncias de três pessoas diferentes.'
                  end,
        'caminho', '/admin/denuncias'));
    elsif new.status = 'removido' then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
      values (new.autor_id, 'removido', new.id,
              'Seu anúncio “' || new.titulo || '” foi removido por não seguir as regras do Publike.'
              || coalesce(' Motivo: ' || new.nota_moderacao, ''));
    elsif old.status in ('em_analise', 'removido') then
      -- o veredito sai sempre, mesmo quando o anúncio volta pausado, encerrado ou vencido (como estava antes)
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
      values (new.autor_id, 'liberado', new.id,
              'Seu anúncio “' || new.titulo || '” foi liberado pela moderação'
              || case new.status
                   when 'ativo' then ' e voltou ao ar.'
                   when 'pausado' then '. Ele continua pausado, como você deixou: para pôr no ar, toque em Reativar em Meus anúncios.'
                   when 'encerrado' then '. Ele continua encerrado, como você deixou: para pôr no ar de novo, toque em Renovar em Meus anúncios.'
                   when 'expirado' then '. O prazo dele tinha acabado: para pôr no ar de novo, toque em Renovar em Meus anúncios.'
                   else '.'
                 end);
    end if;
  end if;
  return null;
end
$$;

-- 2. O e-mail do aviso

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
  v_entrevista jsonb;
  v_status text;
begin
  select a.titulo, a.nota_moderacao, a.autor_id, a.status into v_titulo, v_nota, v_autor, v_status
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
                  'liberado') then
    v_motivo := new.texto;
  end if;
  -- entrevista: os dados para o convite de agenda (.ics) que vai anexo no e-mail
  if new.tipo in ('entrevista', 'entrevista_resposta') then
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
                 when 'curtida' then '/painel/anuncio/' || new.anuncio_id
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
$$;

-- O e-mail "Anúncio liberado" usa o texto do sino (que diz se voltou ao ar ou como pôr de volta).
-- Só troca o texto que ninguém mudou no admin; o padrão (Restaurar) troca sempre.
update public.modelos_email
   set assunto = case when assunto = assunto_padrao then 'Seu anúncio “{{titulo}}” foi liberado' else assunto end,
       corpo = case when corpo = corpo_padrao then 'Oi, {{nome}}!

{{motivo}}

Obrigado pela paciência.' else corpo end,
       assunto_padrao = 'Seu anúncio “{{titulo}}” foi liberado',
       corpo_padrao = 'Oi, {{nome}}!

{{motivo}}

Obrigado pela paciência.',
       variaveis = array['nome', 'titulo', 'motivo', 'link']
 where chave = 'liberado';

-- 3. Tipos novos no sino

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'recado_no_ar', 'recado_retido', 'recado_forca',
                  'convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine',
                  'curriculo_publico', 'visita', 'visitas_do_dia', 'visitas_novidade',
                  'avaliacao_liberada', 'avaliacao_removida'));

drop trigger if exists notificacoes_por_email on public.notificacoes;
create trigger notificacoes_por_email
  after insert on public.notificacoes
  for each row
  when (new.tipo not in ('recado_no_ar', 'recado_retido', 'recado_forca', 'convite_curriculo', 'convite_empresa',
                         'convite_agencia', 'convite_servicos', 'convite_vitrine', 'curriculo_publico',
                         'visita', 'visitas_do_dia', 'visitas_novidade', 'avaliacao_liberada',
                         'avaliacao_removida'))
  execute function privado.notificacao_por_email();

-- 4. Avaliações

create or replace function public.moderar_avaliacao(p_avaliacao bigint, p_parte text, p_decisao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.avaliacoes;
  escritor uuid;
  estava text;
  qual text;
begin
  perform privado.exigir_equipe();
  if p_parte not in ('comentario', 'resposta') or p_decisao not in ('publicar', 'remover') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  select * into v from public.avaliacoes where id = p_avaliacao for update;
  if not found then
    raise exception 'Avaliação não encontrada.' using errcode = 'P0002';
  end if;
  escritor := case when p_parte = 'comentario' then v.autor_id else v.profissional_id end;
  estava := case when p_parte = 'comentario' then v.status else v.resposta_status end;
  qual := case when p_parte = 'comentario' then 'Sua avaliação' else 'Sua resposta à avaliação' end;
  delete from privado.fila_ia_avaliacoes where avaliacao_id = p_avaliacao and parte = p_parte;

  if p_parte = 'comentario' then
    update public.avaliacoes
       set status = case when p_decisao = 'publicar' then 'publicada' else 'removida' end,
           denunciada_em = null, motivo_denuncia = null, atualizado_em = now()
     where id = p_avaliacao;
    if p_decisao = 'publicar' then
      perform privado.avisar_avaliacao_publicada(p_avaliacao);
    end if;
  else
    update public.avaliacoes
       set resposta_status = case when p_decisao = 'publicar' then 'publicada' else 'removida' end,
           atualizado_em = now()
     where id = p_avaliacao;
  end if;

  if p_decisao = 'publicar' then
    delete from public.advertencias a where a.avaliacao_id = p_avaliacao and a.perfil_id = escritor and a.origem = 'ia';
  elsif not exists (select 1 from public.advertencias a where a.avaliacao_id = p_avaliacao and a.perfil_id = escritor) then
    -- removida por denúncia (a IA tinha deixado passar): a advertência vem da equipe
    insert into public.advertencias (perfil_id, origem, motivo, avaliacao_id)
    values (escritor, 'equipe', 'Texto de avaliação removido pela moderação.', p_avaliacao);
  end if;

  -- o veredito para quem escreveu: liberada (se estava retida) ou removida
  if p_decisao = 'publicar' and estava = 'retida' then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
    values (escritor, 'avaliacao_liberada', v.anuncio_id,
            qual || ' em “' || v.titulo_servico || '” foi liberada pela moderação e já está publicada.');
  elsif p_decisao = 'remover' and estava is distinct from 'removida' then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
    values (escritor, 'avaliacao_removida', v.anuncio_id,
            qual || ' em “' || v.titulo_servico || '” foi removida pela moderação: ela não segue as regras do Publike.');
  end if;

  perform privado.registrar(case when p_decisao = 'publicar' then 'publicar_avaliacao' else 'remover_avaliacao' end,
                            'avaliacao', p_avaliacao::text, v.titulo_servico,
                            jsonb_build_object('parte', p_parte, 'escritor', escritor));
end
$$;

-- 5. Recados

create or replace function public.denunciar_recado(p_recado uuid, p_motivo text, p_detalhes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  r public.recados;
begin
  if conta is null then
    raise exception 'Entre na sua conta para denunciar.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select * into r from public.recados x where x.id = p_recado;
  if not found or r.status in ('apagado') then
    raise exception 'Recado não encontrado.' using errcode = 'P0002';
  end if;
  if r.autor_id = conta then
    raise exception 'Esse recado é seu. Para tirar, use Apagar.' using errcode = 'P0001';
  end if;
  if p_motivo is null or p_motivo not in ('cobra_taxa', 'golpe', 'enganoso', 'discriminacao', 'ofensivo', 'spam', 'outro') then
    raise exception 'Escolha o motivo.' using errcode = '22023';
  end if;
  if exists (select 1 from public.denuncias_recados d where d.recado_id = p_recado and d.autor_id = conta) then
    raise exception 'Você já denunciou esse recado. A moderação vai analisar.' using errcode = 'P0001', hint = 'repetida';
  end if;
  perform privado.conferir_limite('denuncia', 10, 'Você já enviou muitas denúncias hoje. A moderação vai analisar as que chegaram.');
  insert into public.denuncias_recados (recado_id, autor_id, motivo, detalhes)
  values (p_recado, conta, p_motivo, nullif(left(btrim(coalesce(p_detalhes, '')), 1000), ''));

  if r.status = 'no_ar' and (select count(distinct d.autor_id) from public.denuncias_recados d
        join public.perfis p on p.id = d.autor_id
       where d.recado_id = p_recado and d.status = 'aberta'
         and p.criado_em <= now() - interval '3 days') >= 3 then
    update public.recados x set status = 'retido', motivo = 'Recebeu denúncias. A moderação vai analisar.'
     where x.id = p_recado and x.status = 'no_ar';
    if found then
      perform privado.avisar_recado(p_recado, 'recado_retido',
        'Seu recado saiu do ar por enquanto: recebeu denúncias e a moderação vai analisar. Você recebe um aviso quando terminar.');
    end if;
  end if;
end
$$;

create or replace function public.moderar_recado(p_recado uuid, p_decisao text, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.recados;
  v_nota text := nullif(left(btrim(coalesce(p_nota, '')), 500), '');
begin
  perform privado.exigir_equipe();
  if p_decisao not in ('liberar', 'remover') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  if p_decisao = 'remover' and v_nota is null then
    raise exception 'Escreva o motivo para quem escreveu o recado.' using errcode = '22023';
  end if;
  select * into r from public.recados x where x.id = p_recado for update;
  if not found or r.status = 'apagado' then
    raise exception 'Recado não encontrado.' using errcode = 'P0002';
  end if;
  delete from privado.fila_ia_recados where recado_id = p_recado;
  if p_decisao = 'liberar' then
    update public.recados
       set status = 'no_ar', publicado_em = coalesce(publicado_em, now()), motivo = null
     where id = p_recado;
    update public.denuncias_recados set status = 'improcedente' where recado_id = p_recado and status = 'aberta';
    if r.status = 'retido' then
      perform privado.avisar_recado(p_recado, 'recado_no_ar', 'Seu recado foi liberado pela moderação e está no ar.');
    elsif r.status <> 'no_ar' then
      perform privado.avisar_recado(p_recado, 'recado_no_ar', 'Seu recado está no ar.');
    end if;
  else
    update public.recados set status = 'apagado', apagado_em = now(), motivo = v_nota where id = p_recado;
    update public.denuncias_recados set status = 'procedente' where recado_id = p_recado and status = 'aberta';
    delete from public.notificacoes n where n.recado_id = p_recado;
    insert into public.notificacoes (destinatario_id, tipo, texto)
    values (r.autor_id, 'recado_retido', 'Seu recado foi tirado do ar pela moderação: ' || v_nota);
  end if;
  perform privado.registrar(case when p_decisao = 'liberar' then 'liberar_recado' else 'remover_recado' end,
                            'recado', p_recado::text, left(r.texto, 80),
                            jsonb_build_object('autor', r.autor_id, 'nota', v_nota));
end
$$;

notify pgrst, 'reload schema';
