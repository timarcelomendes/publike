-- Teste Prático, etapa 1 (decisão do usuário, 30/10/2026): o tempo, as saídas da tela e o resultado numa palavra.
--
-- O tempo: 1 minuto por questão (10 questões, 10 minutos; no mínimo 5), o dobro para quem pede mais tempo, e sem
-- limite na vaga exclusiva para PCD. Conta do "Começar" (avaliacao_aceitar). As questões só saem do banco depois
-- do "Começar": antes, a pessoa vê só quantas são e o tempo. Acabou o tempo, o que foi respondido vai assim mesmo
-- (a questão em branco não conta ponto); antes disso, todas as questões precisam de resposta.
-- A empresa vê quanto tempo a pessoa levou, se passou do tempo e quantas vezes saiu da tela. Ninguém é recusado
-- por isso: é informação para quem decide. O aviso de teste feito diz o resultado numa palavra ("acima do
-- esperado"). Pode rodar de novo.

alter table privado.avaliacoes_pedidas
  add column if not exists inicio timestamptz,
  add column if not exists limite_minutos integer check (limite_minutos between 1 and 120),
  add column if not exists mais_tempo boolean not null default false,
  add column if not exists saidas integer not null default 0 check (saidas between 0 and 1000),
  add column if not exists fora_do_tempo boolean not null default false;

-- o tempo do teste, em minutos (null: sem limite)
create or replace function privado.limite_do_teste(p_anuncio uuid, p_questoes integer, p_mais boolean)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select a.pcd from public.anuncios a where a.id = p_anuncio) = 'exclusiva' then null
              else greatest(5, coalesce(p_questoes, 10)) * case when p_mais then 2 else 1 end end
$$;

-- o resultado numa palavra (o mesmo de faixaDoTeste, src/lib/testes.ts)
create or replace function privado.faixa_do_teste(p_tipo text, p_pontos integer, p_maximo integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_maximo, 0) <= 0 then null
              when p_pontos::numeric / p_maximo >= case when p_tipo = 'situacoes' then 0.85 else 0.9 end
                then 'acima do esperado'
              when p_pontos::numeric / p_maximo >= 0.6 then 'dentro do esperado'
              else 'abaixo do esperado' end
$$;

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
    'total', jsonb_array_length(m.questoes),
    'inicio', a.inicio, 'limite_minutos', a.limite_minutos, 'agora', now(),
    'tempo_segundos', case when a.feita_em is not null and a.inicio is not null
                           then extract(epoch from a.feita_em - a.inicio)::int end,
    -- antes do "Começar": o tempo que vai ter (e o dobro, para quem pedir)
    'limite_previsto', privado.limite_do_teste(a.anuncio_id, jsonb_array_length(m.questoes), false),
    -- as questões só depois do "Começar" (antes, daria para ler com calma sem o tempo correr)
    'questoes', case when a.inicio is null or a.status <> 'pedida' then '[]'::jsonb else
                (select jsonb_agg(jsonb_build_object(
                   'id', item ->> 'q',
                   'enunciado', q ->> 'enunciado',
                   'opcoes', (select jsonb_agg(jsonb_build_object('id', oid, 'texto', o ->> 'texto') order by n)
                                from jsonb_array_elements_text(item -> 'o') with ordinality as x(oid, n)
                                join jsonb_array_elements(q -> 'opcoes') o on o ->> 'id' = x.oid))
                   order by pos)
                   from jsonb_array_elements(v_ordem) with ordinality as y(item, pos)
                   join jsonb_array_elements(m.questoes) q on q ->> 'id' = y.item ->> 'q') end);
end
$$;

