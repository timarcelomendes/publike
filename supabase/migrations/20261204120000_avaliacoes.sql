-- Avaliações Publike, fase A (28/10/2026). Pode rodar de novo.
--
-- Testes da marca Publike que a empresa ou agência põe na vaga: o teste prático da função (acertos de
-- 0 a 10) e as situações de trabalho (pontos por competência). A empresa também cria os testes da casa.
-- O candidato faz pelo celular, depois de aceitar (para que serve, quem vê, por quanto tempo), e vê o
-- próprio resultado. Ninguém é recusado pelo teste: a nota é um sinal para quem decide. Não é teste
-- psicológico (Lei 4.119/1962): mede o conhecimento da função e a conduta em situações de trabalho.
-- Os testes da Publike entram como rascunho (publicado = false): o admin revisa e publica em Admin ›
-- Avaliações. É um recurso pago, liberado como cortesia (o site mostra o selo). O gabarito fica só no
-- banco. Os resultados saem 12 meses depois que a vaga sai do ar (servidor_limpar_avaliacoes, pelas filas).

-- 1. Tabelas ------------------------------------------------------------------------------------

create table if not exists privado.avaliacoes_modelos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('pratico', 'situacoes')),
  area text check (char_length(area) <= 40),
  titulo text not null check (char_length(titulo) between 3 and 90),
  descricao text check (char_length(descricao) <= 240),
  -- [{id, enunciado, competencia?, opcoes: [{id, texto, pontos}]}]
  questoes jsonb not null check (
    jsonb_typeof(questoes) = 'array' and jsonb_array_length(questoes) between 1 and 20
    and octet_length(questoes::text) <= 30000),
  -- null: da Publike; senão, o teste da casa daquela conta
  conta_id uuid references public.perfis (id) on delete cascade,
  publicado boolean not null default false,
  apagado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists avaliacoes_modelos_conta on privado.avaliacoes_modelos (conta_id);

create table if not exists privado.avaliacoes_da_vaga (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  modelo_id uuid not null references privado.avaliacoes_modelos (id) on delete cascade,
  obrigatoria boolean not null default false,
  criado_em timestamptz not null default now(),
  primary key (anuncio_id, modelo_id)
);

create table if not exists privado.avaliacoes_pedidas (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  modelo_id uuid not null references privado.avaliacoes_modelos (id) on delete cascade,
  -- vaga: a pessoa fez porque a vaga tem o teste; pedido: a empresa mandou
  origem text not null check (origem in ('vaga', 'pedido')),
  status text not null default 'pedida' check (status in ('pedida', 'feita')),
  pedida_em timestamptz not null default now(),
  prazo timestamptz not null default now() + interval '3 days',
  aceite_em timestamptz,
  feita_em timestamptz,
  -- [{q, o: [ids das opções]}], sorteado na primeira vez que a pessoa abre
  ordem jsonb,
  respostas jsonb,
  pontos integer,
  maximo integer,
  -- {competencia: {pontos, maximo}}
  por_competencia jsonb,
  unique (anuncio_id, perfil_id, modelo_id)
);
create index if not exists avaliacoes_pedidas_perfil on privado.avaliacoes_pedidas (perfil_id, pedida_em desc);

alter table privado.avaliacoes_modelos enable row level security;
alter table privado.avaliacoes_da_vaga enable row level security;
alter table privado.avaliacoes_pedidas enable row level security;
revoke all on privado.avaliacoes_modelos, privado.avaliacoes_da_vaga, privado.avaliacoes_pedidas
  from public, anon, authenticated;

-- os avisos novos: teste pedido (para o candidato) e teste feito (para quem publicou)
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
                  'teste_pedido', 'teste_feito'));

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
                    'vaga_preenchida', 'recomendacao', 'avaliacao', 'teste_pedido', 'teste_feito') then 'andamento'
    when p_tipo = 'conexao' then 'conexoes'
    when p_tipo in ('busca', 'seguindo') then 'vagas_novas'
    when p_tipo in ('vagas_semana', 'talentos_semana') then 'semana'
    when p_tipo in ('convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos',
                    'convite_vitrine') then 'convites'
    when p_tipo = 'noticias_do_dia' then 'noticias'
    else null
  end
$$;

-- sino e celular; sem e-mail (ainda sem modelo de e-mail para os testes)
drop trigger if exists notificacoes_por_email on public.notificacoes;
create trigger notificacoes_por_email
  after insert on public.notificacoes
  for each row
  when (new.tipo not in ('recado_no_ar', 'recado_retido', 'recado_forca', 'convite_curriculo', 'convite_empresa',
                         'convite_agencia', 'convite_servicos', 'convite_vitrine', 'curriculo_publico',
                         'visita', 'visitas_do_dia', 'visitas_novidade', 'avaliacao_liberada',
                         'avaliacao_removida', 'mensagem_equipe', 'vagas_semana', 'talentos_semana',
                         'comunicado', 'noticias_do_dia', 'teste_pedido', 'teste_feito'))
  execute function privado.notificacao_por_email();

drop trigger if exists notificacoes_para_celular on public.notificacoes;
create trigger notificacoes_para_celular
  after insert on public.notificacoes
  for each row
  when (new.tipo in ('curtida', 'match', 'mensagem', 'conexao', 'em_analise', 'removido', 'liberado',
                     'etapa', 'entrevista', 'entrevista_resposta', 'contratacao', 'aceite_curriculo',
                     'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas', 'vaga_preenchida',
                     'seguindo', 'busca', 'avaliacao', 'recado_retido', 'mensagem_equipe', 'equipe',
                     'vagas_semana', 'talentos_semana', 'noticias_do_dia', 'teste_pedido', 'teste_feito'))
  execute function privado.notificacao_para_celular();


-- 2. Apoio --------------------------------------------------------------------------------------

