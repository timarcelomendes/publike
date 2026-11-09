-- Conquistas: o "comecei a trabalhar" que nasce do match (09/11/2026; claude/plano-posts-e-conquistas.md, parte 2).
-- Pode rodar de novo. Rode depois de 20270321120000_recado_vira_post.sql.
--
-- 5 dias depois do match numa vaga, o Publike pergunta à pessoa se deu certo ("Comecei!", "Ainda não", "Não deu
-- certo"); "Ainda não" ou sem resposta, pergunta de novo em 7 dias (no máximo 3 vezes). Com o "Comecei!", a
-- empresa recebe "Ana disse que começou aí. Confirma?" e a pessoa escolhe se mostra no Publike. Mostrada, a
-- conquista aparece no feed de quem está perto (primeiro nome e inicial, a vaga, a empresa e o bairro), com "Dar
-- os parabéns". Com a confirmação da empresa, ganha o selo "Confirmado pela empresa"; com "Não é verdade", sai.
-- A etapa "Contratado" só muda com a confirmação da empresa (é o quadro dela, com as automações dela).

-- 1. As tabelas -----------------------------------------------------------------------------------------------------

create table if not exists public.conquistas (
  anuncio_id uuid not null,
  perfil_id uuid not null,
  perguntas smallint not null default 0,
  proxima_pergunta_em timestamptz not null default now(),
  resposta text check (resposta in ('comecei', 'ainda_nao', 'nao_deu')),
  respondida_em timestamptz,
  -- a pessoa escolheu mostrar (true), só para ela (false) ou ainda não escolheu (null)
  mostrar boolean,
  mostrada_em timestamptz,
  empresa text check (empresa in ('confirmou', 'negou')),
  empresa_em timestamptz,
  parabens integer not null default 0 check (parabens >= 0),
  criado_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id),
  foreign key (anuncio_id, perfil_id) references public.curtidas (anuncio_id, perfil_id) on delete cascade
);
create index if not exists conquistas_mostradas_idx on public.conquistas (mostrada_em desc) where mostrada_em is not null;
create index if not exists conquistas_perguntar_idx on public.conquistas (proxima_pergunta_em)
  where resposta is null or resposta = 'ainda_nao';
create index if not exists conquistas_pessoa_idx on public.conquistas (perfil_id);
alter table public.conquistas enable row level security;
revoke all on public.conquistas from anon, authenticated;

create table if not exists public.conquista_parabens (
  anuncio_id uuid not null,
  perfil_id uuid not null,
  quem_id uuid not null references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id, quem_id),
  foreign key (anuncio_id, perfil_id) references public.conquistas (anuncio_id, perfil_id) on delete cascade
);
alter table public.conquista_parabens enable row level security;
revoke all on public.conquista_parabens from anon, authenticated;

