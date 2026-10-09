-- =====================================================================
-- Desfazer um match
--
-- Qualquer um dos dois lados de um match pode desistir, mas precisa dizer
-- o motivo (uma opção) e escrever uma justificativa. O contato some para os
-- dois na hora. A outra pessoa recebe um aviso com o motivo; a justificativa
-- fica só para a equipe (admin > ficha da pessoa).
--
-- Quem contratou um serviço ainda pode avaliar se foi o profissional quem
-- desfez o match (por exemplo, não apareceu). Se foi o próprio cliente, não.
--
-- Rode depois de 20261009210000_config_where.sql.
-- =====================================================================


-- 1. Curtida desfeita ------------------------------------------------------------

alter table public.curtidas drop constraint curtidas_status_check;
alter table public.curtidas add constraint curtidas_status_check
  check (status in ('pendente', 'match', 'dispensada', 'desfeito'));

alter table public.curtidas
  add column desfeito_por uuid references public.perfis (id) on delete set null,
  add column desfeito_motivo text check (desfeito_motivo in (
    'vaga_preenchida', 'sem_resposta', 'nao_combinou', 'desistiu', 'nao_compareceu', 'comportamento', 'outro')),
  add column desfeito_em timestamptz;

-- O histórico fica mesmo que o anúncio ou a conta sejam apagados (para a equipe).
create table public.matches_desfeitos (
  id bigint generated always as identity primary key,
  anuncio_id uuid references public.anuncios (id) on delete set null,
  titulo text not null,
  tipo_anuncio text not null,
  autor_id uuid references public.perfis (id) on delete set null,
  interessado_id uuid references public.perfis (id) on delete set null,
  desfeito_por uuid references public.perfis (id) on delete set null,
  outro_id uuid references public.perfis (id) on delete set null,
  motivo text not null,
  justificativa text not null check (char_length(justificativa) between 10 and 500),
  match_em timestamptz,
  criado_em timestamptz not null default now()
);
create index matches_desfeitos_por_idx on public.matches_desfeitos (desfeito_por, criado_em desc);
create index matches_desfeitos_outro_idx on public.matches_desfeitos (outro_id, criado_em desc);
alter table public.matches_desfeitos enable row level security;
revoke all on public.matches_desfeitos from anon, authenticated;
comment on table public.matches_desfeitos is
  'Matches desfeitos, com a justificativa de quem desfez. Só a equipe lê (admin_matches_desfeitos).';

alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito'));

alter table privado.limites_uso drop constraint limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check
  check (acao in ('anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match'));