-- confere as questões (forma, pontos e o que a lei não deixa perguntar)
create or replace function privado.conferir_questoes(p_tipo text, p_questoes jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  q jsonb;
  o jsonb;
  ids text[] := '{}';
  ops text[];
  maior integer;
begin
  if jsonb_typeof(p_questoes) <> 'array' or jsonb_array_length(p_questoes) not between 1 and 20 then
    raise exception 'Ponha de 1 a 20 questões.' using errcode = 'P0001';
  end if;
  for q in select * from jsonb_array_elements(p_questoes) loop
    if jsonb_typeof(q) <> 'object' or coalesce(q ->> 'id', '') !~ '^[a-z0-9]{1,12}$' or (q ->> 'id') = any (ids)
       or char_length(coalesce(q ->> 'enunciado', '')) not between 5 and 300
       or jsonb_typeof(q -> 'opcoes') <> 'array' or jsonb_array_length(q -> 'opcoes') not between 2 and 5 then
      raise exception 'Confira as questões.' using errcode = 'P0001';
    end if;
    if privado.copiloto_criterio_proibido(q ->> 'enunciado') then
      raise exception 'A questão “%” não pode: a lei não deixa perguntar isso.', left(q ->> 'enunciado', 60)
        using errcode = 'P0001', hint = 'questao_proibida';
    end if;
    ids := ids || (q ->> 'id');
    ops := '{}';
    maior := 0;
    for o in select * from jsonb_array_elements(q -> 'opcoes') loop
      if jsonb_typeof(o) <> 'object' or coalesce(o ->> 'id', '') !~ '^[a-z0-9]{1,6}$' or (o ->> 'id') = any (ops)
         or char_length(coalesce(o ->> 'texto', '')) not between 1 and 200
         or jsonb_typeof(o -> 'pontos') <> 'number' or (o ->> 'pontos')::int not between 0 and 3 then
        raise exception 'Confira as respostas das questões.' using errcode = 'P0001';
      end if;
      ops := ops || (o ->> 'id');
      maior := greatest(maior, (o ->> 'pontos')::int);
    end loop;
    if maior = 0 then
      raise exception 'Marque a resposta certa de cada questão.' using errcode = 'P0001';
    end if;
    if p_tipo = 'pratico' and (select count(*) from jsonb_array_elements(q -> 'opcoes') x where (x ->> 'pontos')::int > 0) <> 1 then
      raise exception 'Cada questão tem uma resposta certa só.' using errcode = 'P0001';
    end if;
  end loop;
end
$$;

-- o teste pode ir para a vaga desta conta? (da Publike publicado, ou da casa)
create or replace function privado.modelo_disponivel(p_modelo uuid, p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.avaliacoes_modelos m
                  where m.id = p_modelo and m.apagado_em is null
                    and ((m.conta_id is null and m.publicado) or m.conta_id = p_conta))
$$;

-- a pontuação máxima de um teste (a melhor resposta de cada questão)
create or replace function privado.maximo_do_teste(p_questoes jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum((select max((o ->> 'pontos')::int) from jsonb_array_elements(q -> 'opcoes') o)), 0)::int
    from jsonb_array_elements(p_questoes) q
$$;

create or replace function privado.minha_vaga_qualquer(p_anuncio uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from public.anuncios a
                  where a.id = p_anuncio and a.tipo = 'vaga' and a.autor_id = public.conta_atual()) then
    raise exception 'Vaga não encontrada.' using errcode = 'P0001';
  end if;
end
$$;


-- 3. Empresa e agência ----------------------------------------------------------------------------

-- a biblioteca: os testes da Publike publicados e os da casa
create or replace function public.avaliacoes_biblioteca()
returns table (id uuid, tipo text, area text, titulo text, descricao text, questoes integer, da_casa boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.tipo, m.area, m.titulo, m.descricao, jsonb_array_length(m.questoes), m.conta_id is not null
    from privado.avaliacoes_modelos m
   where (select auth.uid()) is not null and m.apagado_em is null
     and ((m.conta_id is null and m.publicado) or m.conta_id = public.conta_atual())
   order by m.conta_id is null, m.tipo, m.titulo
$$;

-- o teste completo, com o gabarito, para quem vai usar (ou o admin, na prévia)
create or replace function public.avaliacao_modelo(p_modelo uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'tipo', m.tipo, 'area', m.area, 'titulo', m.titulo, 'descricao', m.descricao,
                            'questoes', m.questoes, 'da_casa', m.conta_id is not null)
    from privado.avaliacoes_modelos m
   where m.id = p_modelo and (select auth.uid()) is not null and m.apagado_em is null
     and ((m.conta_id is null and m.publicado) or m.conta_id = public.conta_atual())
$$;

-- o teste da casa: cria (p_id null) ou edita; só prático (uma resposta certa por questão)
create or replace function public.avaliacao_salvar_da_casa(p_id uuid, p_titulo text, p_descricao text, p_questoes jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  v_id uuid;
begin
  perform privado.exigir_conta_ativa();
  if char_length(coalesce(trim(p_titulo), '')) not between 3 and 90 then
    raise exception 'Dê um nome ao teste (de 3 a 90 letras).' using errcode = 'P0001';
  end if;
  if privado.copiloto_criterio_proibido(p_titulo) then
    raise exception 'O nome do teste não pode falar disso.' using errcode = 'P0001';
  end if;
  perform privado.conferir_questoes('pratico', p_questoes);
  if p_id is null then
    if (select count(*) from privado.avaliacoes_modelos m where m.conta_id = conta and m.apagado_em is null) >= 30 then
      raise exception 'A conta já tem 30 testes da casa. Apague um para criar outro.' using errcode = 'P0001';
    end if;
    insert into privado.avaliacoes_modelos (tipo, titulo, descricao, questoes, conta_id, publicado)
    values ('pratico', trim(p_titulo), nullif(trim(coalesce(p_descricao, '')), ''), p_questoes, conta, true)
    returning id into v_id;
  else
    update privado.avaliacoes_modelos
       set titulo = trim(p_titulo), descricao = nullif(trim(coalesce(p_descricao, '')), ''), questoes = p_questoes,
           atualizado_em = now()
     where id = p_id and conta_id = conta and apagado_em is null
    returning id into v_id;
    if v_id is null then
      raise exception 'Teste não encontrado.' using errcode = 'P0001';
    end if;
    if exists (select 1 from privado.avaliacoes_pedidas a where a.modelo_id = p_id and a.status = 'feita') then
      raise exception 'Este teste já foi feito por alguém: crie um novo em vez de mudar as questões.'
        using errcode = 'P0001';
    end if;
  end if;
  return v_id;
end
$$;

create or replace function public.avaliacao_apagar_da_casa(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_conta_ativa();
  update privado.avaliacoes_modelos set apagado_em = now()
   where id = p_id and conta_id = public.conta_atual() and apagado_em is null;
  if not found then
    raise exception 'Teste não encontrado.' using errcode = 'P0001';
  end if;
  delete from privado.avaliacoes_da_vaga v where v.modelo_id = p_id;
end
$$;

-- os testes da vaga (até 3): [{modelo_id, obrigatoria}]
create or replace function public.avaliacoes_salvar_na_vaga(p_anuncio uuid, p_itens jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
begin
  perform privado.minha_vaga_qualquer(p_anuncio);
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 3 then
    raise exception 'Escolha até 3 testes por vaga.' using errcode = 'P0001';
  end if;
  for item in select * from jsonb_array_elements(p_itens) loop
    if not privado.modelo_disponivel((item ->> 'modelo_id')::uuid, public.conta_atual()) then
      raise exception 'Este teste não está disponível.' using errcode = 'P0001';
    end if;
  end loop;
  delete from privado.avaliacoes_da_vaga v
   where v.anuncio_id = p_anuncio
     and v.modelo_id not in (select (x ->> 'modelo_id')::uuid from jsonb_array_elements(p_itens) x);
  insert into privado.avaliacoes_da_vaga (anuncio_id, modelo_id, obrigatoria)
  select p_anuncio, (x ->> 'modelo_id')::uuid, coalesce((x ->> 'obrigatoria')::boolean, false)
    from jsonb_array_elements(p_itens) x
  on conflict (anuncio_id, modelo_id) do update set obrigatoria = excluded.obrigatoria;
end
$$;

-- os testes da vaga: para quem publicou e para quem vê a vaga no ar
create or replace function public.avaliacoes_da_vaga(p_anuncio uuid)
returns table (modelo_id uuid, tipo text, titulo text, descricao text, questoes integer, obrigatoria boolean,
               da_casa boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.tipo, m.titulo, m.descricao, jsonb_array_length(m.questoes), v.obrigatoria, m.conta_id is not null
    from privado.avaliacoes_da_vaga v
    join privado.avaliacoes_modelos m on m.id = v.modelo_id
    join public.anuncios a on a.id = v.anuncio_id
   where v.anuncio_id = p_anuncio and m.apagado_em is null
     and (a.status = 'ativo' or a.autor_id = public.conta_atual())
   order by v.criado_em
$$;

-- manda um teste para quem curtiu a vaga (o aviso chega no sino e no celular)
create or replace function public.avaliacao_pedir(p_anuncio uuid, p_perfil uuid, p_modelo uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_titulo text;
  v_teste text;
  quem text;
begin
  perform privado.minha_vaga_qualquer(p_anuncio);
  if not privado.modelo_disponivel(p_modelo, public.conta_atual()) then
    raise exception 'Este teste não está disponível.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p_perfil) then
    raise exception 'Só dá para mandar o teste para quem curtiu a vaga.' using errcode = 'P0001';
  end if;
  if exists (select 1 from privado.avaliacoes_pedidas a
              where a.anuncio_id = p_anuncio and a.perfil_id = p_perfil and a.modelo_id = p_modelo) then
    raise exception 'Essa pessoa já recebeu este teste.' using errcode = 'P0001';
  end if;
  perform privado.conferir_limite('teste', 200, 'Você já mandou 200 testes hoje. Tente de novo amanhã.');
  insert into privado.avaliacoes_pedidas (anuncio_id, perfil_id, modelo_id, origem)
  values (p_anuncio, p_perfil, p_modelo, 'pedido') returning id into v_id;
  select a.titulo into v_titulo from public.anuncios a where a.id = p_anuncio;
  select m.titulo into v_teste from privado.avaliacoes_modelos m where m.id = p_modelo;
  select p.nome into quem from public.perfis p where p.id = public.conta_atual();
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'teste_pedido', p_anuncio, public.conta_atual(),
          left(coalesce(quem, 'A empresa') || ' pediu um teste para a vaga “' || v_titulo || '”: ' || v_teste
               || '. Você tem 3 dias para fazer.', 300));
  return v_id;
end
$$;

-- os testes de quem curtiu a vaga (resultado, sem as respostas)
create or replace function public.avaliacoes_resultados(p_anuncio uuid)
returns table (id uuid, perfil_id uuid, modelo_id uuid, titulo text, tipo text, status text, vencida boolean,
               pontos integer, maximo integer, por_competencia jsonb, pedida_em timestamptz, feita_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.minha_vaga_qualquer(p_anuncio);
  return query
    select a.id, a.perfil_id, a.modelo_id, m.titulo, m.tipo, a.status,
           a.status = 'pedida' and a.prazo < now(), a.pontos, a.maximo, a.por_competencia, a.pedida_em, a.feita_em
      from privado.avaliacoes_pedidas a
      join privado.avaliacoes_modelos m on m.id = a.modelo_id
     where a.anuncio_id = p_anuncio
     order by a.feita_em desc nulls last, a.pedida_em desc;
end
$$;

-- as respostas de um teste feito, questão por questão
create or replace function public.avaliacao_respostas(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a privado.avaliacoes_pedidas;
  m privado.avaliacoes_modelos;
begin
  select * into a from privado.avaliacoes_pedidas x where x.id = p_id;
  if not found then
    raise exception 'Teste não encontrado.' using errcode = 'P0001';
  end if;
  perform privado.minha_vaga_qualquer(a.anuncio_id);
  select * into m from privado.avaliacoes_modelos x where x.id = a.modelo_id;
  return jsonb_build_object(
    'titulo', m.titulo, 'tipo', m.tipo, 'status', a.status, 'pontos', a.pontos, 'maximo', a.maximo,
    'por_competencia', a.por_competencia,
    'questoes', (select jsonb_agg(jsonb_build_object(
                   'enunciado', q ->> 'enunciado', 'competencia', q ->> 'competencia',
                   'escolhida', a.respostas ->> (q ->> 'id'), 'opcoes', q -> 'opcoes'))
                   from jsonb_array_elements(m.questoes) q));
end
$$;


-- 4. Candidato --------------------------------------------------------------------------------

-- começar um teste da vaga que a pessoa curtiu (devolve o teste; se já existe, o mesmo)
create or replace function public.avaliacao_da_vaga_para_mim(p_anuncio uuid, p_modelo uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_id uuid;
begin
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from privado.avaliacoes_da_vaga v where v.anuncio_id = p_anuncio and v.modelo_id = p_modelo) then
    raise exception 'Este teste não está nesta vaga.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = eu) then
    raise exception 'Curta a vaga primeiro: o teste vai junto com a sua candidatura.' using errcode = 'P0001';
  end if;
  select a.id into v_id from privado.avaliacoes_pedidas a
   where a.anuncio_id = p_anuncio and a.perfil_id = eu and a.modelo_id = p_modelo;
  if v_id is null then
    insert into privado.avaliacoes_pedidas (anuncio_id, perfil_id, modelo_id, origem)
    values (p_anuncio, eu, p_modelo, 'vaga') returning id into v_id;
  end if;
  return v_id;
end
$$;

-- o teste para a pessoa fazer: questões e opções na ordem sorteada, sem os pontos
create or replace function public.avaliacao_para_fazer(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a privado.avaliacoes_pedidas;
  m privado.avaliacoes_modelos;
  v_ordem jsonb;
begin
  select * into a from privado.avaliacoes_pedidas x where x.id = p_id and x.perfil_id = (select auth.uid());
  if not found then
    raise exception 'Teste não encontrado.' using errcode = 'P0001';
  end if;
  select * into m from privado.avaliacoes_modelos x where x.id = a.modelo_id;
  v_ordem := a.ordem;
  if v_ordem is null then
    select jsonb_agg(jsonb_build_object('q', q ->> 'id',
                                        'o', (select jsonb_agg(o ->> 'id' order by random())
                                                from jsonb_array_elements(q -> 'opcoes') o))
                     order by case when m.tipo = 'situacoes' then 0 else random() end)
      into v_ordem
      from jsonb_array_elements(m.questoes) q;
    update privado.avaliacoes_pedidas set ordem = v_ordem where id = a.id;
  end if;
  return jsonb_build_object(
    'id', a.id, 'status', a.status, 'vencida', a.status = 'pedida' and a.prazo < now(), 'prazo', a.prazo,
    'aceite_em', a.aceite_em, 'feita_em', a.feita_em, 'anuncio_id', a.anuncio_id,
    'vaga', (select an.titulo from public.anuncios an where an.id = a.anuncio_id),
    'empresa', (select p.nome from public.anuncios an join public.perfis p on p.id = an.autor_id where an.id = a.anuncio_id),
    'tipo', m.tipo, 'titulo', m.titulo, 'descricao', m.descricao,
    'pontos', a.pontos, 'maximo', a.maximo, 'por_competencia', a.por_competencia,
    'questoes', (select jsonb_agg(jsonb_build_object(
                   'id', item ->> 'q',
                   'enunciado', q ->> 'enunciado',
                   'opcoes', (select jsonb_agg(jsonb_build_object('id', oid, 'texto', o ->> 'texto') order by n)
                                from jsonb_array_elements_text(item -> 'o') with ordinality as x(oid, n)
                                join jsonb_array_elements(q -> 'opcoes') o on o ->> 'id' = x.oid))
                   order by pos)
                   from jsonb_array_elements(v_ordem) with ordinality as y(item, pos)
                   join jsonb_array_elements(m.questoes) q on q ->> 'id' = y.item ->> 'q'));
end
$$;

create or replace function public.avaliacao_aceitar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update privado.avaliacoes_pedidas set aceite_em = coalesce(aceite_em, now())
   where id = p_id and perfil_id = (select auth.uid()) and status = 'pedida';
  if not found then
    raise exception 'Teste não encontrado.' using errcode = 'P0001';
  end if;
end
$$;

-- manda as respostas ({questao: opcao}); a correção é aqui, e quem publicou recebe o aviso
create or replace function public.avaliacao_enviar(p_id uuid, p_respostas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a privado.avaliacoes_pedidas;
  m privado.avaliacoes_modelos;
  q jsonb;
  escolhida jsonb;
  v_pontos integer := 0;
  v_comp jsonb := '{}'::jsonb;
  c text;
  pq integer;
  mq integer;
  autor uuid;
  v_titulo text;
  quem text;
begin
  select * into a from privado.avaliacoes_pedidas x where x.id = p_id and x.perfil_id = (select auth.uid()) for update;
  if not found then
    raise exception 'Teste não encontrado.' using errcode = 'P0001';
  end if;
  if a.status = 'feita' then
    raise exception 'Você já fez este teste.' using errcode = 'P0001';
  end if;
  if a.prazo < now() then
    raise exception 'O prazo deste teste acabou.' using errcode = 'P0001';
  end if;
  if a.aceite_em is null then
    raise exception 'Leia e aceite as condições do teste antes de começar.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_respostas) <> 'object' then
    raise exception 'Responda todas as questões.' using errcode = 'P0001';
  end if;
  select * into m from privado.avaliacoes_modelos x where x.id = a.modelo_id;
  for q in select * from jsonb_array_elements(m.questoes) loop
    select o into escolhida from jsonb_array_elements(q -> 'opcoes') o where o ->> 'id' = p_respostas ->> (q ->> 'id');
    if escolhida is null then
      raise exception 'Responda todas as questões.' using errcode = 'P0001';
    end if;
    pq := (escolhida ->> 'pontos')::int;
    select max((o ->> 'pontos')::int) into mq from jsonb_array_elements(q -> 'opcoes') o;
    v_pontos := v_pontos + pq;
    c := q ->> 'competencia';
    if c is not null then
      v_comp := jsonb_set(v_comp, array[c], jsonb_build_object(
        'pontos', coalesce((v_comp -> c ->> 'pontos')::int, 0) + pq,
        'maximo', coalesce((v_comp -> c ->> 'maximo')::int, 0) + mq));
    end if;
    escolhida := null;
  end loop;
  update privado.avaliacoes_pedidas
     set status = 'feita', feita_em = now(), pontos = v_pontos, maximo = privado.maximo_do_teste(m.questoes),
         por_competencia = nullif(v_comp, '{}'::jsonb),
         respostas = (select jsonb_object_agg(q2 ->> 'id', p_respostas ->> (q2 ->> 'id'))
                        from jsonb_array_elements(m.questoes) q2)
   where id = a.id;
  select an.autor_id, an.titulo into autor, v_titulo from public.anuncios an where an.id = a.anuncio_id;
  select p.nome into quem from public.perfis p where p.id = a.perfil_id;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (autor, 'teste_feito', a.anuncio_id, a.perfil_id,
          left(coalesce(privado.nome_curto(quem), 'Um candidato') || ' fez o teste “' || m.titulo || '” da vaga “'
               || v_titulo || '”.', 300));
  return jsonb_build_object('pontos', v_pontos, 'maximo', privado.maximo_do_teste(m.questoes),
                            'por_competencia', nullif(v_comp, '{}'::jsonb));
end
$$;

-- os meus testes (pedidos, feitos e vencidos)
drop function if exists public.minhas_avaliacoes();
create function public.minhas_avaliacoes()
returns table (id uuid, anuncio_id uuid, modelo_id uuid, vaga text, empresa text, titulo text, tipo text, status text, vencida boolean,
               prazo timestamptz, pontos integer, maximo integer, feita_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.anuncio_id, a.modelo_id, an.titulo, p.nome, m.titulo, m.tipo, a.status, a.status = 'pedida' and a.prazo < now(),
         a.prazo, a.pontos, a.maximo, a.feita_em
    from privado.avaliacoes_pedidas a
    join privado.avaliacoes_modelos m on m.id = a.modelo_id
    join public.anuncios an on an.id = a.anuncio_id
    join public.perfis p on p.id = an.autor_id
   where a.perfil_id = (select auth.uid())
   order by a.status = 'feita', a.pedida_em desc
$$;

revoke execute on function public.avaliacoes_biblioteca(), public.avaliacao_modelo(uuid),
  public.avaliacao_salvar_da_casa(uuid, text, text, jsonb), public.avaliacao_apagar_da_casa(uuid),
  public.avaliacoes_salvar_na_vaga(uuid, jsonb), public.avaliacao_pedir(uuid, uuid, uuid),
  public.avaliacoes_resultados(uuid), public.avaliacao_respostas(uuid), public.avaliacao_da_vaga_para_mim(uuid, uuid),
  public.avaliacao_para_fazer(uuid), public.avaliacao_aceitar(uuid), public.avaliacao_enviar(uuid, jsonb),
  public.minhas_avaliacoes() from public, anon;
grant execute on function public.avaliacoes_biblioteca(), public.avaliacao_modelo(uuid),
  public.avaliacao_salvar_da_casa(uuid, text, text, jsonb), public.avaliacao_apagar_da_casa(uuid),
  public.avaliacoes_salvar_na_vaga(uuid, jsonb), public.avaliacao_pedir(uuid, uuid, uuid),
  public.avaliacoes_resultados(uuid), public.avaliacao_respostas(uuid), public.avaliacao_da_vaga_para_mim(uuid, uuid),
  public.avaliacao_para_fazer(uuid), public.avaliacao_aceitar(uuid), public.avaliacao_enviar(uuid, jsonb),
  public.minhas_avaliacoes() to authenticated;
revoke execute on function public.avaliacoes_da_vaga(uuid) from public;
grant execute on function public.avaliacoes_da_vaga(uuid) to anon, authenticated;
revoke execute on function privado.conferir_questoes(text, jsonb), privado.modelo_disponivel(uuid, uuid),
  privado.maximo_do_teste(jsonb), privado.minha_vaga_qualquer(uuid) from public, anon, authenticated;

alter table privado.limites_uso drop constraint if exists limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check check (acao = any (array[
  'anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match', 'ia_indicacao',
  'mensagem', 'seguir', 'recomendacao', 'etapa', 'contratacao', 'ia_resumo', 'convite', 'talento',
  'convite_candidato', 'convite_equipe', 'conexao', 'recado', 'recado_edicao', 'copiloto', 'teste']));


-- 5. Admin e limpeza ------------------------------------------------------------------------------

create or replace function public.admin_avaliacoes_modelos()
returns table (id uuid, tipo text, area text, titulo text, publicado boolean, questoes integer, vagas integer,
               pedidas integer, feitas integer, media numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.tipo, m.area, m.titulo, m.publicado, jsonb_array_length(m.questoes),
         (select count(*)::int from privado.avaliacoes_da_vaga v where v.modelo_id = m.id),
         (select count(*)::int from privado.avaliacoes_pedidas a where a.modelo_id = m.id),
         (select count(*)::int from privado.avaliacoes_pedidas a where a.modelo_id = m.id and a.status = 'feita'),
         (select round(avg(a.pontos::numeric / nullif(a.maximo, 0)) * 100)
            from privado.avaliacoes_pedidas a where a.modelo_id = m.id and a.status = 'feita')
    from privado.avaliacoes_modelos m
   where m.conta_id is null
   order by m.tipo, m.titulo
$$;

create or replace function public.admin_avaliacao_modelo(p_modelo uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'tipo', m.tipo, 'area', m.area, 'titulo', m.titulo, 'descricao', m.descricao,
                            'questoes', m.questoes, 'publicado', m.publicado)
    from privado.avaliacoes_modelos m where m.id = p_modelo and m.conta_id is null
$$;

create or replace function public.admin_publicar_avaliacao(p_modelo uuid, p_publicado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update privado.avaliacoes_modelos set publicado = p_publicado, atualizado_em = now()
   where id = p_modelo and conta_id is null;
  if not found then
    raise exception 'Teste não encontrado.' using errcode = 'P0001';
  end if;
end
$$;

-- as contas que mais usam (testes da casa e pedidos em 30 dias)
create or replace function public.admin_avaliacoes_uso()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'da_casa', (select count(*) from privado.avaliacoes_modelos m where m.conta_id is not null and m.apagado_em is null),
    'vagas', (select count(distinct v.anuncio_id) from privado.avaliacoes_da_vaga v),
    'pedidas_30d', (select count(*) from privado.avaliacoes_pedidas a where a.pedida_em > now() - interval '30 days'),
    'feitas_30d', (select count(*) from privado.avaliacoes_pedidas a
                    where a.status = 'feita' and a.feita_em > now() - interval '30 days'))
$$;

revoke execute on function public.admin_avaliacoes_modelos(), public.admin_avaliacao_modelo(uuid),
  public.admin_publicar_avaliacao(uuid, boolean), public.admin_avaliacoes_uso() from public, anon, authenticated;
grant execute on function public.admin_avaliacoes_modelos(), public.admin_avaliacao_modelo(uuid),
  public.admin_publicar_avaliacao(uuid, boolean), public.admin_avaliacoes_uso() to service_role;

-- os resultados saem 12 meses depois que a vaga sai do ar (encerrada, expirada ou removida)
create or replace function public.servidor_limpar_avaliacoes(p_chave text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform privado.exigir_servidor(p_chave);
  delete from privado.avaliacoes_pedidas a
   using public.anuncios an
   where an.id = a.anuncio_id and an.status <> 'ativo'
     and greatest(an.atualizado_em, an.expira_em) < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function public.servidor_limpar_avaliacoes(text) from public;
grant execute on function public.servidor_limpar_avaliacoes(text) to anon, authenticated, service_role;


-- 6. Os testes da Publike (rascunho: o admin publica depois de revisar) -----------------------------
insert into privado.avaliacoes_modelos (id, tipo, area, titulo, descricao, questoes, publicado)
values ('a7a10000-0000-4000-8000-000000000001', 'pratico', 'caixa', 'Teste prático Publike: Caixa', 'Troco, conferência, pagamento e fechamento do caixa.', '[{"id": "q1", "enunciado": "Uma compra deu R$ 37,50 e o cliente pagou com uma nota de R$ 50. Qual é o troco?", "opcoes": [{"id": "a", "texto": "R$ 12,50", "pontos": 1}, {"id": "b", "texto": "R$ 13,50", "pontos": 0}, {"id": "c", "texto": "R$ 12,00", "pontos": 0}, {"id": "d", "texto": "R$ 22,50", "pontos": 0}]}, {"id": "q2", "enunciado": "Antes de começar a atender no caixa, o que você faz primeiro?", "opcoes": [{"id": "a", "texto": "Confere o fundo de troco com o responsável", "pontos": 1}, {"id": "b", "texto": "Começa a atender quem está na fila", "pontos": 0}, {"id": "c", "texto": "Guarda o troco no bolso para não perder", "pontos": 0}, {"id": "d", "texto": "Desliga o sistema para reiniciar", "pontos": 0}]}, {"id": "q3", "enunciado": "O cliente diz que já fez o Pix. O que você confere?", "opcoes": [{"id": "a", "texto": "Se o pagamento entrou no sistema ou na maquininha da loja", "pontos": 1}, {"id": "b", "texto": "Só a tela do celular do cliente", "pontos": 0}, {"id": "c", "texto": "Nada: o cliente disse que pagou", "pontos": 0}, {"id": "d", "texto": "Pede para ele mandar o comprovante amanhã", "pontos": 0}]}, {"id": "q4", "enunciado": "O sistema caiu no meio de uma venda. O que você faz?", "opcoes": [{"id": "a", "texto": "Avisa o líder e segue o procedimento da loja", "pontos": 1}, {"id": "b", "texto": "Fecha o caixa e vai embora", "pontos": 0}, {"id": "c", "texto": "Cobra um valor aproximado", "pontos": 0}, {"id": "d", "texto": "Pede para o cliente voltar outro dia", "pontos": 0}]}, {"id": "q5", "enunciado": "O cliente leva 3 itens de R$ 4,90. Qual é o total?", "opcoes": [{"id": "a", "texto": "R$ 14,70", "pontos": 1}, {"id": "b", "texto": "R$ 13,70", "pontos": 0}, {"id": "c", "texto": "R$ 14,90", "pontos": 0}, {"id": "d", "texto": "R$ 12,70", "pontos": 0}]}, {"id": "q6", "enunciado": "No fechamento, sobraram R$ 10 a mais no caixa. O que você faz?", "opcoes": [{"id": "a", "texto": "Registra a diferença e avisa o responsável", "pontos": 1}, {"id": "b", "texto": "Guarda a sobra para cobrir uma falta futura", "pontos": 0}, {"id": "c", "texto": "Não fala nada", "pontos": 0}, {"id": "d", "texto": "Dá de troco para o próximo cliente", "pontos": 0}]}, {"id": "q7", "enunciado": "Um produto de R$ 80 está com 10% de desconto. Quanto o cliente paga?", "opcoes": [{"id": "a", "texto": "R$ 72,00", "pontos": 1}, {"id": "b", "texto": "R$ 70,00", "pontos": 0}, {"id": "c", "texto": "R$ 78,00", "pontos": 0}, {"id": "d", "texto": "R$ 8,00", "pontos": 0}]}, {"id": "q8", "enunciado": "Você recebe uma nota que parece falsa. O que faz?", "opcoes": [{"id": "a", "texto": "Recusa com educação e chama o responsável", "pontos": 1}, {"id": "b", "texto": "Aceita para não perder a venda", "pontos": 0}, {"id": "c", "texto": "Rasga a nota na frente do cliente", "pontos": 0}, {"id": "d", "texto": "Acusa o cliente em voz alta", "pontos": 0}]}, {"id": "q9", "enunciado": "Para que serve o cupom fiscal?", "opcoes": [{"id": "a", "texto": "Registrar a venda e dar ao cliente a prova da compra", "pontos": 1}, {"id": "b", "texto": "Só para enfeitar a sacola", "pontos": 0}, {"id": "c", "texto": "Só para empresa grande", "pontos": 0}, {"id": "d", "texto": "Para nada", "pontos": 0}]}, {"id": "q10", "enunciado": "Com fila grande, um cliente pede para trocar um produto no caixa. O que você faz?", "opcoes": [{"id": "a", "texto": "Explica com educação onde é feita a troca ou chama quem cuida disso", "pontos": 1}, {"id": "b", "texto": "Finge que não ouviu", "pontos": 0}, {"id": "c", "texto": "Discute com o cliente", "pontos": 0}, {"id": "d", "texto": "Faz a troca sem registrar", "pontos": 0}]}]'::jsonb, false)
on conflict (id) do update
  set tipo = excluded.tipo, area = excluded.area, titulo = excluded.titulo, descricao = excluded.descricao,
      questoes = excluded.questoes, atualizado_em = now();

insert into privado.avaliacoes_modelos (id, tipo, area, titulo, descricao, questoes, publicado)
values ('a7a10000-0000-4000-8000-000000000002', 'pratico', 'atendimento', 'Teste prático Publike: Atendimento ao cliente', 'Como receber, ouvir, resolver e encerrar um atendimento.', '[{"id": "q1", "enunciado": "O cliente pergunta algo que você não sabe. O que faz?", "opcoes": [{"id": "a", "texto": "Diz que vai confirmar e busca a resposta com quem sabe", "pontos": 1}, {"id": "b", "texto": "Inventa uma resposta para não ficar mal", "pontos": 0}, {"id": "c", "texto": "Diz que não é problema seu", "pontos": 0}, {"id": "d", "texto": "Muda de assunto", "pontos": 0}]}, {"id": "q2", "enunciado": "O que você faz primeiro quando um cliente chega?", "opcoes": [{"id": "a", "texto": "Cumprimenta e pergunta como pode ajudar", "pontos": 1}, {"id": "b", "texto": "Espera ele falar primeiro", "pontos": 0}, {"id": "c", "texto": "Termina de mexer no celular", "pontos": 0}, {"id": "d", "texto": "Já fala o preço da promoção", "pontos": 0}]}, {"id": "q3", "enunciado": "Um cliente reclama em voz alta. O que você faz?", "opcoes": [{"id": "a", "texto": "Ouve com calma, sem interromper, e busca uma solução", "pontos": 1}, {"id": "b", "texto": "Responde no mesmo tom", "pontos": 0}, {"id": "c", "texto": "Sai de perto", "pontos": 0}, {"id": "d", "texto": "Ri para aliviar o clima", "pontos": 0}]}, {"id": "q4", "enunciado": "Você combinou de retornar a ligação do cliente hoje. O que faz?", "opcoes": [{"id": "a", "texto": "Retorna no prazo, mesmo que seja para dizer que ainda está vendo", "pontos": 1}, {"id": "b", "texto": "Retorna quando der", "pontos": 0}, {"id": "c", "texto": "Espera ele ligar de novo", "pontos": 0}, {"id": "d", "texto": "Não retorna se não tiver novidade", "pontos": 0}]}, {"id": "q5", "enunciado": "No WhatsApp da empresa, como você responde?", "opcoes": [{"id": "a", "texto": "Com educação, frases claras e sem gírias", "pontos": 1}, {"id": "b", "texto": "Só com áudios longos", "pontos": 0}, {"id": "c", "texto": "Só com emojis", "pontos": 0}, {"id": "d", "texto": "Pelo seu número pessoal", "pontos": 0}]}, {"id": "q6", "enunciado": "Você atende um cliente e outro chega esperando. O que faz?", "opcoes": [{"id": "a", "texto": "Avisa ao outro que já vai atendê-lo", "pontos": 1}, {"id": "b", "texto": "Ignora até terminar", "pontos": 0}, {"id": "c", "texto": "Atende os dois ao mesmo tempo sem ouvir nenhum", "pontos": 0}, {"id": "d", "texto": "Pede para ele voltar mais tarde", "pontos": 0}]}, {"id": "q7", "enunciado": "O que fazer com o CPF e o telefone de um cliente?", "opcoes": [{"id": "a", "texto": "Usar só para o atendimento e não passar para ninguém de fora", "pontos": 1}, {"id": "b", "texto": "Guardar no seu celular", "pontos": 0}, {"id": "c", "texto": "Mandar para o grupo da equipe", "pontos": 0}, {"id": "d", "texto": "Usar para vender outras coisas por conta própria", "pontos": 0}]}, {"id": "q8", "enunciado": "O cliente pede algo que a empresa não faz. O que você responde?", "opcoes": [{"id": "a", "texto": "Explica com educação e, se der, indica uma alternativa", "pontos": 1}, {"id": "b", "texto": "Promete fazer mesmo assim", "pontos": 0}, {"id": "c", "texto": "Diz um \"não\" seco e vira as costas", "pontos": 0}, {"id": "d", "texto": "Não responde", "pontos": 0}]}, {"id": "q9", "enunciado": "Como você encerra um atendimento?", "opcoes": [{"id": "a", "texto": "Confirma se resolveu e agradece", "pontos": 1}, {"id": "b", "texto": "Sai sem falar nada", "pontos": 0}, {"id": "c", "texto": "Pede uma gorjeta", "pontos": 0}, {"id": "d", "texto": "Comenta como o dia está cansativo", "pontos": 0}]}, {"id": "q10", "enunciado": "Um erro seu prejudicou o cliente. O que faz?", "opcoes": [{"id": "a", "texto": "Reconhece o erro, pede desculpas e corrige", "pontos": 1}, {"id": "b", "texto": "Diz que foi um colega", "pontos": 0}, {"id": "c", "texto": "Nega que aconteceu", "pontos": 0}, {"id": "d", "texto": "Esconde e torce para ele não perceber", "pontos": 0}]}]'::jsonb, false)
on conflict (id) do update
  set tipo = excluded.tipo, area = excluded.area, titulo = excluded.titulo, descricao = excluded.descricao,
      questoes = excluded.questoes, atualizado_em = now();

insert into privado.avaliacoes_modelos (id, tipo, area, titulo, descricao, questoes, publicado)
values ('a7a10000-0000-4000-8000-000000000003', 'pratico', 'vendas', 'Teste prático Publike: Vendas', 'Entender o cliente, contas da venda e regras do consumidor.', '[{"id": "q1", "enunciado": "Antes de oferecer um produto, o que você faz?", "opcoes": [{"id": "a", "texto": "Pergunta o que o cliente precisa", "pontos": 1}, {"id": "b", "texto": "Oferece o mais caro", "pontos": 0}, {"id": "c", "texto": "Fala de você", "pontos": 0}, {"id": "d", "texto": "Mostra todos os produtos da loja", "pontos": 0}]}, {"id": "q2", "enunciado": "Um produto de R$ 120 sai em 3 vezes sem juros. Quanto é cada parcela?", "opcoes": [{"id": "a", "texto": "R$ 40,00", "pontos": 1}, {"id": "b", "texto": "R$ 30,00", "pontos": 0}, {"id": "c", "texto": "R$ 36,00", "pontos": 0}, {"id": "d", "texto": "R$ 45,00", "pontos": 0}]}, {"id": "q3", "enunciado": "O cliente achou caro. O que você faz?", "opcoes": [{"id": "a", "texto": "Mostra os benefícios e as opções de pagamento ou de produto", "pontos": 1}, {"id": "b", "texto": "Baixa o preço sem autorização", "pontos": 0}, {"id": "c", "texto": "Diz que ele não pode pagar", "pontos": 0}, {"id": "d", "texto": "Encerra o atendimento", "pontos": 0}]}, {"id": "q4", "enunciado": "Obrigar o cliente a levar outro produto junto (venda casada) é:", "opcoes": [{"id": "a", "texto": "Proibido pelo Código de Defesa do Consumidor", "pontos": 1}, {"id": "b", "texto": "Permitido em qualquer loja", "pontos": 0}, {"id": "c", "texto": "Permitido só em promoção", "pontos": 0}, {"id": "d", "texto": "Permitido só no fim do mês", "pontos": 0}]}, {"id": "q5", "enunciado": "Sua comissão é de 5%. Numa venda de R$ 2.000, quanto você ganha?", "opcoes": [{"id": "a", "texto": "R$ 100", "pontos": 1}, {"id": "b", "texto": "R$ 50", "pontos": 0}, {"id": "c", "texto": "R$ 200", "pontos": 0}, {"id": "d", "texto": "R$ 10", "pontos": 0}]}, {"id": "q6", "enunciado": "Para que serve o pós-venda?", "opcoes": [{"id": "a", "texto": "Saber se o cliente ficou satisfeito e manter o contato", "pontos": 1}, {"id": "b", "texto": "Cobrar o cliente", "pontos": 0}, {"id": "c", "texto": "Nada: a venda acabou", "pontos": 0}, {"id": "d", "texto": "Vender o mesmo produto de novo na hora", "pontos": 0}]}, {"id": "q7", "enunciado": "A meta é 40 vendas e você fez 30. Quanto falta da meta?", "opcoes": [{"id": "a", "texto": "25%", "pontos": 1}, {"id": "b", "texto": "10%", "pontos": 0}, {"id": "c", "texto": "30%", "pontos": 0}, {"id": "d", "texto": "75%", "pontos": 0}]}, {"id": "q8", "enunciado": "O cliente quer um produto que acabou. O que você faz?", "opcoes": [{"id": "a", "texto": "Vê o prazo de chegada ou oferece um parecido", "pontos": 1}, {"id": "b", "texto": "Diz que tem para não perder a venda", "pontos": 0}, {"id": "c", "texto": "Inventa um prazo", "pontos": 0}, {"id": "d", "texto": "Diz que não sabe e encerra", "pontos": 0}]}, {"id": "q9", "enunciado": "Na compra pela internet, quantos dias o cliente tem para desistir (direito de arrependimento)?", "opcoes": [{"id": "a", "texto": "7 dias", "pontos": 1}, {"id": "b", "texto": "30 dias", "pontos": 0}, {"id": "c", "texto": "1 dia", "pontos": 0}, {"id": "d", "texto": "Ele não tem esse direito", "pontos": 0}]}, {"id": "q10", "enunciado": "Sobre o produto que você vende, o certo é:", "opcoes": [{"id": "a", "texto": "Conhecer bem para explicar com segurança", "pontos": 1}, {"id": "b", "texto": "Saber só o preço", "pontos": 0}, {"id": "c", "texto": "Ler a caixa junto com o cliente", "pontos": 0}, {"id": "d", "texto": "Perguntar ao cliente como funciona", "pontos": 0}]}]'::jsonb, false)
on conflict (id) do update
  set tipo = excluded.tipo, area = excluded.area, titulo = excluded.titulo, descricao = excluded.descricao,
      questoes = excluded.questoes, atualizado_em = now();

insert into privado.avaliacoes_modelos (id, tipo, area, titulo, descricao, questoes, publicado)
values ('a7a10000-0000-4000-8000-000000000004', 'pratico', 'cozinha', 'Teste prático Publike: Cozinha', 'Higiene, conservação, medidas e segurança na cozinha.', '[{"id": "q1", "enunciado": "Quando lavar as mãos na cozinha?", "opcoes": [{"id": "a", "texto": "Antes de começar, ao trocar de tarefa e depois de ir ao banheiro", "pontos": 1}, {"id": "b", "texto": "Só no começo do turno", "pontos": 0}, {"id": "c", "texto": "Só no fim do turno", "pontos": 0}, {"id": "d", "texto": "Só quando estiverem muito sujas", "pontos": 0}]}, {"id": "q2", "enunciado": "Carne crua e salada:", "opcoes": [{"id": "a", "texto": "Usam tábuas e facas separadas", "pontos": 1}, {"id": "b", "texto": "Podem usar a mesma tábua sem lavar", "pontos": 0}, {"id": "c", "texto": "Tanto faz", "pontos": 0}, {"id": "d", "texto": "Usam a mesma faca, só passando um pano", "pontos": 0}]}, {"id": "q3", "enunciado": "Uma carne descongelou. O certo é:", "opcoes": [{"id": "a", "texto": "Não congelar de novo crua", "pontos": 1}, {"id": "b", "texto": "Congelar de novo quantas vezes quiser", "pontos": 0}, {"id": "c", "texto": "Deixar na pia até o dia seguinte", "pontos": 0}, {"id": "d", "texto": "Voltar ao freezer sem problema", "pontos": 0}]}, {"id": "q4", "enunciado": "Na despensa, qual produto sai primeiro?", "opcoes": [{"id": "a", "texto": "O que vence primeiro", "pontos": 1}, {"id": "b", "texto": "O que chegou por último", "pontos": 0}, {"id": "c", "texto": "Qualquer um", "pontos": 0}, {"id": "d", "texto": "O de embalagem mais bonita", "pontos": 0}]}, {"id": "q5", "enunciado": "Qual a temperatura certa da geladeira para alimentos?", "opcoes": [{"id": "a", "texto": "Até 5 °C", "pontos": 1}, {"id": "b", "texto": "Cerca de 15 °C", "pontos": 0}, {"id": "c", "texto": "Cerca de 25 °C", "pontos": 0}, {"id": "d", "texto": "Tanto faz, se estiver ligada", "pontos": 0}]}, {"id": "q6", "enunciado": "Uma receita para 4 pessoas usa 300 g de arroz. Para 12 pessoas, quanto usar?", "opcoes": [{"id": "a", "texto": "900 g", "pontos": 1}, {"id": "b", "texto": "600 g", "pontos": 0}, {"id": "c", "texto": "1.200 g", "pontos": 0}, {"id": "d", "texto": "750 g", "pontos": 0}]}, {"id": "q7", "enunciado": "O cabelo na cozinha deve ficar:", "opcoes": [{"id": "a", "texto": "Preso e com touca", "pontos": 1}, {"id": "b", "texto": "Solto", "pontos": 0}, {"id": "c", "texto": "Só com boné", "pontos": 0}, {"id": "d", "texto": "Do jeito que preferir", "pontos": 0}]}, {"id": "q8", "enunciado": "Onde guardar o produto de limpeza?", "opcoes": [{"id": "a", "texto": "Longe dos alimentos e com rótulo", "pontos": 1}, {"id": "b", "texto": "Na despensa, junto com os alimentos", "pontos": 0}, {"id": "c", "texto": "Numa garrafa de refrigerante sem rótulo", "pontos": 0}, {"id": "d", "texto": "Em cima do fogão", "pontos": 0}]}, {"id": "q9", "enunciado": "O óleo da fritura está escuro e com cheiro forte. O que fazer?", "opcoes": [{"id": "a", "texto": "Trocar o óleo", "pontos": 1}, {"id": "b", "texto": "Pôr mais óleo por cima", "pontos": 0}, {"id": "c", "texto": "Completar com óleo novo", "pontos": 0}, {"id": "d", "texto": "Coar e usar até acabar", "pontos": 0}]}, {"id": "q10", "enunciado": "Você cortou o dedo no preparo. O que faz?", "opcoes": [{"id": "a", "texto": "Para, limpa, protege com curativo e luva e avisa o responsável", "pontos": 1}, {"id": "b", "texto": "Continua para não atrasar", "pontos": 0}, {"id": "c", "texto": "Lambe o dedo e segue", "pontos": 0}, {"id": "d", "texto": "Esconde para ninguém ver", "pontos": 0}]}]'::jsonb, false)
on conflict (id) do update
  set tipo = excluded.tipo, area = excluded.area, titulo = excluded.titulo, descricao = excluded.descricao,
      questoes = excluded.questoes, atualizado_em = now();

insert into privado.avaliacoes_modelos (id, tipo, area, titulo, descricao, questoes, publicado)
values ('a7a10000-0000-4000-8000-000000000005', 'pratico', 'estoque', 'Teste prático Publike: Estoque e logística', 'Recebimento, armazenagem, contagem e segurança.', '[{"id": "q1", "enunciado": "Ao receber mercadoria, o que você faz?", "opcoes": [{"id": "a", "texto": "Confere produto e quantidade com a nota fiscal", "pontos": 1}, {"id": "b", "texto": "Assina sem olhar", "pontos": 0}, {"id": "c", "texto": "Guarda e confere no mês que vem", "pontos": 0}, {"id": "d", "texto": "Devolve tudo para conferir depois", "pontos": 0}]}, {"id": "q2", "enunciado": "Na prateleira, onde ficam as caixas pesadas?", "opcoes": [{"id": "a", "texto": "Embaixo; as leves em cima", "pontos": 1}, {"id": "b", "texto": "Em cima", "pontos": 0}, {"id": "c", "texto": "Tanto faz", "pontos": 0}, {"id": "d", "texto": "No chão do corredor", "pontos": 0}]}, {"id": "q3", "enunciado": "Como levantar uma caixa pesada do chão?", "opcoes": [{"id": "a", "texto": "Dobrando os joelhos, com as costas retas", "pontos": 1}, {"id": "b", "texto": "Curvando as costas", "pontos": 0}, {"id": "c", "texto": "Puxando de lado", "pontos": 0}, {"id": "d", "texto": "Jogando para o alto", "pontos": 0}]}, {"id": "q4", "enunciado": "Para que serve o inventário?", "opcoes": [{"id": "a", "texto": "Conferir se o estoque real bate com o do sistema", "pontos": 1}, {"id": "b", "texto": "Vender mais", "pontos": 0}, {"id": "c", "texto": "Limpar o depósito", "pontos": 0}, {"id": "d", "texto": "Para nada", "pontos": 0}]}, {"id": "q5", "enunciado": "Um produto chegou avariado. O que você faz?", "opcoes": [{"id": "a", "texto": "Registra, separa e avisa o responsável", "pontos": 1}, {"id": "b", "texto": "Guarda junto com os bons", "pontos": 0}, {"id": "c", "texto": "Joga fora sem registrar", "pontos": 0}, {"id": "d", "texto": "Leva para casa", "pontos": 0}]}, {"id": "q6", "enunciado": "São 12 caixas com 24 unidades cada. Quantas unidades ao todo?", "opcoes": [{"id": "a", "texto": "288", "pontos": 1}, {"id": "b", "texto": "248", "pontos": 0}, {"id": "c", "texto": "300", "pontos": 0}, {"id": "d", "texto": "144", "pontos": 0}]}, {"id": "q7", "enunciado": "Quando usar o EPI (equipamento de proteção)?", "opcoes": [{"id": "a", "texto": "Sempre que a tarefa pede", "pontos": 1}, {"id": "b", "texto": "Só quando o chefe está olhando", "pontos": 0}, {"id": "c", "texto": "Nunca", "pontos": 0}, {"id": "d", "texto": "Só no primeiro dia", "pontos": 0}]}, {"id": "q8", "enunciado": "Na separação de um pedido, o que conferir?", "opcoes": [{"id": "a", "texto": "O código e a quantidade de cada item", "pontos": 1}, {"id": "b", "texto": "Só o nome parecido", "pontos": 0}, {"id": "c", "texto": "Pegar um a mais por garantia", "pontos": 0}, {"id": "d", "texto": "Só a cor da embalagem", "pontos": 0}]}, {"id": "q9", "enunciado": "Há caixas no chão do corredor. O que fazer?", "opcoes": [{"id": "a", "texto": "Tirar dali: atrapalha a passagem e é risco de acidente", "pontos": 1}, {"id": "b", "texto": "Deixar, alguém tira depois", "pontos": 0}, {"id": "c", "texto": "Pôr mais caixas", "pontos": 0}, {"id": "d", "texto": "Tanto faz", "pontos": 0}]}, {"id": "q10", "enunciado": "O endereço no estoque (rua, prateleira e nível) serve para:", "opcoes": [{"id": "a", "texto": "Achar e guardar cada produto no lugar certo", "pontos": 1}, {"id": "b", "texto": "O correio entregar", "pontos": 0}, {"id": "c", "texto": "Nada", "pontos": 0}, {"id": "d", "texto": "Enfeitar o depósito", "pontos": 0}]}]'::jsonb, false)
on conflict (id) do update
  set tipo = excluded.tipo, area = excluded.area, titulo = excluded.titulo, descricao = excluded.descricao,
      questoes = excluded.questoes, atualizado_em = now();

insert into privado.avaliacoes_modelos (id, tipo, area, titulo, descricao, questoes, publicado)
values ('a7a10000-0000-4000-8000-000000000006', 'pratico', 'administrativo', 'Teste prático Publike: Administrativo', 'Documentos, contas, agenda e cuidado com dados.', '[{"id": "q1", "enunciado": "Onde guardar um arquivo com dados de clientes?", "opcoes": [{"id": "a", "texto": "Num lugar que só quem precisa acessa", "pontos": 1}, {"id": "b", "texto": "No grupo da equipe", "pontos": 0}, {"id": "c", "texto": "Impresso, em cima da mesa", "pontos": 0}, {"id": "d", "texto": "Numa rede social", "pontos": 0}]}, {"id": "q2", "enunciado": "Como deve ser um e-mail para um cliente?", "opcoes": [{"id": "a", "texto": "Assunto claro, cumprimento, texto objetivo e assinatura", "pontos": 1}, {"id": "b", "texto": "Sem assunto", "pontos": 0}, {"id": "c", "texto": "Todo em letras maiúsculas", "pontos": 0}, {"id": "d", "texto": "Só com emojis", "pontos": 0}]}, {"id": "q3", "enunciado": "A nota fiscal chegou com o valor errado. O que você faz?", "opcoes": [{"id": "a", "texto": "Avisa o fornecedor e o responsável antes de pagar", "pontos": 1}, {"id": "b", "texto": "Paga e resolve depois", "pontos": 0}, {"id": "c", "texto": "Rasga a nota", "pontos": 0}, {"id": "d", "texto": "Ignora", "pontos": 0}]}, {"id": "q4", "enunciado": "Um documento vai atrasar. O que você faz?", "opcoes": [{"id": "a", "texto": "Avisa antes e diz a nova data", "pontos": 1}, {"id": "b", "texto": "Espera cobrarem", "pontos": 0}, {"id": "c", "texto": "Entrega incompleto sem avisar", "pontos": 0}, {"id": "d", "texto": "Some até terminar", "pontos": 0}]}, {"id": "q5", "enunciado": "Uma conta de R$ 1.200 é dividida igualmente por 4 setores. Quanto cada um paga?", "opcoes": [{"id": "a", "texto": "R$ 300", "pontos": 1}, {"id": "b", "texto": "R$ 400", "pontos": 0}, {"id": "c", "texto": "R$ 250", "pontos": 0}, {"id": "d", "texto": "R$ 1.200", "pontos": 0}]}, {"id": "q6", "enunciado": "Na agenda do chefe, o que você faz?", "opcoes": [{"id": "a", "texto": "Confirma os horários e avisa quando há conflito", "pontos": 1}, {"id": "b", "texto": "Marca um compromisso por cima do outro", "pontos": 0}, {"id": "c", "texto": "Deixa para ele ver sozinho", "pontos": 0}, {"id": "d", "texto": "Marca tudo no mesmo horário", "pontos": 0}]}, {"id": "q7", "enunciado": "Como atender o telefone da empresa?", "opcoes": [{"id": "a", "texto": "Diz o nome da empresa e o seu, e pergunta como ajudar", "pontos": 1}, {"id": "b", "texto": "Só \"alô\"", "pontos": 0}, {"id": "c", "texto": "Deixa tocar", "pontos": 0}, {"id": "d", "texto": "Passa a ligação sem perguntar quem é", "pontos": 0}]}, {"id": "q8", "enunciado": "Na planilha de contas a pagar, o que lançar?", "opcoes": [{"id": "a", "texto": "Data, valor, fornecedor e vencimento", "pontos": 1}, {"id": "b", "texto": "Só o valor", "pontos": 0}, {"id": "c", "texto": "Só o nome do fornecedor", "pontos": 0}, {"id": "d", "texto": "Nada: basta guardar a nota", "pontos": 0}]}, {"id": "q9", "enunciado": "A senha do sistema da empresa:", "opcoes": [{"id": "a", "texto": "Não se passa para ninguém", "pontos": 1}, {"id": "b", "texto": "Fica anotada no monitor", "pontos": 0}, {"id": "c", "texto": "Pode passar para um colega", "pontos": 0}, {"id": "d", "texto": "Pode ficar no grupo da equipe", "pontos": 0}]}, {"id": "q10", "enunciado": "Numa reunião, o que anotar?", "opcoes": [{"id": "a", "texto": "O que foi decidido, quem faz e o prazo", "pontos": 1}, {"id": "b", "texto": "Nada", "pontos": 0}, {"id": "c", "texto": "Só a hora que começou", "pontos": 0}, {"id": "d", "texto": "Só quem estava presente", "pontos": 0}]}]'::jsonb, false)
on conflict (id) do update
  set tipo = excluded.tipo, area = excluded.area, titulo = excluded.titulo, descricao = excluded.descricao,
      questoes = excluded.questoes, atualizado_em = now();

insert into privado.avaliacoes_modelos (id, tipo, area, titulo, descricao, questoes, publicado)
values ('a7a10000-0000-4000-8000-000000000007', 'pratico', 'informatica', 'Teste prático Publike: Informática básica', 'Excel, Word, atalhos e segurança no computador.', '[{"id": "q1", "enunciado": "No Excel, qual fórmula soma de A1 até A10?", "opcoes": [{"id": "a", "texto": "=SOMA(A1:A10)", "pontos": 1}, {"id": "b", "texto": "=A1+A10", "pontos": 0}, {"id": "c", "texto": "SOMA A1-A10", "pontos": 0}, {"id": "d", "texto": "=TOTAL(A1;A10)", "pontos": 0}]}, {"id": "q2", "enunciado": "Qual atalho copia?", "opcoes": [{"id": "a", "texto": "Ctrl + C", "pontos": 1}, {"id": "b", "texto": "Ctrl + V", "pontos": 0}, {"id": "c", "texto": "Ctrl + X", "pontos": 0}, {"id": "d", "texto": "Ctrl + Z", "pontos": 0}]}, {"id": "q3", "enunciado": "Qual atalho desfaz a última ação?", "opcoes": [{"id": "a", "texto": "Ctrl + Z", "pontos": 1}, {"id": "b", "texto": "Ctrl + Y", "pontos": 0}, {"id": "c", "texto": "Ctrl + P", "pontos": 0}, {"id": "d", "texto": "Ctrl + S", "pontos": 0}]}, {"id": "q4", "enunciado": "Como salvar um documento do Word em PDF?", "opcoes": [{"id": "a", "texto": "Arquivo > Salvar como e escolher PDF", "pontos": 1}, {"id": "b", "texto": "Imprimir na impressora", "pontos": 0}, {"id": "c", "texto": "Trocar o nome para .pdf", "pontos": 0}, {"id": "d", "texto": "Não dá para fazer", "pontos": 0}]}, {"id": "q5", "enunciado": "Chegou um e-mail estranho pedindo sua senha. O que fazer?", "opcoes": [{"id": "a", "texto": "Não clicar, não responder e avisar o responsável", "pontos": 1}, {"id": "b", "texto": "Responder com a senha", "pontos": 0}, {"id": "c", "texto": "Clicar para ver o que é", "pontos": 0}, {"id": "d", "texto": "Mandar para todos os colegas", "pontos": 0}]}, {"id": "q6", "enunciado": "No Excel, o que faz =B2*C2?", "opcoes": [{"id": "a", "texto": "Multiplica B2 por C2", "pontos": 1}, {"id": "b", "texto": "Soma B2 e C2", "pontos": 0}, {"id": "c", "texto": "Divide B2 por C2", "pontos": 0}, {"id": "d", "texto": "Junta os textos de B2 e C2", "pontos": 0}]}, {"id": "q7", "enunciado": "Como achar uma palavra num documento?", "opcoes": [{"id": "a", "texto": "Ctrl + F (Localizar)", "pontos": 1}, {"id": "b", "texto": "Ctrl + N", "pontos": 0}, {"id": "c", "texto": "Ctrl + A", "pontos": 0}, {"id": "d", "texto": "Ctrl + B", "pontos": 0}]}, {"id": "q8", "enunciado": "Qual é a média de 6, 8 e 10?", "opcoes": [{"id": "a", "texto": "8", "pontos": 1}, {"id": "b", "texto": "24", "pontos": 0}, {"id": "c", "texto": "7", "pontos": 0}, {"id": "d", "texto": "9", "pontos": 0}]}, {"id": "q9", "enunciado": "O que é backup?", "opcoes": [{"id": "a", "texto": "Uma cópia de segurança dos arquivos", "pontos": 1}, {"id": "b", "texto": "Um tipo de vírus", "pontos": 0}, {"id": "c", "texto": "Um programa de texto", "pontos": 0}, {"id": "d", "texto": "Apagar arquivos velhos", "pontos": 0}]}, {"id": "q10", "enunciado": "Na pasta compartilhada da empresa, como salvar um arquivo?", "opcoes": [{"id": "a", "texto": "Com nome claro, na pasta certa", "pontos": 1}, {"id": "b", "texto": "Na área de trabalho, como \"arquivo1\"", "pontos": 0}, {"id": "c", "texto": "Só no seu pen drive", "pontos": 0}, {"id": "d", "texto": "Em qualquer lugar", "pontos": 0}]}]'::jsonb, false)
on conflict (id) do update
  set tipo = excluded.tipo, area = excluded.area, titulo = excluded.titulo, descricao = excluded.descricao,
      questoes = excluded.questoes, atualizado_em = now();

insert into privado.avaliacoes_modelos (id, tipo, area, titulo, descricao, questoes, publicado)
values ('a7a10000-0000-4000-8000-000000000008', 'pratico', 'portugues', 'Teste prático Publike: Português e matemática do dia a dia', 'Escrita, recados, contas e horários.', '[{"id": "q1", "enunciado": "Qual frase está escrita certa?", "opcoes": [{"id": "a", "texto": "Vou me candidatar à vaga.", "pontos": 1}, {"id": "b", "texto": "Vou mi candidatar à vaga.", "pontos": 0}, {"id": "c", "texto": "Vou me candidatar a vagá.", "pontos": 0}, {"id": "d", "texto": "Vou me candida a vaga.", "pontos": 0}]}, {"id": "q2", "enunciado": "Complete: \"Quero ___ uma unidade.\"", "opcoes": [{"id": "a", "texto": "mais", "pontos": 1}, {"id": "b", "texto": "mas", "pontos": 0}, {"id": "c", "texto": "mãs", "pontos": 0}, {"id": "d", "texto": "maz", "pontos": 0}]}, {"id": "q3", "enunciado": "Quanto é 15% de 200?", "opcoes": [{"id": "a", "texto": "30", "pontos": 1}, {"id": "b", "texto": "15", "pontos": 0}, {"id": "c", "texto": "20", "pontos": 0}, {"id": "d", "texto": "35", "pontos": 0}]}, {"id": "q4", "enunciado": "Um turno das 8h às 17h, com 1 hora de almoço, tem quantas horas de trabalho?", "opcoes": [{"id": "a", "texto": "8 horas", "pontos": 1}, {"id": "b", "texto": "9 horas", "pontos": 0}, {"id": "c", "texto": "7 horas", "pontos": 0}, {"id": "d", "texto": "10 horas", "pontos": 0}]}, {"id": "q5", "enunciado": "O recado diz: \"O cliente ligou às 14h e pede retorno.\" O que fazer?", "opcoes": [{"id": "a", "texto": "Ligar de volta para o cliente", "pontos": 1}, {"id": "b", "texto": "Ir até a casa do cliente", "pontos": 0}, {"id": "c", "texto": "Nada", "pontos": 0}, {"id": "d", "texto": "Esperar ele ligar de novo", "pontos": 0}]}, {"id": "q6", "enunciado": "Qual frase está certa?", "opcoes": [{"id": "a", "texto": "Faz dois anos que trabalho aqui.", "pontos": 1}, {"id": "b", "texto": "Fazem dois anos que trabalho aqui.", "pontos": 0}, {"id": "c", "texto": "Fazem dois ano que trabalho aqui.", "pontos": 0}, {"id": "d", "texto": "Faz dois ano que trabalho aqui.", "pontos": 0}]}, {"id": "q7", "enunciado": "Você ganha R$ 45 por dia e trabalhou 22 dias. Quanto recebe?", "opcoes": [{"id": "a", "texto": "R$ 990", "pontos": 1}, {"id": "b", "texto": "R$ 900", "pontos": 0}, {"id": "c", "texto": "R$ 1.000", "pontos": 0}, {"id": "d", "texto": "R$ 945", "pontos": 0}]}, {"id": "q8", "enunciado": "Qual é a escrita certa?", "opcoes": [{"id": "a", "texto": "exceção", "pontos": 1}, {"id": "b", "texto": "excessão", "pontos": 0}, {"id": "c", "texto": "esseção", "pontos": 0}, {"id": "d", "texto": "excepção", "pontos": 0}]}, {"id": "q9", "enunciado": "O ônibus passa a cada 20 minutos. Você perdeu o das 7h10. Quando passa o próximo?", "opcoes": [{"id": "a", "texto": "7h30", "pontos": 1}, {"id": "b", "texto": "7h20", "pontos": 0}, {"id": "c", "texto": "7h40", "pontos": 0}, {"id": "d", "texto": "8h00", "pontos": 0}]}, {"id": "q10", "enunciado": "Quanto é 1,5 kg em gramas?", "opcoes": [{"id": "a", "texto": "1.500 g", "pontos": 1}, {"id": "b", "texto": "150 g", "pontos": 0}, {"id": "c", "texto": "15 g", "pontos": 0}, {"id": "d", "texto": "15.000 g", "pontos": 0}]}]'::jsonb, false)
on conflict (id) do update
  set tipo = excluded.tipo, area = excluded.area, titulo = excluded.titulo, descricao = excluded.descricao,
      questoes = excluded.questoes, atualizado_em = now();

insert into privado.avaliacoes_modelos (id, tipo, area, titulo, descricao, questoes, publicado)
values ('a7a10000-0000-4000-8000-000000000009', 'situacoes', 'comportamento', 'Situações de trabalho Publike', '12 situações do dia a dia do trabalho. Não tem resposta perfeita: escolha o que você faria.', '[{"id": "s1", "enunciado": "O pedido de um cliente atrasou e ele chega irritado. O que você faz?", "competencia": "atendimento", "opcoes": [{"id": "a", "texto": "Ouço, peço desculpas pelo atraso, digo o que vou fazer e dou um prazo real.", "pontos": 3}, {"id": "b", "texto": "Peço desculpas e chamo o responsável na hora.", "pontos": 2}, {"id": "c", "texto": "Explico que a culpa é da entrega, não minha.", "pontos": 1}, {"id": "d", "texto": "Digo que não posso fazer nada.", "pontos": 0}]}, {"id": "s2", "enunciado": "Um cliente pede um desconto que a regra da loja não permite. O que você faz?", "competencia": "atendimento", "opcoes": [{"id": "a", "texto": "Explico a regra com educação e vejo com o responsável se existe alguma opção.", "pontos": 3}, {"id": "b", "texto": "Digo que não posso dar o desconto, mas mostro o que posso fazer.", "pontos": 2}, {"id": "c", "texto": "Dou o desconto por conta própria para agradar.", "pontos": 1}, {"id": "d", "texto": "Finjo que não ouvi o pedido.", "pontos": 0}]}, {"id": "s3", "enunciado": "Um colega está com dificuldade numa tarefa que você sabe fazer, e você tem tempo. O que faz?", "competencia": "equipe", "opcoes": [{"id": "a", "texto": "Ofereço ajuda e mostro como eu faço.", "pontos": 3}, {"id": "b", "texto": "Digo que ele pode me chamar se precisar.", "pontos": 2}, {"id": "c", "texto": "Faço a tarefa por ele, sem explicar.", "pontos": 1}, {"id": "d", "texto": "Deixo: cada um cuida da sua parte.", "pontos": 0}]}, {"id": "s4", "enunciado": "A equipe decidiu fazer um trabalho de um jeito que você acha pior. O que faz?", "competencia": "equipe", "opcoes": [{"id": "a", "texto": "Falo minha opinião com respeito e, se decidirem diferente, faço como foi combinado.", "pontos": 3}, {"id": "b", "texto": "Sigo o combinado e depois converso com o líder.", "pontos": 2}, {"id": "c", "texto": "Faço do meu jeito, sem avisar.", "pontos": 1}, {"id": "d", "texto": "Reclamo da decisão com os colegas, pelas costas.", "pontos": 0}]}, {"id": "s5", "enunciado": "O ônibus atrasou e você vai chegar depois do horário. O que faz?", "competencia": "responsabilidade", "opcoes": [{"id": "a", "texto": "Aviso o líder antes do horário e digo quando chego.", "pontos": 3}, {"id": "b", "texto": "Aviso quando chego.", "pontos": 2}, {"id": "c", "texto": "Chego e não falo nada.", "pontos": 1}, {"id": "d", "texto": "Falto sem avisar.", "pontos": 0}]}, {"id": "s6", "enunciado": "Você terminou suas tarefas antes do fim do turno. O que faz?", "competencia": "responsabilidade", "opcoes": [{"id": "a", "texto": "Pergunto ao líder no que mais posso ajudar.", "pontos": 3}, {"id": "b", "texto": "Adianto uma tarefa que sei que precisa ser feita.", "pontos": 2}, {"id": "c", "texto": "Fico no celular até alguém me pedir algo.", "pontos": 1}, {"id": "d", "texto": "Vou embora mais cedo sem avisar.", "pontos": 0}]}, {"id": "s7", "enunciado": "Você errou numa tarefa e ninguém percebeu. O que faz?", "competencia": "responsabilidade", "opcoes": [{"id": "a", "texto": "Conto ao líder e corrijo.", "pontos": 3}, {"id": "b", "texto": "Corrijo sozinho e anoto para não repetir.", "pontos": 2}, {"id": "c", "texto": "Deixo como está, ninguém viu.", "pontos": 1}, {"id": "d", "texto": "Escondo o erro.", "pontos": 0}]}, {"id": "s8", "enunciado": "Faltou um material e o trabalho vai parar. O que você faz?", "competencia": "problemas", "opcoes": [{"id": "a", "texto": "Aviso o responsável e já proponho uma solução possível.", "pontos": 3}, {"id": "b", "texto": "Aviso o responsável e espero a orientação.", "pontos": 2}, {"id": "c", "texto": "Paro e espero alguém perceber.", "pontos": 1}, {"id": "d", "texto": "Uso qualquer coisa no lugar, mesmo que fique malfeito, sem avisar.", "pontos": 0}]}, {"id": "s9", "enunciado": "Chegaram duas tarefas urgentes ao mesmo tempo. O que você faz?", "competencia": "problemas", "opcoes": [{"id": "a", "texto": "Pergunto ao líder qual vem primeiro e aviso sobre o prazo da outra.", "pontos": 3}, {"id": "b", "texto": "Faço primeiro a que afeta o cliente.", "pontos": 2}, {"id": "c", "texto": "Faço as duas pela metade.", "pontos": 1}, {"id": "d", "texto": "Faço a mais fácil e esqueço a outra.", "pontos": 0}]}, {"id": "s10", "enunciado": "Um equipamento parou com um problema que você nunca viu. O que você faz?", "competencia": "problemas", "opcoes": [{"id": "a", "texto": "Procuro o procedimento ou peço orientação antes de mexer.", "pontos": 3}, {"id": "b", "texto": "Chamo quem entende do equipamento.", "pontos": 2}, {"id": "c", "texto": "Tento consertar do meu jeito, sem saber.", "pontos": 1}, {"id": "d", "texto": "Deixo parado e não aviso ninguém.", "pontos": 0}]}, {"id": "s11", "enunciado": "Você vê um colega levando produto da empresa sem pagar. O que faz?", "competencia": "etica", "opcoes": [{"id": "a", "texto": "Falo com o responsável, do jeito que a empresa orienta.", "pontos": 3}, {"id": "b", "texto": "Converso com o colega e digo que isso não é certo.", "pontos": 2}, {"id": "c", "texto": "Finjo que não vi.", "pontos": 1}, {"id": "d", "texto": "Pego também.", "pontos": 0}]}, {"id": "s12", "enunciado": "Um cliente oferece um dinheiro \"por fora\" para ser atendido antes dos outros. O que faz?", "competencia": "etica", "opcoes": [{"id": "a", "texto": "Recuso com educação, sigo a ordem e conto ao líder.", "pontos": 3}, {"id": "b", "texto": "Recuso com educação e sigo a ordem.", "pontos": 2}, {"id": "c", "texto": "Aceito o dinheiro, mas não passo ele na frente.", "pontos": 1}, {"id": "d", "texto": "Aceito e passo ele na frente.", "pontos": 0}]}]'::jsonb, false)
on conflict (id) do update
  set tipo = excluded.tipo, area = excluded.area, titulo = excluded.titulo, descricao = excluded.descricao,
      questoes = excluded.questoes, atualizado_em = now();