-- o nome curto de quem conseguiu: "Ana S."
create or replace function privado.nome_da_conquista(p_nome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select split_part(btrim(p_nome), ' ', 1)
         || case when position(' ' in btrim(p_nome)) > 0
                 then ' ' || left(split_part(btrim(p_nome), ' ',
                                             array_length(regexp_split_to_array(btrim(p_nome), '\s+'), 1)), 1) || '.'
                 else '' end
$$;

-- 2. Os avisos (os tipos novos no sino, no celular e no e-mail) --------------------------------------------------
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check CHECK ((tipo = ANY (ARRAY['curtida'::text, 'match'::text, 'em_analise'::text, 'removido'::text, 'liberado'::text, 'avaliacao'::text, 'avaliacao_retida'::text, 'match_desfeito'::text, 'etapa'::text, 'mensagem'::text, 'seguindo'::text, 'recomendacao'::text, 'contratacao'::text, 'entrevista'::text, 'entrevista_resposta'::text, 'aceite_curriculo'::text, 'curriculo_recebido'::text, 'busca'::text, 'convite'::text, 'vaga_preenchida'::text, 'finalistas'::text, 'convite_candidato'::text, 'equipe'::text, 'conexao'::text, 'recado_no_ar'::text, 'recado_retido'::text, 'recado_forca'::text, 'convite_curriculo'::text, 'convite_empresa'::text, 'convite_agencia'::text, 'convite_servicos'::text, 'convite_vitrine'::text, 'curriculo_publico'::text, 'visita'::text, 'visitas_do_dia'::text, 'visitas_novidade'::text, 'avaliacao_liberada'::text, 'avaliacao_removida'::text, 'mensagem_equipe'::text, 'vagas_semana'::text, 'talentos_semana'::text, 'comunicado'::text, 'noticias_do_dia'::text, 'teste_pedido'::text, 'teste_feito'::text, 'lembrete_curtida'::text, 'sem_resposta'::text, 'pagamento'::text, 'dispensada'::text, 'entrevista_lembrete'::text, 'video_pedido'::text, 'video_enviado'::text, 'parados'::text, 'proposta'::text, 'proposta_resposta'::text, 'candidatura_recebida'::text, 'talentos_reativar'::text, 'match_empresa'::text, 'matches_sem_contato'::text, 'respostas_match'::text, 'liberacao'::text, 'talento_combina'::text, 'pedido_cliente'::text, 'busca_talentos'::text, 'documentos_admissao'::text, 'indicacao'::text, 'comentario'::text, 'comentario_resposta'::text, 'conquista_pergunta'::text, 'conquista_confirmar'::text, 'conquista_parabens'::text])));

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
                    'match_empresa', 'matches_sem_contato', 'respostas_match', 'talento_combina', 'pedido_cliente', 'busca_talentos', 'documentos_admissao',
                    'comentario', 'comentario_resposta', 'conquista_pergunta', 'conquista_confirmar', 'conquista_parabens') then 'andamento'
    when p_tipo = 'conexao' then 'conexoes'
    when p_tipo in ('busca', 'seguindo', 'indicacao') then 'vagas_novas'
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
                  'match_empresa', 'matches_sem_contato', 'respostas_match', 'liberacao', 'talento_combina', 'pedido_cliente', 'busca_talentos', 'documentos_admissao',
                  'indicacao', 'comentario', 'comentario_resposta', 'conquista_pergunta', 'conquista_confirmar', 'conquista_parabens') then
    v_motivo := new.texto;
  end if;
  -- quem indicou (o nome curto, como no e-mail para quem não tem conta)
  if new.tipo = 'indicacao' and new.ator_id is not null then
    v_quem := coalesce(nullif(btrim(privado.nome_para_email(new.ator_id)), ''), v_quem);
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
                 -- o candidato que combina: a ficha dele em Talentos
                 when 'talento_combina' then coalesce(new.link, '/talentos')
                 -- o pedido de vaga do cliente da agência: a página dos pedidos
                 when 'documentos_admissao' then coalesce(new.link, '/painel/curtidas')
                 when 'busca_talentos' then coalesce(new.link, '/talentos')
                 when 'pedido_cliente' then coalesce(new.link, '/painel/pedidos')
                 -- a vaga indicada (com o código de quem indicou) e o comentário na vaga
                 when 'indicacao' then coalesce(new.link, '/anuncio/' || new.anuncio_id)
                 when 'comentario' then coalesce(new.link, '/anuncio/' || new.anuncio_id || '#comentarios')
                 when 'comentario_resposta' then coalesce(new.link, '/anuncio/' || new.anuncio_id || '#comentarios')
                 -- as conquistas (migração 20270322120000): a pergunta e os parabéns na home; a confirmação no painel da vaga
                 when 'conquista_pergunta' then coalesce(new.link, '/#conquista')
                 when 'conquista_parabens' then coalesce(new.link, '/?tipo=recado')
                 when 'conquista_confirmar' then coalesce(new.link, '/painel/anuncio/' || new.anuncio_id || '#conquistas')
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
CREATE TRIGGER notificacoes_para_celular AFTER INSERT ON public.notificacoes FOR EACH ROW WHEN ((new.tipo = ANY (ARRAY['curtida'::text, 'match'::text, 'mensagem'::text, 'conexao'::text, 'em_analise'::text, 'removido'::text, 'liberado'::text, 'etapa'::text, 'entrevista'::text, 'entrevista_resposta'::text, 'contratacao'::text, 'aceite_curriculo'::text, 'curriculo_recebido'::text, 'convite'::text, 'convite_candidato'::text, 'finalistas'::text, 'vaga_preenchida'::text, 'seguindo'::text, 'busca'::text, 'avaliacao'::text, 'recado_retido'::text, 'mensagem_equipe'::text, 'equipe'::text, 'vagas_semana'::text, 'talentos_semana'::text, 'noticias_do_dia'::text, 'teste_pedido'::text, 'teste_feito'::text, 'lembrete_curtida'::text, 'sem_resposta'::text, 'pagamento'::text, 'dispensada'::text, 'entrevista_lembrete'::text, 'video_pedido'::text, 'video_enviado'::text, 'parados'::text, 'proposta'::text, 'proposta_resposta'::text, 'candidatura_recebida'::text, 'talentos_reativar'::text, 'match_empresa'::text, 'matches_sem_contato'::text, 'respostas_match'::text, 'liberacao'::text, 'talento_combina'::text, 'pedido_cliente'::text, 'busca_talentos'::text, 'documentos_admissao'::text, 'indicacao'::text, 'comentario'::text, 'comentario_resposta'::text, 'conquista_pergunta'::text, 'conquista_confirmar'::text, 'conquista_parabens'::text]))) EXECUTE FUNCTION privado.notificacao_para_celular();