-- Como o motivo aparece para a outra pessoa. "Comportamento" não é repetido
-- para ela: diz só que a equipe foi avisada.
create or replace function public.rotulo_motivo_desfeito(p_motivo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_motivo
    when 'vaga_preenchida' then 'a vaga já foi preenchida'
    when 'sem_resposta' then 'não teve resposta'
    when 'nao_combinou' then 'vocês não chegaram a um acordo'
    when 'desistiu' then 'desistiu ou não precisa mais'
    when 'nao_compareceu' then 'não compareceu ao combinado'
    when 'comportamento' then 'relatou um problema para a equipe do Publike'
    else 'outro motivo'
  end
$$;


-- 2. Desfazer ----------------------------------------------------------------------

create or replace function public.desfazer_match(p_anuncio uuid, p_perfil uuid, p_motivo text, p_justificativa text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  c public.curtidas;
  a public.anuncios;
  outro uuid;
  quem text;
  texto text := btrim(regexp_replace(coalesce(p_justificativa, ''), '\s+', ' ', 'g'));
begin
  if usuario is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if p_motivo is null or p_motivo not in (
    'vaga_preenchida', 'sem_resposta', 'nao_combinou', 'desistiu', 'nao_compareceu', 'comportamento', 'outro') then
    raise exception 'Escolha o motivo.' using errcode = 'P0001', hint = 'motivo';
  end if;
  if char_length(texto) < 10 then
    raise exception 'Explique em poucas palavras por que está desfazendo (pelo menos 10 letras).'
      using errcode = 'P0001', hint = 'justificativa';
  end if;
  if char_length(texto) > 500 then
    raise exception 'Use no máximo 500 letras na justificativa.' using errcode = 'P0001', hint = 'justificativa';
  end if;

  select * into a from public.anuncios where id = p_anuncio;
  select * into c from public.curtidas
   where anuncio_id = p_anuncio and perfil_id = p_perfil
     for update;
  if not found or a.id is null or not (usuario = c.perfil_id or usuario = a.autor_id) then
    raise exception 'Match não encontrado.' using errcode = 'P0002';
  end if;
  if c.status = 'desfeito' then
    raise exception 'Este match já foi desfeito.' using errcode = 'P0001';
  end if;
  if c.status <> 'match' then
    raise exception 'Só dá para desfazer um match.' using errcode = 'P0001';
  end if;
  if p_motivo = 'vaga_preenchida' and (a.tipo <> 'vaga' or usuario <> a.autor_id) then
    raise exception 'Escolha outro motivo.' using errcode = 'P0001', hint = 'motivo';
  end if;
  perform privado.conferir_limite('desfazer_match', 10, 'Você desfez muitos matches hoje. Tente de novo amanhã.');

  outro := case when usuario = a.autor_id then c.perfil_id else a.autor_id end;
  update public.curtidas
     set status = 'desfeito', desfeito_por = usuario, desfeito_motivo = p_motivo, desfeito_em = now()
   where anuncio_id = p_anuncio and perfil_id = p_perfil;

  insert into public.matches_desfeitos
    (anuncio_id, titulo, tipo_anuncio, autor_id, interessado_id, desfeito_por, outro_id, motivo, justificativa, match_em)
  values (a.id, a.titulo, a.tipo, a.autor_id, c.perfil_id, usuario, outro, p_motivo, texto,
          coalesce(c.respondida_em, c.criado_em));

  select p.nome into quem from public.perfis p where p.id = usuario;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (outro, 'match_desfeito', a.id, usuario,
          coalesce(quem, 'A outra pessoa') || ' desfez o match em “' || a.titulo || '”. Motivo: '
          || public.rotulo_motivo_desfeito(p_motivo) || '.');

  if p_motivo = 'comportamento' then
    perform privado.avisar_equipe('aviso_match_desfeito', jsonb_build_object(
      'titulo', a.titulo,
      'quem', coalesce(quem, 'Alguém'),
      'caminho', '/admin/usuarios/' || outro));
  end if;
end
$$;

-- Para a equipe: os matches que a pessoa desfez e os que desfizeram com ela.
create or replace function public.admin_matches_desfeitos(p_perfil uuid)
returns table (
  id bigint,
  anuncio_id uuid,
  titulo text,
  tipo_anuncio text,
  fez boolean,
  outro_id uuid,
  outro_nome text,
  motivo text,
  justificativa text,
  match_em timestamptz,
  criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_equipe();
  return query
    select d.id, d.anuncio_id, d.titulo, d.tipo_anuncio, d.desfeito_por = p_perfil,
           case when d.desfeito_por = p_perfil then d.outro_id else d.desfeito_por end,
           p.nome, d.motivo,
           d.justificativa, d.match_em, d.criado_em
      from public.matches_desfeitos d
      left join public.perfis p
        on p.id = case when d.desfeito_por = p_perfil then d.outro_id else d.desfeito_por end
     where d.desfeito_por = p_perfil or d.outro_id = p_perfil
     order by d.criado_em desc
     limit 100;
end
$$;

-- Quem publicou não pode transformar um match desfeito de novo em match.
create or replace function public.responder_curtida(p_anuncio uuid, p_perfil uuid, p_decisao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  atual text;
  situacao text;
begin
  perform privado.exigir_conta_ativa();
  if p_decisao not in ('match', 'dispensada', 'pendente') then
    raise exception 'Resposta inválida.' using errcode = '22023';
  end if;
  if exists (select 1 from public.perfis p where p.id = p_perfil and p.suspenso_ate > now()) then
    raise exception 'Essa pessoa está com a conta suspensa.' using errcode = 'P0001';
  end if;
  select c.status, a.status into atual, situacao
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio
     and c.perfil_id = p_perfil
     and a.autor_id = (select auth.uid())
     for update of c;
  if not found then
    raise exception 'Curtida não encontrada.' using errcode = 'P0002';
  end if;
  if situacao in ('em_analise', 'removido') then
    raise exception 'Este anúncio está com a moderação. Responda depois que ele for liberado.'
      using errcode = 'P0001', hint = 'com_moderacao';
  end if;
  if atual = 'match' then
    raise exception 'Este match já aconteceu. Para desistir, use “Desfazer match”.' using errcode = 'P0001', hint = 'match_feito';
  end if;
  if atual = 'desfeito' then
    raise exception 'Este match foi desfeito e não volta.' using errcode = 'P0001', hint = 'match_desfeito';
  end if;
  update public.curtidas
     set status = p_decisao,
         respondida_em = case when p_decisao = 'pendente' then null else now() end
   where anuncio_id = p_anuncio and perfil_id = p_perfil;
end
$$;


-- 3. E-mails ---------------------------------------------------------------

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('match_desfeito', 'usuarios', 11, 'Match desfeito',
     'Quando a outra pessoa de um match desiste. Vai junto o motivo que ela escolheu (a justificativa fica só para a equipe).',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     '{{quem}} desfez o match em “{{titulo}}”',
     'Oi, {{nome}}.

{{quem}} desfez o match em “{{titulo}}” no Publike. Motivo: {{motivo}}.

O contato de vocês não aparece mais no painel. Se aconteceu algo errado, denuncie pelo site ou responda este e-mail.',
     'Abrir o Publike'),

    ('aviso_match_desfeito', 'equipe', 14, 'Match desfeito por comportamento',
     'Aviso para a equipe quando alguém desfaz um match dizendo que a outra pessoa teve comportamento inadequado.',
     array['titulo', 'quem', 'link'],
     'Match desfeito por comportamento: “{{titulo}}”',
     '{{quem}} desfez um match em “{{titulo}}” e disse que a outra pessoa teve comportamento inadequado.

A justificativa está na ficha da pessoa, no admin.',
     'Abrir a ficha')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

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
begin
  select a.titulo, a.nota_moderacao, a.autor_id into v_titulo, v_nota, v_autor
    from public.anuncios a where a.id = new.anuncio_id;
  select p.nome into v_quem from public.perfis p where p.id = new.ator_id;
  if new.tipo = 'match_desfeito' then
    select public.rotulo_motivo_desfeito(d.motivo) into v_motivo
      from public.matches_desfeitos d
     where d.anuncio_id = new.anuncio_id and d.desfeito_por = new.ator_id
     order by d.id desc limit 1;
  end if;
  perform privado.enfileirar_email(new.destinatario_id, new.tipo, jsonb_build_object(
    'quem', coalesce(v_quem, 'Alguém'),
    'titulo', coalesce(v_titulo, ''),
    'motivo', coalesce(v_motivo, v_nota, ''),
    'caminho', case new.tipo
                 when 'curtida' then '/painel/anuncio/' || new.anuncio_id
                 when 'match' then '/painel/matches'
                 when 'liberado' then '/anuncio/' || new.anuncio_id
                 when 'removido' then '/privacidade#regras'
                 when 'avaliacao' then '/painel/avaliacoes'
                 when 'avaliacao_retida' then '/privacidade#regras'
                 when 'match_desfeito' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/anuncio/' || new.anuncio_id end
                 else '/painel'
               end));
  return null;
end
$$;


-- 4. Avaliar: vale também quando o profissional desfez o match ----------------

create or replace function public.avaliar(p_anuncio uuid, p_nota integer, p_comentario text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  a public.anuncios;
  atual public.avaliacoes;
  texto text := nullif(btrim(regexp_replace(coalesce(p_comentario, ''), '[ \t]+', ' ', 'g')), '');
  v_id bigint;
  esperar boolean := false;
begin
  if usuario is null then
    raise exception 'Entre na sua conta para avaliar.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if p_nota is null or p_nota not between 1 and 5 then
    raise exception 'Escolha de 1 a 5 estrelas.' using errcode = 'P0001';
  end if;
  if char_length(texto) > 600 then
    raise exception 'Use no máximo 600 letras no comentário.' using errcode = 'P0001';
  end if;
  if public.tem_contato(texto, true) then
    raise exception 'Tire o telefone, e-mail ou link do comentário.' using errcode = 'P0001', hint = 'contato_no_texto';
  end if;
  select * into a from public.anuncios where id = p_anuncio;
  if not found or a.tipo <> 'servico' then
    raise exception 'Só dá para avaliar serviços.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.curtidas c
     where c.anuncio_id = p_anuncio and c.perfil_id = usuario
       and (c.status = 'match' or (c.status = 'desfeito' and c.desfeito_por = a.autor_id))
  ) then
    raise exception 'Só avalia quem deu match com este serviço.' using errcode = 'P0001', hint = 'sem_match';
  end if;

  select * into atual from public.avaliacoes v where v.anuncio_id = p_anuncio and v.autor_id = usuario for update;
  if found then
    if atual.status in ('retida', 'removida') then
      raise exception 'Sua avaliação está com a moderação e não pode ser mudada agora.' using errcode = 'P0001';
    end if;
    if atual.nota = p_nota and atual.comentario is not distinct from texto then
      return atual.status;
    end if;
    update public.avaliacoes
       set nota = p_nota, comentario = texto, atualizado_em = now(),
           status = case when texto is null then 'publicada' else 'pendente' end
     where id = atual.id
    returning id into v_id;
  else
    perform privado.conferir_limite('avaliacao', 20, 'Você avaliou muitas vezes hoje. Tente de novo amanhã.');
    insert into public.avaliacoes (anuncio_id, profissional_id, autor_id, titulo_servico, nota, comentario, status)
    values (p_anuncio, a.autor_id, usuario, a.titulo, p_nota, texto,
            case when texto is null then 'publicada' else 'pendente' end)
    returning id into v_id;
  end if;

  if texto is not null then
    esperar := privado.mandar_avaliacao_para_ia(v_id, 'comentario');
    if not esperar then
      update public.avaliacoes set status = 'publicada' where id = v_id;
    end if;
  else
    delete from privado.fila_ia_avaliacoes where avaliacao_id = v_id and parte = 'comentario';
  end if;
  perform privado.avisar_avaliacao_publicada(v_id);
  return case when esperar then 'pendente' else 'publicada' end;
end
$$;


-- 5. Permissões --------------------------------------------------------------

revoke execute on function
  public.desfazer_match(uuid, uuid, text, text),
  public.admin_matches_desfeitos(uuid)
from public, anon;
grant execute on function public.desfazer_match(uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_matches_desfeitos(uuid) to authenticated, service_role;
grant execute on function public.rotulo_motivo_desfeito(text) to anon, authenticated;

notify pgrst, 'reload schema';
