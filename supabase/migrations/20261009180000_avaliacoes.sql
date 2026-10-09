-- =====================================================================
-- Avaliações dos profissionais
--
-- Só avalia quem deu match com o serviço, uma vez por serviço (dá para
-- mudar depois). Nota de 1 a 5 e comentário opcional. A média só aparece a
-- partir de 3 avaliações. O profissional responde uma vez, em público.
--
-- Com a moderação por IA ligada, todo comentário (e toda resposta) passa
-- pela IA antes de aparecer. Crítica honesta, mesmo negativa, é publicada.
-- Ofensa, ameaça, discriminação ou dados pessoais: o texto fica retido, vai
-- para a fila da equipe e quem escreveu leva uma advertência. A equipe
-- confirma e, em caso grave ou repetido, suspende ou bane a conta pelos
-- botões que o admin já tem.
--
-- Rode depois de 20261009150000_servicos.sql.
-- =====================================================================


-- 1. Tabelas ---------------------------------------------------------------

create table public.avaliacoes (
  id bigint generated always as identity primary key,
  -- some se o anúncio for apagado; a avaliação continua no perfil
  anuncio_id uuid references public.anuncios (id) on delete set null,
  profissional_id uuid not null references public.perfis (id) on delete cascade,
  autor_id uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  -- título do serviço na hora (continua legível se o anúncio sumir)
  titulo_servico text not null check (char_length(titulo_servico) between 1 and 90),
  nota smallint not null check (nota between 1 and 5),
  comentario text check (char_length(comentario) between 1 and 600),
  status text not null default 'pendente' check (status in ('pendente', 'publicada', 'retida', 'removida')),
  publicada_em timestamptz,
  resposta text check (char_length(resposta) between 1 and 600),
  resposta_status text check (resposta_status in ('pendente', 'publicada', 'retida', 'removida')),
  respondida_em timestamptz,
  denunciada_em timestamptz,
  motivo_denuncia text check (char_length(motivo_denuncia) <= 500),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint resposta_completa check ((resposta is null) = (resposta_status is null)),
  constraint nao_se_avalia check (autor_id <> profissional_id),
  unique (anuncio_id, autor_id)
);
create index avaliacoes_profissional_idx on public.avaliacoes (profissional_id, status, criado_em desc);
create index avaliacoes_autor_idx on public.avaliacoes (autor_id, criado_em desc);
create index avaliacoes_fila_idx on public.avaliacoes (criado_em desc)
  where status in ('pendente', 'retida') or resposta_status in ('pendente', 'retida') or denunciada_em is not null;

comment on table public.avaliacoes is
  'Avaliação de um profissional por quem deu match no serviço. Só as publicadas aparecem; o acesso é só pelas funções.';

-- Cada passada da IA por um comentário ou resposta (para a equipe ver o porquê).
create table public.moderacao_ia_avaliacoes (
  id bigint generated always as identity primary key,
  avaliacao_id bigint not null references public.avaliacoes (id) on delete cascade,
  parte text not null check (parte in ('comentario', 'resposta')),
  decisao text not null check (decisao in ('aprovado', 'retido', 'erro')),
  categorias text[] not null default '{}',
  explicacao text check (char_length(explicacao) <= 1000),
  modelo text,
  criado_em timestamptz not null default now()
);
create index moderacao_ia_avaliacoes_idx on public.moderacao_ia_avaliacoes (avaliacao_id, parte, criado_em desc);