-- 3. A pergunta (a tarefa das filas, a cada 5 minutos) ----------------------------------------------------------------

-- a assinatura antiga (do primeiro rascunho desta migração), se existir
drop function if exists public.servidor_perguntar_conquistas(integer);
create or replace function public.servidor_perguntar_conquistas(p_chave text, p_limite integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  n integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  -- os matches de vaga de 5 a 60 dias atrás entram na lista (uma vez cada)
  insert into public.conquistas (anuncio_id, perfil_id, proxima_pergunta_em)
  select cu.anuncio_id, cu.perfil_id, now()
    from public.curtidas cu
    join public.anuncios a on a.id = cu.anuncio_id and a.tipo = 'vaga'
   where cu.status = 'match'
     and coalesce(cu.respondida_em, cu.criado_em) between now() - interval '60 days' and now() - interval '5 days'
     and cu.perfil_id <> a.autor_id
     and not exists (select 1 from public.conquistas x where x.anuncio_id = cu.anuncio_id and x.perfil_id = cu.perfil_id)
   limit 500
  on conflict do nothing;

  for c in
    select x.anuncio_id, x.perfil_id, a.titulo, a.autor_id, pa.nome as empresa
      from public.conquistas x
      join public.curtidas cu on cu.anuncio_id = x.anuncio_id and cu.perfil_id = x.perfil_id and cu.status = 'match'
      join public.anuncios a on a.id = x.anuncio_id
      join public.perfis pa on pa.id = a.autor_id
      join public.perfis pp on pp.id = x.perfil_id
     where (x.resposta is null or x.resposta = 'ainda_nao')
       and x.perguntas < 3
       and x.proxima_pergunta_em <= now()
       and (pp.suspenso_ate is null or pp.suspenso_ate <= now())
     order by x.proxima_pergunta_em
     limit least(greatest(coalesce(p_limite, 100), 1), 500)
  loop
    -- uma pergunta por vaga no sino: a nova tira a anterior
    delete from public.notificacoes nt
     where nt.destinatario_id = c.perfil_id and nt.anuncio_id = c.anuncio_id and nt.tipo = 'conquista_pergunta';
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (c.perfil_id, 'conquista_pergunta', c.anuncio_id, c.autor_id,
            'Deu certo com ' || coalesce(c.empresa, 'a empresa') || '? Você começou a trabalhar na vaga “'
            || c.titulo || '”? Conte para a gente.');
    update public.conquistas x
       set perguntas = x.perguntas + 1, proxima_pergunta_em = now() + interval '7 days'
     where x.anuncio_id = c.anuncio_id and x.perfil_id = c.perfil_id;
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function public.servidor_perguntar_conquistas(text, integer) from public;
grant execute on function public.servidor_perguntar_conquistas(text, integer) to anon, authenticated, service_role;

-- 4. Para a pessoa: as perguntas abertas e as respostas -----------------------------------------------------------

-- O que a pessoa tem para responder: "Deu certo?" (perguntado e sem resposta) ou "Mostrar no Publike?" (comecei e
-- ainda não escolheu).
create or replace function public.minhas_conquistas_pendentes()
returns table (anuncio_id uuid, titulo text, empresa_nome text, resposta text, categoria text)
language sql
stable
security definer
set search_path = ''
as $$
  select x.anuncio_id, a.titulo, pa.nome, x.resposta, a.categoria
    from public.conquistas x
    join public.anuncios a on a.id = x.anuncio_id
    join public.perfis pa on pa.id = a.autor_id
    join public.curtidas cu on cu.anuncio_id = x.anuncio_id and cu.perfil_id = x.perfil_id and cu.status = 'match'
   where x.perfil_id = (select public.conta_atual())
     and x.perguntas >= 1
     and ((x.resposta is null) or (x.resposta = 'comecei' and x.mostrar is null))
     and x.empresa is distinct from 'negou'
   order by x.proxima_pergunta_em desc
   limit 3
$$;
revoke execute on function public.minhas_conquistas_pendentes() from public, anon;
grant execute on function public.minhas_conquistas_pendentes() to authenticated;

create or replace function public.responder_conquista(p_anuncio uuid, p_resposta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  x public.conquistas;
  v_titulo text;
  v_autor uuid;
  v_nome text;
begin
  if conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_resposta is null or p_resposta not in ('comecei', 'ainda_nao', 'nao_deu') then
    raise exception 'Resposta inválida.' using errcode = '22023';
  end if;
  select * into x from public.conquistas c where c.anuncio_id = p_anuncio and c.perfil_id = conta for update;
  if not found then
    raise exception 'Não achamos essa vaga nas suas.' using errcode = 'P0002';
  end if;
  update public.conquistas c
     set resposta = p_resposta,
         respondida_em = now(),
         proxima_pergunta_em = case when p_resposta = 'ainda_nao' then now() + interval '7 days' else c.proxima_pergunta_em end
   where c.anuncio_id = p_anuncio and c.perfil_id = conta;
  -- a pergunta no sino já foi respondida
  update public.notificacoes nt set lida = true
   where nt.destinatario_id = conta and nt.anuncio_id = p_anuncio and nt.tipo = 'conquista_pergunta';
  -- "Comecei!": a empresa confirma (uma vez)
  if p_resposta = 'comecei' and x.resposta is distinct from 'comecei' and x.empresa is null then
    select a.titulo, a.autor_id into v_titulo, v_autor from public.anuncios a where a.id = p_anuncio;
    select p.nome into v_nome from public.perfis p where p.id = conta;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (v_autor, 'conquista_confirmar', p_anuncio, conta,
            coalesce(privado.nome_da_conquista(v_nome), 'Uma pessoa') || ' disse que começou a trabalhar com vocês, pela vaga “'
            || v_titulo || '”. Confirma?');
  end if;
end
$$;
revoke execute on function public.responder_conquista(uuid, text) from public, anon;
grant execute on function public.responder_conquista(uuid, text) to authenticated;

-- A contratação no perfil ("Contratado pelo Publike"): com o sim da pessoa e a confirmação da empresa.
create or replace function privado.sincronizar_contratacao(p_anuncio uuid, p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.conquistas;
begin
  select * into x from public.conquistas c where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil;
  if not found then
    return;
  end if;
  if x.mostrar is true and x.empresa = 'confirmou' then
    insert into public.contratacoes_publicas (anuncio_id, perfil_id, ok_empresa, ok_pessoa, publicado_em)
    values (p_anuncio, p_perfil, true, true, now())
    on conflict (anuncio_id, perfil_id) do update
      set ok_empresa = true, ok_pessoa = true,
          publicado_em = coalesce(public.contratacoes_publicas.publicado_em, now());
  elsif x.mostrar is false or x.empresa = 'negou' then
    update public.contratacoes_publicas c set ok_pessoa = case when x.mostrar is false then false else c.ok_pessoa end,
                                              ok_empresa = case when x.empresa = 'negou' then false else c.ok_empresa end,
                                              publicado_em = null
     where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil;
  end if;
end
$$;
revoke execute on function privado.sincronizar_contratacao(uuid, uuid) from public, anon, authenticated;

create or replace function public.mostrar_conquista(p_anuncio uuid, p_mostrar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
begin
  if conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  update public.conquistas c
     set mostrar = coalesce(p_mostrar, false),
         mostrada_em = case when p_mostrar then coalesce(c.mostrada_em, now()) else null end
   where c.anuncio_id = p_anuncio and c.perfil_id = conta and c.resposta = 'comecei';
  if not found then
    raise exception 'Primeiro conte se você começou a trabalhar.' using errcode = 'P0001';
  end if;
  perform privado.sincronizar_contratacao(p_anuncio, conta);
end
$$;
revoke execute on function public.mostrar_conquista(uuid, boolean) from public, anon;
grant execute on function public.mostrar_conquista(uuid, boolean) to authenticated;

-- 5. Para a empresa: confirmar -------------------------------------------------------------------------------------

create or replace function public.conquistas_para_confirmar(p_anuncio uuid default null)
returns table (anuncio_id uuid, perfil_id uuid, titulo text, nome text, foto text, respondida_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select x.anuncio_id, x.perfil_id, a.titulo, p.nome, p.foto, x.respondida_em
    from public.conquistas x
    join public.anuncios a on a.id = x.anuncio_id
    join public.perfis p on p.id = x.perfil_id
   where a.autor_id = (select public.conta_atual())
     and (p_anuncio is null or x.anuncio_id = p_anuncio)
     and x.resposta = 'comecei'
     and x.empresa is null
   order by x.respondida_em desc
   limit 50
$$;
revoke execute on function public.conquistas_para_confirmar(uuid) from public, anon;
grant execute on function public.conquistas_para_confirmar(uuid) to authenticated;

create or replace function public.confirmar_conquista(p_anuncio uuid, p_perfil uuid, p_sim boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
begin
  if conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = conta) then
    raise exception 'Essa vaga não é sua.' using errcode = '42501';
  end if;
  update public.conquistas c
     set empresa = case when p_sim then 'confirmou' else 'negou' end,
         empresa_em = now(),
         -- "Não é verdade": a conquista sai do feed
         mostrada_em = case when p_sim then c.mostrada_em else null end
   where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil and c.resposta = 'comecei';
  if not found then
    raise exception 'Essa pessoa não disse que começou nessa vaga.' using errcode = 'P0002';
  end if;
  -- confirmou: no quadro da vaga, a pessoa vai para Contratado (como se a empresa mudasse a etapa)
  if p_sim then
    insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa)
    values (p_anuncio, p_perfil, 'contratado')
    on conflict (anuncio_id, perfil_id) do update set etapa = 'contratado', atualizado_em = now()
      where public.etapas_candidatos.etapa is distinct from 'contratado';
  end if;
  update public.notificacoes nt set lida = true
   where nt.destinatario_id = conta and nt.anuncio_id = p_anuncio and nt.ator_id = p_perfil
     and nt.tipo = 'conquista_confirmar';
  perform privado.sincronizar_contratacao(p_anuncio, p_perfil);
end
$$;
revoke execute on function public.confirmar_conquista(uuid, uuid, boolean) from public, anon;
grant execute on function public.confirmar_conquista(uuid, uuid, boolean) to authenticated;

-- 6. No feed: as conquistas perto e os parabéns ------------------------------------------------------------------

-- (a primeira versão deste arquivo devolvia outras colunas)
drop function if exists public.conquistas_perto(double precision, double precision, double precision, integer);
create or replace function public.conquistas_perto(
  p_lat double precision,
  p_lng double precision,
  p_raio_km double precision default 25,
  p_limite integer default 30
)
returns table (
  anuncio_id uuid, perfil_id uuid, pessoa_nome text, pessoa_foto text, pessoa_tipo text,
  categoria text, bairro text, cidade text,
  empresa_id uuid, empresa_nome text, empresa_foto text, titulo text, confirmada boolean,
  parabens integer, dei_parabens boolean, minha boolean, quando timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  conta uuid := (select public.conta_atual());
  ponto extensions.geography :=
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  seguidos uuid[];
begin
  if conta is null then
    return;
  end if;
  select coalesce(array_agg(s.alvo_perfil), '{}') into seguidos
    from public.seguindo s
   where s.perfil_id in (conta, (select auth.uid())) and s.alvo_perfil is not null;
  return query
    select x.anuncio_id, x.perfil_id, privado.nome_da_conquista(pp.nome), pp.foto, pp.tipo,
           a.categoria, a.bairro, a.cidade,
           pa.id, pa.nome, pa.foto, a.titulo, coalesce(x.empresa = 'confirmou', false),
           x.parabens,
           exists (select 1 from public.conquista_parabens cp
                    where cp.anuncio_id = x.anuncio_id and cp.perfil_id = x.perfil_id and cp.quem_id = conta),
           x.perfil_id = conta,
           x.mostrada_em
      from public.conquistas x
      join public.anuncios a on a.id = x.anuncio_id
      join public.perfis pp on pp.id = x.perfil_id
      join public.perfis pa on pa.id = a.autor_id
     where x.mostrada_em is not null
       and x.mostrada_em > now() - interval '30 days'
       and x.empresa is distinct from 'negou'
       and (pp.suspenso_ate is null or pp.suspenso_ate <= now())
       and (pa.suspenso_ate is null or pa.suspenso_ate <= now())
       and (extensions.st_dwithin(a.local, ponto, least(greatest(coalesce(p_raio_km, 25), 1), 100) * 1000)
            or a.autor_id = any (seguidos)
            or x.perfil_id = conta)
     order by x.mostrada_em desc
     limit least(greatest(coalesce(p_limite, 30), 1), 100);
end
$$;
revoke execute on function public.conquistas_perto(double precision, double precision, double precision, integer) from public, anon;
grant execute on function public.conquistas_perto(double precision, double precision, double precision, integer) to authenticated;

create or replace function public.dar_parabens(p_anuncio uuid, p_perfil uuid)
returns table (parabens integer, dei boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v_dei boolean;
  v_total integer;
  v_nome text;
  v_texto text;
begin
  if conta is null then
    raise exception 'Entre na sua conta para dar os parabéns.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  perform 1 from public.conquistas x
   where x.anuncio_id = p_anuncio and x.perfil_id = p_perfil
     and x.mostrada_em is not null and x.empresa is distinct from 'negou'
   for update;
  if not found then
    raise exception 'Essa conquista não está mais no Publike.' using errcode = 'P0002';
  end if;
  if p_perfil = conta then
    raise exception 'A conquista é sua: os parabéns são dos outros.' using errcode = 'P0001', hint = 'proprio';
  end if;

  delete from public.conquista_parabens cp
   where cp.anuncio_id = p_anuncio and cp.perfil_id = p_perfil and cp.quem_id = conta;
  if found then
    v_dei := false;
  else
    insert into public.conquista_parabens (anuncio_id, perfil_id, quem_id) values (p_anuncio, p_perfil, conta);
    v_dei := true;
  end if;
  select count(*)::integer into v_total from public.conquista_parabens cp
   where cp.anuncio_id = p_anuncio and cp.perfil_id = p_perfil;
  update public.conquistas x set parabens = v_total where x.anuncio_id = p_anuncio and x.perfil_id = p_perfil;

  -- um aviso por conquista, que vai atualizando: "Marcelo e mais 3 deram os parabéns"
  if v_dei then
    select p.nome into v_nome from public.perfis p where p.id = conta;
    v_texto := coalesce(v_nome, 'Alguém')
               || case when v_total > 1 then ' e mais ' || (v_total - 1) || ' deram os parabéns'
                       else ' deu os parabéns' end
               || ' pelo seu trabalho novo.';
    update public.notificacoes nt
       set ator_id = conta, lida = false, criado_em = now(), texto = v_texto
     where nt.destinatario_id = p_perfil and nt.anuncio_id = p_anuncio and nt.tipo = 'conquista_parabens';
    if not found then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
      values (p_perfil, 'conquista_parabens', p_anuncio, conta, v_texto);
    end if;
  elsif v_total = 0 then
    delete from public.notificacoes nt
     where nt.destinatario_id = p_perfil and nt.anuncio_id = p_anuncio and nt.tipo = 'conquista_parabens' and not nt.lida;
  end if;
  return query select v_total, v_dei;
end
$$;
revoke execute on function public.dar_parabens(uuid, uuid) from public, anon;
grant execute on function public.dar_parabens(uuid, uuid) to authenticated;

-- 7. Os e-mails ---------------------------------------------------------------------------------------------------

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('conquista_pergunta', 'usuarios', 51, 'Deu certo? (conquista)',
     'Para quem deu match numa vaga: 5 dias depois, o Publike pergunta se a pessoa começou a trabalhar. No máximo 3 vezes por vaga.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     'Deu certo com {{quem}}?',
     E'Oi, {{nome}}.\n\n{{motivo}}\n\nSe você começou, conte no Publike: dá para mostrar a sua conquista para quem está perto (só com o seu OK) e ela fica no seu perfil.',
     'Responder'),
    ('conquista_confirmar', 'usuarios', 52, 'Confirmar contratação (conquista)',
     'Para quem publicou a vaga: a pessoa disse que começou a trabalhar. A empresa confirma ou diz que não é verdade.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     '{{quem}} disse que começou a trabalhar com vocês',
     E'Oi, {{nome}}.\n\n{{motivo}}\n\nConfirmando, a pessoa vai para Contratado no quadro da vaga, e a conquista dela ganha o selo “Confirmado pela empresa”. Se não for verdade, a conquista sai do Publike.',
     'Confirmar'),
    ('conquista_parabens', 'usuarios', 53, 'Parabéns pela conquista',
     'Para quem mostrou a conquista: alguém deu os parabéns. No máximo um e-mail por dia (o sino recebe todos).',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     'Deram os parabéns pelo seu trabalho novo',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver no Publike')
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

insert into privado.regras_email (modelo, intervalo_min) values ('conquista_parabens', 1440)
on conflict (modelo) do nothing;

-- 8. A novidade --------------------------------------------------------------------------------------------------

insert into public.novidades (dia, para, titulo, texto, link, botao, publicada)
select (now() at time zone 'America/Sao_Paulo')::date, 'todos', 'Posts e conquistas',
       'Os recados agora se chamam posts. E quando você começar a trabalhar por uma vaga do Publike, conte para a gente: com o seu OK, a conquista aparece para quem está perto, e todo mundo pode dar os parabéns.',
       '/?tipo=recado', 'Ver os posts', true
 where not exists (select 1 from public.novidades n where n.titulo = 'Posts e conquistas');

notify pgrst, 'reload schema';
