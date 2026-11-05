-- O aviso de que a conta liberou uma funcionalidade (05/11/2026; claude/plano-avisos-de-liberacao-e-menu-admin.md):
-- a página de carreiras pela meta (mais de 10 vagas publicadas) e o que a equipe libera no Admin (a página de
-- carreiras, a Triagem com IA, o Teste Prático, a Entrevista em vídeo e as Automações). No sino, no celular e por
-- e-mail (Admin › E-mails: "Funcionalidade liberada"), uma vez por conta e funcionalidade (de novo só depois de 90
-- dias). As contas que já tinham passado da meta ficam como avisadas (não recebem atrasado). Pode rodar de novo.

-- 1. O aviso novo -------------------------------------------------------------------------------------------------
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida', 'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao', 'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca', 'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao', 'recado_no_ar', 'recado_retido', 'recado_forca', 'convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine', 'curriculo_publico', 'visita', 'visitas_do_dia', 'visitas_novidade', 'avaliacao_liberada', 'avaliacao_removida', 'mensagem_equipe', 'vagas_semana', 'talentos_semana', 'comunicado', 'noticias_do_dia', 'teste_pedido', 'teste_feito', 'lembrete_curtida', 'sem_resposta', 'pagamento', 'dispensada', 'entrevista_lembrete', 'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida', 'talentos_reativar', 'match_empresa', 'matches_sem_contato', 'respostas_match', 'liberacao'));

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
                  'match_empresa', 'matches_sem_contato', 'respostas_match', 'liberacao') then
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
                 -- a funcionalidade liberada: a página dela (o link vem do banco, só caminho do site)
                 when 'liberacao' then coalesce(new.link, '/painel')
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

drop trigger if exists notificacoes_para_celular on public.notificacoes;
create trigger notificacoes_para_celular
  after insert on public.notificacoes
  for each row
  when (new.tipo in ('curtida', 'match', 'mensagem', 'conexao', 'em_analise', 'removido', 'liberado', 'etapa', 'entrevista', 'entrevista_resposta', 'contratacao', 'aceite_curriculo', 'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas', 'vaga_preenchida', 'seguindo', 'busca', 'avaliacao', 'recado_retido', 'mensagem_equipe', 'equipe', 'vagas_semana', 'talentos_semana', 'noticias_do_dia', 'teste_pedido', 'teste_feito', 'lembrete_curtida', 'sem_resposta', 'pagamento', 'dispensada', 'entrevista_lembrete', 'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida', 'talentos_reativar', 'match_empresa', 'matches_sem_contato', 'respostas_match', 'liberacao'))
  execute function privado.notificacao_para_celular();

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('liberacao', 'usuarios', 5, 'Funcionalidade liberada',
     'Para quem contrata: a conta liberou uma funcionalidade, pela meta (a página de carreiras, com mais de 10 vagas publicadas) ou pela equipe (o Liberar em Admin › Usuários). Uma vez por conta e funcionalidade.',
     array['nome', 'motivo', 'link'],
     'Liberado para você no Publike',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver agora')
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

insert into privado.regras_email (modelo, intervalo_min) values ('liberacao', null)
on conflict (modelo) do nothing;

-- 2. O que já foi avisado -------------------------------------------------------------------------------------------
create table if not exists privado.liberacoes_avisadas (
  conta_id uuid not null references public.perfis (id) on delete cascade,
  funcionalidade text not null check (funcionalidade in ('pagina_de_vagas', 'copiloto', 'testes', 'video', 'automacoes')),
  avisado_em timestamptz not null default now(),
  primary key (conta_id, funcionalidade)
);
alter table privado.liberacoes_avisadas enable row level security;
revoke all on privado.liberacoes_avisadas from public, anon, authenticated;

-- as que já passaram da meta antes desta migração: avisadas (sem aviso atrasado)
insert into privado.liberacoes_avisadas (conta_id, funcionalidade)
select p.id, 'pagina_de_vagas' from public.perfis p
 where p.tipo <> 'pessoa' and privado.vagas_publicadas(p.id) > 10
on conflict do nothing;

-- 3. Avisar -------------------------------------------------------------------------------------------------------
-- true: avisou; false: já tinha avisado nos últimos 90 dias (ou a conta não existe)
create or replace function privado.avisar_liberacao(p_conta uuid, p_funcionalidade text, p_cortesia boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_texto text;
  v_link text;
begin
  if exists (select 1 from privado.liberacoes_avisadas l
              where l.conta_id = p_conta and l.funcionalidade = p_funcionalidade
                and l.avisado_em > now() - interval '90 days') then
    return false;
  end if;
  if not exists (select 1 from public.perfis p where p.id = p_conta) then
    return false;
  end if;
  select t.texto, t.link into v_texto, v_link from (values
    ('pagina_de_vagas', 'Sua página de carreiras está liberada: todas as suas vagas num endereço só, com a sua cor, a sua capa e um link curto para divulgar. Monte a sua.', '/painel/links/pagina'),
    ('copiloto', 'A Triagem com IA está liberada: ela lê os currículos de cada vaga pelos critérios que você escolher e mostra quem combina mais.', '/painel/copiloto'),
    ('testes', 'O Teste Prático está liberado: mande um teste rápido para os candidatos e veja o resultado de cada um.', '/painel/testes'),
    ('video', 'A Entrevista em vídeo está liberada: os candidatos respondem às suas perguntas gravando, na hora que puderem.', '/painel/video'),
    ('automacoes', 'As Automações personalizadas estão liberadas: monte regras que movem os candidatos e mandam mensagens sozinhas.', '/painel/automacoes')
  ) as t(funcionalidade, texto, link)
   where t.funcionalidade = p_funcionalidade;
  if v_texto is null then
    raise exception 'Funcionalidade inválida.' using errcode = '22023';
  end if;
  if p_cortesia then
    v_texto := 'O Publike liberou para você, sem custo. ' || v_texto;
  end if;
  insert into public.notificacoes (destinatario_id, tipo, texto, link) values (p_conta, 'liberacao', v_texto, v_link);
  insert into privado.liberacoes_avisadas (conta_id, funcionalidade) values (p_conta, p_funcionalidade)
  on conflict (conta_id, funcionalidade) do update set avisado_em = now();
  return true;
end
$$;

-- o Liberar do Admin (pela chave secreta, como os admin_liberar_*)
create or replace function public.admin_avisar_liberacao(p_conta uuid, p_funcionalidade text)
returns boolean
language sql
security definer
set search_path = ''
as $$ select privado.avisar_liberacao(p_conta, p_funcionalidade, true) $$;
revoke execute on function public.admin_avisar_liberacao(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_avisar_liberacao(uuid, text) to service_role;

-- o robô das filas: as contas que passaram da meta da página de carreiras e ainda não foram avisadas
create or replace function public.servidor_avisar_liberacoes(p_chave text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid;
  v_avisadas integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  for v_conta in
    select p.id from public.perfis p
     where p.tipo <> 'pessoa'
       and not exists (select 1 from privado.liberacoes_avisadas l
                        where l.conta_id = p.id and l.funcionalidade = 'pagina_de_vagas')
       and privado.vagas_publicadas(p.id) > 10
     limit 50
  loop
    if privado.avisar_liberacao(v_conta, 'pagina_de_vagas', false) then
      v_avisadas := v_avisadas + 1;
    end if;
  end loop;
  return v_avisadas;
end
$$;
revoke execute on function public.servidor_avisar_liberacoes(text) from public;
grant execute on function public.servidor_avisar_liberacoes(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