-- Advertências: ficam na ficha da pessoa e ajudam a equipe a decidir uma suspensão.
create table public.advertencias (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  origem text not null check (origem in ('ia', 'equipe')),
  motivo text not null check (char_length(motivo) between 3 and 500),
  avaliacao_id bigint references public.avaliacoes (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index advertencias_perfil_idx on public.advertencias (perfil_id, criado_em desc);

-- Fila da IA para os textos das avaliações (comentário e resposta).
create table privado.fila_ia_avaliacoes (
  avaliacao_id bigint not null references public.avaliacoes (id) on delete cascade,
  parte text not null check (parte in ('comentario', 'resposta')),
  status text not null default 'pendente' check (status in ('pendente', 'revisando')),
  tentativas smallint not null default 0,
  criado_em timestamptz not null default now(),
  tentar_depois timestamptz not null default now(),
  primary key (avaliacao_id, parte)
);

alter table public.avaliacoes enable row level security;
alter table public.moderacao_ia_avaliacoes enable row level security;
alter table public.advertencias enable row level security;
alter table privado.fila_ia_avaliacoes enable row level security;
-- Sem regras: ninguém lê nem escreve direto pela API, só pelas funções abaixo.
revoke all on public.avaliacoes, public.moderacao_ia_avaliacoes, public.advertencias from anon, authenticated;
revoke all on privado.fila_ia_avaliacoes from public, anon, authenticated;

-- Avisos novos no sino
alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida'));

-- Limite por dia e registro da equipe
alter table privado.limites_uso drop constraint limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check
  check (acao in ('anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao'));

alter table public.registro_equipe drop constraint registro_equipe_alvo_tipo_check;
alter table public.registro_equipe add constraint registro_equipe_alvo_tipo_check
  check (alvo_tipo in ('usuario', 'anuncio', 'config', 'modelo', 'equipe', 'chave', 'avaliacao'));


-- 2. Apoio -------------------------------------------------------------------

-- Média e total das avaliações publicadas de um profissional (a busca usa).
create or replace function public.nota_do_profissional(p_profissional uuid)
returns table (media numeric, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  select round(avg(v.nota)::numeric, 1), count(*)::integer
    from public.avaliacoes v
   where v.profissional_id = p_profissional and v.status = 'publicada'
$$;

-- Põe o texto na fila da IA, se a moderação automática estiver ligada.
-- Devolve true quando o texto precisa esperar a IA.
create or replace function privado.mandar_avaliacao_para_ia(p_avaliacao bigint, p_parte text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select c.ia_moderacao from public.config_site c limit 1), false) then
    return false;
  end if;
  insert into privado.fila_ia_avaliacoes (avaliacao_id, parte) values (p_avaliacao, p_parte)
  on conflict (avaliacao_id, parte) do update
    set status = 'pendente', tentativas = 0, criado_em = now(), tentar_depois = now();
  return true;
end
$$;

-- A avaliação apareceu pela primeira vez: o profissional recebe um aviso.
create or replace function privado.avisar_avaliacao_publicada(p_avaliacao bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.avaliacoes;
  quem text;
begin
  update public.avaliacoes set publicada_em = now()
   where id = p_avaliacao and status = 'publicada' and publicada_em is null
  returning * into v;
  if not found then
    return;
  end if;
  select p.nome into quem from public.perfis p where p.id = v.autor_id;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (v.profissional_id, 'avaliacao', v.anuncio_id, v.autor_id,
          coalesce(split_part(quem, ' ', 1), 'Alguém') || ' avaliou você com ' || v.nota
          || case when v.nota = 1 then ' estrela' else ' estrelas' end
          || ' em “' || v.titulo_servico || '”.');
end
$$;

-- O texto ficou retido: advertência para quem escreveu, aviso para ele e para a equipe.
create or replace function privado.reter_texto_de_avaliacao(p_avaliacao bigint, p_parte text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.avaliacoes;
  quem uuid;
begin
  select * into v from public.avaliacoes where id = p_avaliacao;
  if not found then
    return;
  end if;
  if p_parte = 'comentario' then
    update public.avaliacoes set status = 'retida', atualizado_em = now() where id = p_avaliacao;
    quem := v.autor_id;
  else
    update public.avaliacoes set resposta_status = 'retida', atualizado_em = now() where id = p_avaliacao;
    quem := v.profissional_id;
  end if;
  insert into public.advertencias (perfil_id, origem, motivo, avaliacao_id)
  values (quem, 'ia', left(coalesce(nullif(btrim(p_motivo), ''), 'Texto retido pela moderação automática.'), 500), p_avaliacao);
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
  values (quem, 'avaliacao_retida', v.anuncio_id,
          case when p_parte = 'comentario'
               then 'Sua avaliação em “' || v.titulo_servico || '” não foi publicada: ela não segue as regras do Publike. A equipe vai analisar.'
               else 'Sua resposta à avaliação em “' || v.titulo_servico || '” não foi publicada: ela não segue as regras do Publike. A equipe vai analisar.'
          end);
  perform privado.avisar_equipe('aviso_avaliacao', jsonb_build_object(
    'titulo', v.titulo_servico,
    'origem', 'a moderação automática (IA) achou o texto impróprio.',
    'caminho', '/admin/denuncias#avaliacoes'));
end
$$;


-- 3. Quem usa o site ---------------------------------------------------------

-- Avaliar (ou mudar a própria avaliação) de um serviço com match.
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
     where c.anuncio_id = p_anuncio and c.perfil_id = usuario and c.status = 'match'
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

-- O profissional responde uma vez, em público.
create or replace function public.responder_avaliacao(p_avaliacao bigint, p_resposta text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  v public.avaliacoes;
  texto text := nullif(btrim(coalesce(p_resposta, '')), '');
  esperar boolean;
begin
  if usuario is null then
    raise exception 'Entre na sua conta para responder.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if texto is null then
    raise exception 'Escreva a resposta.' using errcode = 'P0001';
  end if;
  if char_length(texto) > 600 then
    raise exception 'Use no máximo 600 letras na resposta.' using errcode = 'P0001';
  end if;
  if public.tem_contato(texto, true) then
    raise exception 'Tire o telefone, e-mail ou link da resposta.' using errcode = 'P0001', hint = 'contato_no_texto';
  end if;
  select * into v from public.avaliacoes where id = p_avaliacao and profissional_id = usuario for update;
  if not found or v.status <> 'publicada' then
    raise exception 'Avaliação não encontrada.' using errcode = 'P0002';
  end if;
  if v.resposta is not null then
    raise exception 'Você já respondeu esta avaliação.' using errcode = 'P0001';
  end if;
  update public.avaliacoes
     set resposta = texto, resposta_status = 'pendente', respondida_em = now(), atualizado_em = now()
   where id = p_avaliacao;
  esperar := privado.mandar_avaliacao_para_ia(p_avaliacao, 'resposta');
  if not esperar then
    update public.avaliacoes set resposta_status = 'publicada' where id = p_avaliacao;
  end if;
  return case when esperar then 'pendente' else 'publicada' end;
end
$$;

-- O profissional pede para a equipe olhar uma avaliação (ela continua no ar até a decisão).
create or replace function public.denunciar_avaliacao(p_avaliacao bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  v public.avaliacoes;
  motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if usuario is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if motivo is null or char_length(motivo) < 5 then
    raise exception 'Conte em poucas palavras o que há de errado.' using errcode = 'P0001';
  end if;
  select * into v from public.avaliacoes where id = p_avaliacao and profissional_id = usuario for update;
  if not found or v.status <> 'publicada' then
    raise exception 'Avaliação não encontrada.' using errcode = 'P0002';
  end if;
  if v.denunciada_em is not null then
    return;
  end if;
  perform privado.conferir_limite('denuncia', 10, 'Você já enviou muitas denúncias hoje. A moderação vai analisar as que chegaram.');
  update public.avaliacoes set denunciada_em = now(), motivo_denuncia = left(motivo, 500) where id = p_avaliacao;
  perform privado.avisar_equipe('aviso_avaliacao', jsonb_build_object(
    'titulo', v.titulo_servico,
    'origem', 'o profissional denunciou a avaliação: ' || left(motivo, 200),
    'caminho', '/admin/denuncias#avaliacoes'));
end
$$;

-- Avaliações publicadas de um profissional (perfil público e página do serviço).
-- De quem avaliou, só o primeiro nome e a foto.
create or replace function public.avaliacoes_publicas(p_profissional uuid, p_limite integer default 50)
returns table (
  id bigint,
  nota smallint,
  comentario text,
  titulo_servico text,
  anuncio_id uuid,
  criado_em timestamptz,
  autor_nome text,
  autor_foto text,
  resposta text,
  respondida_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.nota, v.comentario, v.titulo_servico, v.anuncio_id, v.criado_em,
         split_part(p.nome, ' ', 1), p.foto,
         case when v.resposta_status = 'publicada' then v.resposta end,
         case when v.resposta_status = 'publicada' then v.respondida_em end
    from public.avaliacoes v
    join public.perfis p on p.id = v.autor_id
   where v.profissional_id = p_profissional and v.status = 'publicada'
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
   order by v.criado_em desc
   limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;

-- As que o profissional recebeu (para responder), com a situação da resposta.
create or replace function public.minhas_avaliacoes_recebidas()
returns table (
  id bigint,
  nota smallint,
  comentario text,
  titulo_servico text,
  anuncio_id uuid,
  criado_em timestamptz,
  autor_nome text,
  autor_foto text,
  resposta text,
  resposta_status text,
  denunciada boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.nota, v.comentario, v.titulo_servico, v.anuncio_id, v.criado_em,
         split_part(p.nome, ' ', 1), p.foto, v.resposta, v.resposta_status, v.denunciada_em is not null
    from public.avaliacoes v
    join public.perfis p on p.id = v.autor_id
   where v.profissional_id = (select auth.uid()) and v.status = 'publicada'
   order by v.criado_em desc
$$;

-- A minha avaliação de um serviço (para mostrar e mudar).
create or replace function public.minha_avaliacao(p_anuncio uuid)
returns table (id bigint, nota smallint, comentario text, status text, criado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.nota, v.comentario, v.status, v.criado_em
    from public.avaliacoes v
   where v.anuncio_id = p_anuncio and v.autor_id = (select auth.uid())
$$;


-- 4. Servidor do site (IA) ---------------------------------------------------

create or replace function public.servidor_pegar_avaliacoes_ia(p_chave text, p_limite integer default 5)
returns table (
  avaliacao_id bigint,
  parte text,
  versao text,
  texto text,
  nota smallint,
  titulo_servico text,
  modelo text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_servidor(p_chave);
  -- travou três vezes: registra o erro e deixa para a equipe (o texto continua escondido)
  with esgotadas as (
    delete from privado.fila_ia_avaliacoes f
     where f.status = 'revisando' and f.tentar_depois <= now() and f.tentativas >= 3
    returning f.avaliacao_id, f.parte
  )
  insert into public.moderacao_ia_avaliacoes (avaliacao_id, parte, decisao, explicacao)
  select e.avaliacao_id, e.parte, 'erro', 'A revisão não terminou depois de três tentativas.' from esgotadas e;

  return query
  with escolhidos as (
    select f.avaliacao_id, f.parte from privado.fila_ia_avaliacoes f
     where f.tentar_depois <= now() and (f.status = 'pendente' or f.tentativas < 3)
     order by f.criado_em
     limit least(greatest(coalesce(p_limite, 5), 1), 20)
     for update skip locked
  ), marcados as (
    update privado.fila_ia_avaliacoes f
       set status = 'revisando', tentativas = f.tentativas + 1, tentar_depois = now() + interval '5 minutes'
      from escolhidos e
     where f.avaliacao_id = e.avaliacao_id and f.parte = e.parte
    returning f.avaliacao_id, f.parte
  )
  select v.id, m.parte,
         md5(coalesce(case when m.parte = 'comentario' then v.comentario else v.resposta end, '')),
         case when m.parte = 'comentario' then v.comentario else v.resposta end,
         v.nota, v.titulo_servico, c.ia_modelo
    from marcados m
    join public.avaliacoes v on v.id = m.avaliacao_id
    cross join public.config_site c;
end
$$;

create or replace function public.servidor_resultado_avaliacao(
  p_chave text,
  p_avaliacao bigint,
  p_parte text,
  p_versao text,
  p_decisao text,
  p_categorias text[] default '{}',
  p_explicacao text default null,
  p_modelo text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila privado.fila_ia_avaliacoes;
  v public.avaliacoes;
  categorias text[];
begin
  perform privado.exigir_servidor(p_chave);
  if p_decisao not in ('aprovado', 'retido', 'erro') or p_parte not in ('comentario', 'resposta') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  select * into fila from privado.fila_ia_avaliacoes f where f.avaliacao_id = p_avaliacao and f.parte = p_parte for update;
  if not found then
    return 'ignorado';
  end if;
  select * into v from public.avaliacoes where id = p_avaliacao for update;
  if not found then
    delete from privado.fila_ia_avaliacoes where avaliacao_id = p_avaliacao and parte = p_parte;
    return 'ignorado';
  end if;
  -- o texto mudou enquanto a IA pensava: revisa de novo
  if md5(coalesce(case when p_parte = 'comentario' then v.comentario else v.resposta end, '')) is distinct from p_versao then
    update privado.fila_ia_avaliacoes set status = 'pendente', tentativas = 0, tentar_depois = now()
     where avaliacao_id = p_avaliacao and parte = p_parte;
    return 'desatualizado';
  end if;
  if p_decisao = 'erro' and fila.tentativas < 3 then
    update privado.fila_ia_avaliacoes
       set status = 'pendente', tentar_depois = now() + fila.tentativas * interval '5 minutes'
     where avaliacao_id = p_avaliacao and parte = p_parte;
    return 'tentar_de_novo';
  end if;
  select coalesce(array_agg(distinct c), '{}') into categorias
    from (select c from unnest(coalesce(p_categorias, '{}')) as c where c ~ '^[a-z_]{2,40}$' limit 8) t;
  delete from privado.fila_ia_avaliacoes where avaliacao_id = p_avaliacao and parte = p_parte;
  insert into public.moderacao_ia_avaliacoes (avaliacao_id, parte, decisao, categorias, explicacao, modelo)
  values (p_avaliacao, p_parte, p_decisao, categorias, left(p_explicacao, 1000), left(p_modelo, 80));

  if p_decisao = 'aprovado' then
    if p_parte = 'comentario' then
      update public.avaliacoes set status = 'publicada' where id = p_avaliacao and status = 'pendente';
      perform privado.avisar_avaliacao_publicada(p_avaliacao);
    else
      update public.avaliacoes set resposta_status = 'publicada' where id = p_avaliacao and resposta_status = 'pendente';
    end if;
  elsif p_decisao = 'retido' then
    perform privado.reter_texto_de_avaliacao(p_avaliacao, p_parte, p_explicacao);
  end if;
  -- 'erro' depois de três tentativas: continua escondido e aparece na fila da equipe
  return p_decisao;
end
$$;


-- 5. Equipe ------------------------------------------------------------------

-- Avaliações que precisam de uma pessoa: retidas pela IA, que a IA não
-- conseguiu revisar, ou denunciadas pelo profissional.
create or replace function public.fila_avaliacoes()
returns table (
  avaliacao_id bigint,
  parte text,
  situacao text,
  texto text,
  nota smallint,
  titulo_servico text,
  anuncio_id uuid,
  escritor_id uuid,
  escritor_nome text,
  escritor_advertencias integer,
  profissional_id uuid,
  profissional_nome text,
  ia_categorias text[],
  ia_explicacao text,
  motivo_denuncia text,
  criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_equipe();
  return query
    with itens as (
      -- comentário retido, que a IA não revisou, ou denunciado
      select v.id, 'comentario'::text as parte,
             case when v.status = 'retida' then 'retida'
                  when v.status = 'pendente' then 'sem_revisao'
                  else 'denunciada' end as situacao,
             v.comentario as texto, v.autor_id as escritor, v.motivo_denuncia, v.criado_em
        from public.avaliacoes v
       where v.status = 'retida'
          or (v.status = 'publicada' and v.denunciada_em is not null)
          or (v.status = 'pendente' and not exists (
                select 1 from privado.fila_ia_avaliacoes f where f.avaliacao_id = v.id and f.parte = 'comentario'))
      union all
      select v.id, 'resposta'::text,
             case when v.resposta_status = 'retida' then 'retida' else 'sem_revisao' end,
             v.resposta, v.profissional_id, null::text, v.respondida_em
        from public.avaliacoes v
       where v.resposta_status = 'retida'
          or (v.resposta_status = 'pendente' and not exists (
                select 1 from privado.fila_ia_avaliacoes f where f.avaliacao_id = v.id and f.parte = 'resposta'))
    )
    select i.id, i.parte, i.situacao, i.texto, v.nota, v.titulo_servico, v.anuncio_id,
           i.escritor, pe.nome,
           (select count(*)::integer from public.advertencias ad where ad.perfil_id = i.escritor),
           v.profissional_id, pp.nome,
           coalesce(ia.categorias, '{}'), ia.explicacao,
           i.motivo_denuncia, i.criado_em
      from itens i
      join public.avaliacoes v on v.id = i.id
      join public.perfis pe on pe.id = i.escritor
      join public.perfis pp on pp.id = v.profissional_id
      left join lateral (
        select m.categorias, m.explicacao from public.moderacao_ia_avaliacoes m
         where m.avaliacao_id = i.id and m.parte = i.parte
         order by m.criado_em desc, m.id desc limit 1
      ) ia on true
     order by (i.situacao = 'retida') desc, i.criado_em desc;
end
$$;

-- Decisão da equipe: 'publicar' (estava certo) ou 'remover'.
-- Publicar um texto que a IA reteve tira a advertência que ela tinha dado.
create or replace function public.moderar_avaliacao(p_avaliacao bigint, p_parte text, p_decisao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.avaliacoes;
  escritor uuid;
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

  perform privado.registrar(case when p_decisao = 'publicar' then 'publicar_avaliacao' else 'remover_avaliacao' end,
                            'avaliacao', p_avaliacao::text, v.titulo_servico,
                            jsonb_build_object('parte', p_parte, 'escritor', escritor));
end
$$;

-- Advertências de uma pessoa (ficha no admin).
create or replace function public.admin_advertencias(p_usuario uuid)
returns table (id bigint, origem text, motivo text, avaliacao_id bigint, criado_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_equipe();
  return query
    select a.id, a.origem, a.motivo, a.avaliacao_id, a.criado_em
      from public.advertencias a where a.perfil_id = p_usuario order by a.criado_em desc;
end
$$;


-- 6. Busca e página do serviço: a nota do profissional -----------------------

drop function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text
);

create function public.buscar_anuncios(
  p_lat double precision default -16.6806,
  p_lng double precision default -49.2563,
  p_raio_km double precision default 25,
  p_tipo text default null,
  p_categoria text default null,
  p_regime text default null,
  p_texto text default null,
  p_ordem text default 'perto',
  p_limite integer default 60,
  p_cidade text default null,
  p_bairro text default null,
  p_bairros_regiao text[] default null,
  p_regiao text default null
)
returns table (
  id uuid,
  tipo text,
  titulo text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  cidade text,
  bairro text,
  lat double precision,
  lng double precision,
  distancia_km double precision,
  criado_em timestamptz,
  autor_id uuid,
  autor_nome text,
  autor_tipo text,
  autor_verificado boolean,
  minha_curtida text,
  prioridade integer,
  oficio text,
  foto text,
  autor_nota numeric,
  autor_avaliacoes integer
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with ref as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as ponto
  ),
  termo as (
    select nullif(btrim(coalesce(p_texto, '')), '') as texto
  ),
  consulta as (
    select t.texto,
           case when t.texto is null then null
                else websearch_to_tsquery('portuguese'::regconfig, public.sem_acento(t.texto)) end as tsq
      from termo t
  ),
  casa as (
    select nullif(btrim(coalesce(p_cidade, '')), '') as cidade,
           nullif(public.chave_bairro(coalesce(p_bairro, '')), '') as bairro,
           coalesce(p_bairros_regiao, '{}') as regiao,
           case when btrim(coalesce(p_cidade, '')) = 'Goiânia' and nullif(btrim(coalesce(p_regiao, '')), '') is not null
                then 'Goiânia: ' || btrim(p_regiao) end as area
  ),
  achados as (
    select a.id, a.tipo, a.titulo, a.categoria, a.regime,
           a.pagamento_valor, a.pagamento_unidade, a.beneficios,
           a.cidade, a.bairro,
           round(st_y(a.local::geometry)::numeric, 5)::double precision as lat,
           round(st_x(a.local::geometry)::numeric, 5)::double precision as lng,
           st_distance(a.local, ref.ponto) as distancia_m,
           a.criado_em, p.id as autor_id, p.nome as autor_nome, p.tipo as autor_tipo,
           p.verificado as autor_verificado,
           c.status as minha_curtida,
           case
             when h.cidade is null then 3
             when a.cidade = h.cidade and h.bairro is not null and public.chave_bairro(a.bairro) = h.bairro then 0
             when a.cidade = h.cidade and public.chave_bairro(a.bairro) = any (h.regiao) then 1
             when a.tipo = 'servico' and h.area is not null and h.area = any (a.atende) then 1
             when a.cidade = h.cidade then 2
             when a.tipo = 'servico' and h.cidade = any (a.atende) then 2
             else 3
           end as prioridade,
           a.oficio,
           a.fotos[1] as foto
      from public.anuncios a
      cross join ref
      cross join consulta q
      cross join casa h
      join public.perfis p on p.id = a.autor_id
      left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
     where a.status = 'ativo'
       and a.expira_em > now()
       and (p.suspenso_ate is null or p.suspenso_ate <= now())
       and (st_dwithin(a.local, ref.ponto, least(greatest(p_raio_km, 1), 100) * 1000)
            or (a.tipo = 'servico' and h.cidade is not null
                and (h.cidade = any (a.atende) or h.area = any (a.atende))))
       and (p_tipo is null or a.tipo = p_tipo)
       and (p_categoria is null or a.categoria = p_categoria)
       and (p_regime is null or a.regime = p_regime)
       and (q.texto is null
            or a.busca @@ q.tsq
            or public.sem_acento(a.titulo) ilike '%' || public.sem_acento(q.texto) || '%')
  ),
  escolhidos as (
    select * from achados x
     order by
       x.prioridade,
       case when p_ordem = 'recentes' then x.criado_em end desc nulls last,
       x.distancia_m,
       x.criado_em desc
     limit least(greatest(p_limite, 1), 200)
  )
  select x.id, x.tipo, x.titulo, x.categoria, x.regime,
         x.pagamento_valor, x.pagamento_unidade, x.beneficios,
         x.cidade, x.bairro, x.lat, x.lng,
         round((x.distancia_m / 1000)::numeric, 1)::double precision,
         x.criado_em, x.autor_id, x.autor_nome, x.autor_tipo, x.autor_verificado,
         x.minha_curtida, x.prioridade, x.oficio, x.foto,
         n.media, coalesce(n.total, 0)
    from escolhidos x
    left join lateral (
      select * from public.nota_do_profissional(x.autor_id) where x.tipo = 'servico'
    ) n on true
   order by
     x.prioridade,
     case when p_ordem = 'recentes' then x.criado_em end desc nulls last,
     x.distancia_m,
     x.criado_em desc
$$;

revoke all on function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text
) from public;
grant execute on function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text
) to anon, authenticated;


-- 7. E-mails ---------------------------------------------------------------

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('avaliacao', 'usuarios', 9, 'Avaliação nova',
     'Quando o profissional recebe uma avaliação (depois da revisão da IA, se ela estiver ligada).',
     array['nome', 'quem', 'titulo', 'link'],
     'Você recebeu uma avaliação em “{{titulo}}”',
     'Oi, {{nome}}!

{{quem}} avaliou o seu serviço “{{titulo}}” no Publike.

Veja a avaliação no painel. Se quiser, responda: a resposta aparece junto, no seu perfil.',
     'Ver a avaliação'),

    ('avaliacao_retida', 'usuarios', 10, 'Avaliação não publicada',
     'Quando o comentário ou a resposta de uma avaliação fica retido por não seguir as regras.',
     array['nome', 'titulo', 'link'],
     'Seu texto em “{{titulo}}” não foi publicado',
     'Oi, {{nome}}.

O que você escreveu na avaliação de “{{titulo}}” não foi publicado porque parece não seguir as regras do Publike (ofensa, ameaça, discriminação ou dados pessoais de alguém).

A equipe vai analisar. Textos assim podem levar à suspensão da conta. Se achar que foi um engano, é só responder este e-mail.',
     'Ler as regras'),

    ('aviso_avaliacao', 'equipe', 13, 'Avaliação para revisar',
     'Aviso para a equipe quando a IA retém uma avaliação ou o profissional denuncia uma.',
     array['titulo', 'origem', 'link'],
     'Avaliação para revisar: “{{titulo}}”',
     'Uma avaliação do serviço “{{titulo}}” precisa de uma olhada.

Por quê: {{origem}}',
     'Abrir a fila')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- Os avisos de avaliação levam para o lugar certo.
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
begin
  select a.titulo, a.nota_moderacao into v_titulo, v_nota from public.anuncios a where a.id = new.anuncio_id;
  select p.nome into v_quem from public.perfis p where p.id = new.ator_id;
  perform privado.enfileirar_email(new.destinatario_id, new.tipo, jsonb_build_object(
    'quem', coalesce(v_quem, 'Alguém'),
    'titulo', coalesce(v_titulo, ''),
    'motivo', coalesce(v_nota, ''),
    'caminho', case new.tipo
                 when 'curtida' then '/painel/anuncio/' || new.anuncio_id
                 when 'match' then '/painel/matches'
                 when 'liberado' then '/anuncio/' || new.anuncio_id
                 when 'removido' then '/privacidade#regras'
                 when 'avaliacao' then '/painel/avaliacoes'
                 when 'avaliacao_retida' then '/privacidade#regras'
                 else '/painel'
               end));
  return null;
end
$$;


-- 8. Permissões --------------------------------------------------------------

revoke execute on function
  privado.mandar_avaliacao_para_ia(bigint, text),
  privado.avisar_avaliacao_publicada(bigint),
  privado.reter_texto_de_avaliacao(bigint, text, text)
from public;

revoke execute on function
  public.avaliar(uuid, integer, text),
  public.responder_avaliacao(bigint, text),
  public.denunciar_avaliacao(bigint, text),
  public.minhas_avaliacoes_recebidas(),
  public.minha_avaliacao(uuid),
  public.fila_avaliacoes(),
  public.moderar_avaliacao(bigint, text, text),
  public.admin_advertencias(uuid),
  public.servidor_pegar_avaliacoes_ia(text, integer),
  public.servidor_resultado_avaliacao(text, bigint, text, text, text, text[], text, text)
from public, anon;

grant execute on function
  public.avaliar(uuid, integer, text),
  public.responder_avaliacao(bigint, text),
  public.denunciar_avaliacao(bigint, text),
  public.minhas_avaliacoes_recebidas(),
  public.minha_avaliacao(uuid)
to authenticated;

grant execute on function
  public.fila_avaliacoes(),
  public.moderar_avaliacao(bigint, text, text),
  public.admin_advertencias(uuid)
to authenticated, service_role;

grant execute on function
  public.servidor_pegar_avaliacoes_ia(text, integer),
  public.servidor_resultado_avaliacao(text, bigint, text, text, text, text[], text, text)
to anon, authenticated, service_role;

grant execute on function
  public.nota_do_profissional(uuid),
  public.avaliacoes_publicas(uuid, integer)
to anon, authenticated;

notify pgrst, 'reload schema';