-- o "Começar": o aceite das condições e o começo do tempo (mais tempo: o dobro)
drop function if exists public.avaliacao_aceitar(uuid);
create or replace function public.avaliacao_aceitar(p_id uuid, p_mais_tempo boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a privado.avaliacoes_pedidas;
  nq integer;
begin
  select * into a from privado.avaliacoes_pedidas x
   where x.id = p_id and x.perfil_id = (select auth.uid()) and x.status = 'pedida' for update;
  if not found then
    raise exception 'Teste não encontrado.' using errcode = 'P0001';
  end if;
  if a.prazo < now() then
    raise exception 'O prazo deste teste acabou.' using errcode = 'P0001';
  end if;
  if a.inicio is null then
    select jsonb_array_length(m.questoes) into nq from privado.avaliacoes_modelos m where m.id = a.modelo_id;
    update privado.avaliacoes_pedidas
       set aceite_em = coalesce(aceite_em, now()), inicio = now(), mais_tempo = coalesce(p_mais_tempo, false),
           limite_minutos = privado.limite_do_teste(a.anuncio_id, nq, coalesce(p_mais_tempo, false))
     where id = a.id
    returning * into a;
  end if;
  return jsonb_build_object('inicio', a.inicio, 'limite_minutos', a.limite_minutos, 'agora', now());
end
$$;

-- manda as respostas ({questao: opcao}) e quantas vezes a pessoa saiu da tela; a correção é aqui
drop function if exists public.avaliacao_enviar(uuid, jsonb);
create or replace function public.avaliacao_enviar(p_id uuid, p_respostas jsonb, p_saidas integer default 0)
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
  v_max integer;
  acabou boolean;
  fora boolean;
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
  if a.aceite_em is null or a.inicio is null then
    raise exception 'Leia as condições e comece o teste antes de responder.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_respostas) <> 'object' then
    raise exception 'Responda todas as questões.' using errcode = 'P0001';
  end if;
  -- o tempo acabou (com 10 segundos de folga para a tela mandar): o que foi respondido vale
  acabou := a.limite_minutos is not null
            and now() >= a.inicio + make_interval(mins => a.limite_minutos) - interval '10 seconds';
  -- passou do tempo de verdade (2 minutos depois): a empresa vê
  fora := a.limite_minutos is not null and now() > a.inicio + make_interval(mins => a.limite_minutos) + interval '2 minutes';
  select * into m from privado.avaliacoes_modelos x where x.id = a.modelo_id;
  for q in select * from jsonb_array_elements(m.questoes) loop
    select o into escolhida from jsonb_array_elements(q -> 'opcoes') o where o ->> 'id' = p_respostas ->> (q ->> 'id');
    if escolhida is null and not acabou then
      raise exception 'Responda todas as questões.' using errcode = 'P0001';
    end if;
    pq := coalesce((escolhida ->> 'pontos')::int, 0);
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
  v_max := privado.maximo_do_teste(m.questoes);
  update privado.avaliacoes_pedidas
     set status = 'feita', feita_em = now(), pontos = v_pontos, maximo = v_max,
         por_competencia = nullif(v_comp, '{}'::jsonb),
         respostas = (select coalesce(jsonb_object_agg(q2 ->> 'id', p_respostas ->> (q2 ->> 'id')), '{}'::jsonb)
                        from jsonb_array_elements(m.questoes) q2
                       where p_respostas ? (q2 ->> 'id')),
         saidas = least(greatest(coalesce(p_saidas, 0), 0), 1000),
         fora_do_tempo = fora
   where id = a.id;
  select an.autor_id, an.titulo into autor, v_titulo from public.anuncios an where an.id = a.anuncio_id;
  select p.nome into quem from public.perfis p where p.id = a.perfil_id;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (autor, 'teste_feito', a.anuncio_id, a.perfil_id,
          left(coalesce(privado.nome_curto(quem), 'Um candidato') || ' fez o teste “' || m.titulo || '” da vaga “'
               || v_titulo || '”' || coalesce(': ' || privado.faixa_do_teste(m.tipo, v_pontos, v_max), '') || '.', 300));
  return jsonb_build_object('pontos', v_pontos, 'maximo', v_max, 'por_competencia', nullif(v_comp, '{}'::jsonb));
end
$$;

-- os resultados da vaga, com o tempo e as saídas da tela
drop function if exists public.avaliacoes_resultados(uuid);
create or replace function public.avaliacoes_resultados(p_anuncio uuid)
returns table (id uuid, perfil_id uuid, modelo_id uuid, titulo text, tipo text, status text, vencida boolean,
               pontos integer, maximo integer, por_competencia jsonb, pedida_em timestamptz, feita_em timestamptz,
               tempo_segundos integer, limite_minutos integer, fora_do_tempo boolean, saidas integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.minha_vaga_qualquer(p_anuncio);
  return query
    select a.id, a.perfil_id, a.modelo_id, m.titulo, m.tipo, a.status,
           a.status = 'pedida' and a.prazo < now(), a.pontos, a.maximo, a.por_competencia, a.pedida_em, a.feita_em,
           case when a.feita_em is not null and a.inicio is not null
                then extract(epoch from a.feita_em - a.inicio)::int end,
           a.limite_minutos, a.fora_do_tempo, a.saidas
      from privado.avaliacoes_pedidas a
      join privado.avaliacoes_modelos m on m.id = a.modelo_id
     where a.anuncio_id = p_anuncio
     order by a.feita_em desc nulls last, a.pedida_em desc;
end
$$;

-- as respostas de um teste feito, questão por questão (a questão em branco vem sem escolhida)
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
    'tempo_segundos', case when a.feita_em is not null and a.inicio is not null
                           then extract(epoch from a.feita_em - a.inicio)::int end,
    'limite_minutos', a.limite_minutos, 'fora_do_tempo', a.fora_do_tempo, 'saidas', a.saidas,
    'questoes', (select jsonb_agg(jsonb_build_object(
                   'enunciado', q ->> 'enunciado', 'competencia', q ->> 'competencia',
                   'escolhida', a.respostas ->> (q ->> 'id'), 'opcoes', q -> 'opcoes'))
                   from jsonb_array_elements(m.questoes) q));
end
$$;

revoke execute on function public.avaliacao_aceitar(uuid, boolean), public.avaliacao_enviar(uuid, jsonb, integer),
  public.avaliacoes_resultados(uuid) from public, anon;
grant execute on function public.avaliacao_aceitar(uuid, boolean), public.avaliacao_enviar(uuid, jsonb, integer),
  public.avaliacoes_resultados(uuid) to authenticated;
revoke execute on function privado.limite_do_teste(uuid, integer, boolean), privado.faixa_do_teste(text, integer, integer)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
