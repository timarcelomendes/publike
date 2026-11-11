-- O mutirão de contratação (claude/plano-convite-automatico-30-dias-e-anual.md, parte 3): um dia (ou uma tarde) de
-- entrevistas presenciais em sequência, para contratar várias pessoas de uma vez. Quem contrata cria o dia, chama
-- quem curtiu as vagas, cada pessoa escolhe um horário que ainda tem lugar, e no dia marca quem chegou e quem faltou.
-- Cada pessoa chamada vira uma entrevista presencial da vaga (entrevistas.mutirao_id): o lembrete da véspera, o
-- convite de agenda, "realizada" e "faltou" e as etapas funcionam como hoje.
-- Quem pode: quem tem plano (um plano por faixa ou o Plano Completo, assinado ou por 30 dias), o primeiro mutirão
-- de cada conta (grátis, para experimentar) ou quem o Admin liberar (privado.mutirao_contas). Pode rodar de novo.

create table if not exists public.mutiroes (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.perfis(id) on delete cascade,
  dia date not null,
  inicio time not null,
  fim time not null,
  intervalo_min smallint not null check (intervalo_min in (15, 20, 30)),
  por_horario smallint not null check (por_horario between 1 and 10),
  local text not null check (char_length(local) between 3 and 300),
  trazer text check (trazer is null or char_length(trazer) <= 300),
  situacao text not null default 'aberto' check (situacao in ('aberto', 'cancelado')),
  criado_em timestamptz not null default now(),
  check (fim > inicio)
);
create index if not exists mutiroes_conta on public.mutiroes (conta_id, dia desc);

create table if not exists public.mutirao_vagas (
  mutirao_id uuid not null references public.mutiroes(id) on delete cascade,
  anuncio_id uuid not null references public.anuncios(id) on delete cascade,
  primary key (mutirao_id, anuncio_id)
);

alter table public.entrevistas add column if not exists mutirao_id uuid references public.mutiroes(id) on delete set null;
create index if not exists entrevistas_mutirao on public.entrevistas (mutirao_id, quando) where mutirao_id is not null;
grant select (mutirao_id) on public.entrevistas to authenticated;

-- a liberação do Admin (sem plano)
create table if not exists privado.mutirao_contas (
  conta_id uuid primary key references public.perfis(id) on delete cascade,
  liberado_em timestamptz not null default now()
);

alter table public.mutiroes enable row level security;
alter table public.mutirao_vagas enable row level security;
alter table privado.mutirao_contas enable row level security;
revoke all on public.mutiroes, public.mutirao_vagas, privado.mutirao_contas from public, anon, authenticated;
grant select on public.mutiroes, public.mutirao_vagas to authenticated;
drop policy if exists "a conta vê os seus mutirões" on public.mutiroes;
create policy "a conta vê os seus mutirões" on public.mutiroes for select to authenticated
  using (conta_id = (select public.conta_atual()));
drop policy if exists "a conta vê as vagas dos seus mutirões" on public.mutirao_vagas;
create policy "a conta vê as vagas dos seus mutirões" on public.mutirao_vagas for select to authenticated
  using (exists (select 1 from public.mutiroes m where m.id = mutirao_id and m.conta_id = (select public.conta_atual())));

-- ------------------------------------------------------------------ quem pode

-- um plano valendo (assinatura ou 30 dias), o Admin, ou ainda nenhum mutirão (o primeiro é grátis)
create or replace function privado.mutirao_com_plano(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.assinaturas a
                  where a.conta_id = p_conta and a.situacao = 'ativa' and privado.libera_tudo(a.recurso))
      or exists (select 1 from privado.cobrancas c
                  where c.conta_id = p_conta and c.situacao = 'paga' and privado.libera_tudo(c.recurso)
                    and c.periodo_ate + case when c.compra_id is null then interval '3 days' else interval '0' end > now())
      or exists (select 1 from privado.mutirao_contas x where x.conta_id = p_conta)
      or exists (select 1 from privado.plano_agencia_cortesia x
                  where x.conta_id = p_conta and (x.ate is null or x.ate > now()))
$$;

create or replace function privado.mutirao_liberado(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.mutirao_com_plano(p_conta)
      or not exists (select 1 from public.mutiroes m where m.conta_id = p_conta)
$$;

-- para a tela: pode criar, e se é o grátis
create or replace function public.mutirao_situacao()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
begin
  if eu is null then
    return null;
  end if;
  return jsonb_build_object(
    'pode', exists (select 1 from public.perfis p where p.id = eu and p.tipo in ('comercio', 'empresa', 'agencia')),
    'plano', privado.mutirao_com_plano(eu),
    'liberado', privado.mutirao_liberado(eu),
    'primeiro', not exists (select 1 from public.mutiroes m where m.conta_id = eu));
end
$$;

-- ------------------------------------------------------------------ os horários

-- os horários do dia, cada um com quantos lugares ainda tem
create or replace function privado.horarios_do_mutirao(p_mutirao uuid)
returns table (quando timestamptz, ocupados integer, lugares integer)
language sql
stable
security definer
set search_path = ''
as $$
  select h.quando,
         (select count(*)::integer from public.entrevistas e
           where e.mutirao_id = m.id and e.quando = h.quando and e.situacao in ('marcada', 'confirmada', 'realizada', 'faltou')),
         m.por_horario::integer
    from public.mutiroes m
    cross join lateral generate_series(
      (m.dia + m.inicio) at time zone 'America/Sao_Paulo',
      (m.dia + m.fim) at time zone 'America/Sao_Paulo' - make_interval(mins => m.intervalo_min),
      make_interval(mins => m.intervalo_min)) as h(quando)
   where m.id = p_mutirao
$$;

-- ------------------------------------------------------------------ criar, chamar, cancelar (quem contrata)

create or replace function public.criar_mutirao(p_dia date, p_inicio time, p_fim time, p_intervalo integer,
                                               p_por_horario integer, p_local text, p_trazer text, p_vagas uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  v_id uuid;
  v_local text := nullif(btrim(coalesce(p_local, '')), '');
  v_trazer text := nullif(btrim(coalesce(p_trazer, '')), '');
  v_vagas uuid[];
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from public.perfis p where p.id = eu and p.tipo in ('comercio', 'empresa', 'agencia')) then
    raise exception 'O mutirão é para quem contrata.' using errcode = '42501';
  end if;
  if not privado.mutirao_liberado(eu) then
    raise exception 'O mutirão faz parte dos planos. O primeiro foi grátis; para o próximo, escolha um plano.'
      using errcode = 'P0001', hint = 'sem_plano';
  end if;
  if p_dia is null or p_dia < v_hoje or p_dia > v_hoje + 120 then
    raise exception 'Escolha um dia de hoje até daqui a 120 dias.' using errcode = '22023', hint = 'dia';
  end if;
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'O fim precisa ser depois do começo.' using errcode = '22023', hint = 'horario';
  end if;
  if p_intervalo not in (15, 20, 30) then
    raise exception 'Escolha de quanto em quanto tempo: 15, 20 ou 30 minutos.' using errcode = '22023';
  end if;
  if p_por_horario is null or p_por_horario < 1 or p_por_horario > 10 then
    raise exception 'Escolha de 1 a 10 pessoas por horário.' using errcode = '22023';
  end if;
  if extract(epoch from (p_fim - p_inicio)) / 60 < p_intervalo then
    raise exception 'O período precisa caber pelo menos um horário.' using errcode = '22023', hint = 'horario';
  end if;
  if extract(epoch from (p_fim - p_inicio)) / 60 / p_intervalo > 48 then
    raise exception 'São horários demais para um dia (até 48).' using errcode = '22023', hint = 'horario';
  end if;
  if v_local is null or char_length(v_local) < 3 then
    raise exception 'Diga o endereço do mutirão.' using errcode = '22023', hint = 'local';
  end if;
  if char_length(v_local) > 300 or char_length(v_trazer) > 300 then
    raise exception 'O texto ficou longo demais.' using errcode = '22023';
  end if;
  select array_agg(distinct a.id) into v_vagas
    from public.anuncios a
   where a.id = any(coalesce(p_vagas, '{}')) and a.autor_id = eu and a.tipo = 'vaga';
  if coalesce(cardinality(v_vagas), 0) = 0 then
    raise exception 'Escolha pelo menos uma vaga sua.' using errcode = '22023', hint = 'vagas';
  end if;
  if cardinality(v_vagas) > 20 then
    raise exception 'Escolha até 20 vagas.' using errcode = '22023', hint = 'vagas';
  end if;
  perform privado.conferir_limite('etapa', 300, 'Você mexeu em muitos candidatos hoje. Tente de novo amanhã.');
  insert into public.mutiroes (conta_id, dia, inicio, fim, intervalo_min, por_horario, local, trazer)
  values (eu, p_dia, p_inicio, p_fim, p_intervalo, p_por_horario, v_local, v_trazer)
  returning id into v_id;
  insert into public.mutirao_vagas (mutirao_id, anuncio_id) select v_id, unnest(v_vagas);
  return v_id;
end
$$;

-- chama quem curtiu uma vaga do mutirão (até 50 de uma vez): cada pessoa recebe o aviso e escolhe o horário
create or replace function public.chamar_para_mutirao(p_mutirao uuid, p_anuncio uuid, p_pessoas uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  m public.mutiroes;
  v_titulo text;
  v_primeiro timestamptz;
  v_pessoa uuid;
  v_id uuid;
  n integer := 0;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select * into m from public.mutiroes where id = p_mutirao and conta_id = eu;
  if m.id is null then
    raise exception 'Mutirão não encontrado.' using errcode = 'P0002';
  end if;
  if m.situacao <> 'aberto' then
    raise exception 'Este mutirão foi cancelado.' using errcode = 'P0001';
  end if;
  if (m.dia + m.fim) at time zone 'America/Sao_Paulo' < now() then
    raise exception 'Este mutirão já passou.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.mutirao_vagas v where v.mutirao_id = m.id and v.anuncio_id = p_anuncio) then
    raise exception 'Essa vaga não está no mutirão.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_pessoas), 0) = 0 then
    raise exception 'Escolha quem chamar.' using errcode = '22023';
  end if;
  if cardinality(p_pessoas) > 50 then
    raise exception 'Chame até 50 pessoas de uma vez.' using errcode = '22023';
  end if;
  select a.titulo into v_titulo from public.anuncios a where a.id = p_anuncio;
  select min(h.quando) into v_primeiro from privado.horarios_do_mutirao(m.id) h;
  for v_pessoa in select distinct x from unnest(p_pessoas) x loop
    -- só quem curtiu a vaga (e não foi dispensado nem desfez)
    continue when not exists (select 1 from public.curtidas c
                               where c.anuncio_id = p_anuncio and c.perfil_id = v_pessoa
                                 and c.status in ('pendente', 'match'));
    -- já chamado para este mutirão
    continue when exists (select 1 from public.entrevistas e
                           where e.anuncio_id = p_anuncio and e.perfil_id = v_pessoa and e.mutirao_id = m.id
                             and e.situacao in ('escolher', 'marcada', 'confirmada'));
    perform privado.conferir_limite('etapa', 300, 'Você mexeu em muitos candidatos hoje. Tente de novo amanhã.');
    v_id := null;
    update public.entrevistas
       set quando = v_primeiro, opcoes = null, formato = 'presencial', local = m.local, obs = m.trazer,
           duracao_min = m.intervalo_min, situacao = 'escolher', mutirao_id = m.id, atualizado_em = now()
     where id = (select e.id from public.entrevistas e
                  where e.anuncio_id = p_anuncio and e.perfil_id = v_pessoa
                    and e.situacao in ('marcada', 'confirmada', 'remarcar', 'escolher')
                  order by e.atualizado_em desc limit 1)
    returning id into v_id;
    if v_id is null then
      insert into public.entrevistas (anuncio_id, perfil_id, quando, formato, local, obs, duracao_min, situacao, mutirao_id)
      values (p_anuncio, v_pessoa, v_primeiro, 'presencial', m.local, m.trazer, m.intervalo_min, 'escolher', m.id)
      returning id into v_id;
    end if;
    insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa)
    values (p_anuncio, v_pessoa, 'entrevista')
    on conflict (anuncio_id, perfil_id) do update
      set etapa = 'entrevista',
          atualizado_em = case when public.etapas_candidatos.etapa <> 'entrevista' then now()
                               else public.etapas_candidatos.atualizado_em end;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
    values (v_pessoa, 'entrevista', p_anuncio, eu,
            left('Você foi chamado para o dia de entrevistas de “' || v_titulo || '”, em '
                 || to_char(m.dia, 'DD/MM') || ', das ' || to_char(m.inicio, 'HH24:MI') || ' às '
                 || to_char(m.fim, 'HH24:MI') || '. Escolha o seu horário.', 300),
            '/mutirao/' || v_id);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- cancela: as entrevistas do mutirão que não aconteceram são canceladas, com o aviso
create or replace function public.cancelar_mutirao(p_mutirao uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  m public.mutiroes;
  r record;
  n integer := 0;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  select * into m from public.mutiroes where id = p_mutirao and conta_id = eu;
  if m.id is null then
    raise exception 'Mutirão não encontrado.' using errcode = 'P0002';
  end if;
  update public.mutiroes set situacao = 'cancelado' where id = m.id;
  for r in
    update public.entrevistas e set situacao = 'cancelada', atualizado_em = now()
     where e.mutirao_id = m.id and e.situacao in ('escolher', 'marcada', 'confirmada', 'remarcar')
    returning e.perfil_id, e.anuncio_id
  loop
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (r.perfil_id, 'entrevista', r.anuncio_id, eu,
            left('O dia de entrevistas de ' || to_char(m.dia, 'DD/MM') || ' para “'
                 || (select a.titulo from public.anuncios a where a.id = r.anuncio_id) || '” foi cancelado.', 300));
    n := n + 1;
  end loop;
  return n;
end
$$;

-- ------------------------------------------------------------------ a pessoa chamada

-- o mutirão de uma entrevista minha: o dia, o endereço, o que trazer e os horários com lugar
create or replace function public.meu_mutirao(p_entrevista uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.entrevistas;
  m public.mutiroes;
begin
  select * into e from public.entrevistas x where x.id = p_entrevista and x.perfil_id = (select public.conta_atual());
  if e.id is null or e.mutirao_id is null then
    return null;
  end if;
  select * into m from public.mutiroes where id = e.mutirao_id;
  return jsonb_build_object(
    'entrevista', e.id, 'situacao', e.situacao, 'quando', e.quando, 'anuncio', e.anuncio_id,
    'vaga', (select a.titulo from public.anuncios a where a.id = e.anuncio_id),
    'empresa', (select p.nome from public.perfis p where p.id = m.conta_id),
    'dia', m.dia, 'inicio', m.inicio, 'fim', m.fim, 'local', m.local, 'trazer', m.trazer,
    'cancelado', m.situacao = 'cancelado',
    'horarios', coalesce((select jsonb_agg(h.quando order by h.quando) from privado.horarios_do_mutirao(m.id) h
                           where h.ocupados < h.lugares and h.quando > now()), '[]'::jsonb));
end
$$;

-- escolhe o horário: confere a lotação com a trava do mutirão (duas pessoas não pegam o último lugar)
create or replace function public.escolher_horario_mutirao(p_entrevista uuid, p_quando timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  e public.entrevistas;
  m public.mutiroes;
  v_ocupados integer;
  v_nome text;
  v_titulo text;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  select * into e from public.entrevistas x where x.id = p_entrevista and x.perfil_id = eu;
  if e.id is null or e.mutirao_id is null then
    raise exception 'Entrevista não encontrada.' using errcode = 'P0002';
  end if;
  select * into m from public.mutiroes where id = e.mutirao_id for update;
  if m.situacao <> 'aberto' then
    raise exception 'Este dia de entrevistas foi cancelado.' using errcode = 'P0001';
  end if;
  if e.situacao not in ('escolher', 'marcada', 'confirmada') then
    raise exception 'Esta entrevista não está mais aberta.' using errcode = 'P0001';
  end if;
  if p_quando is null or p_quando < now() then
    raise exception 'Esse horário já passou. Escolha outro.' using errcode = '22023';
  end if;
  select h.ocupados into v_ocupados from privado.horarios_do_mutirao(m.id) h where h.quando = p_quando;
  if v_ocupados is null then
    raise exception 'Escolha um dos horários do dia.' using errcode = '22023';
  end if;
  -- quem troca de horário não conta no próprio lugar
  if e.quando = p_quando and e.situacao in ('marcada', 'confirmada') then
    return;
  end if;
  if v_ocupados >= m.por_horario then
    raise exception 'Esse horário acabou de lotar. Escolha outro.' using errcode = 'P0001', hint = 'lotado';
  end if;
  update public.entrevistas set quando = p_quando, situacao = 'confirmada', atualizado_em = now() where id = e.id;
  select split_part(p.nome, ' ', 1) into v_nome from public.perfis p where p.id = eu;
  select a.titulo into v_titulo from public.anuncios a where a.id = e.anuncio_id;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
  values (m.conta_id, 'entrevista_resposta', e.anuncio_id, eu,
          left(coalesce(v_nome, 'Uma pessoa') || ' escolheu ' || privado.data_da_entrevista(p_quando)
               || ' no mutirão de “' || v_titulo || '”.', 300),
          '/painel/mutiroes/' || m.id);
end
$$;

-- "Não posso ir": libera o lugar
create or replace function public.nao_posso_ir_mutirao(p_entrevista uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  e public.entrevistas;
  m public.mutiroes;
begin
  select * into e from public.entrevistas x where x.id = p_entrevista and x.perfil_id = eu;
  if eu is null or e.id is null or e.mutirao_id is null then
    raise exception 'Entrevista não encontrada.' using errcode = 'P0002';
  end if;
  if e.situacao not in ('escolher', 'marcada', 'confirmada') then
    return;
  end if;
  select * into m from public.mutiroes where id = e.mutirao_id;
  update public.entrevistas set situacao = 'cancelada', atualizado_em = now() where id = e.id;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
  values (m.conta_id, 'entrevista_resposta', e.anuncio_id, eu,
          left(coalesce((select split_part(p.nome, ' ', 1) from public.perfis p where p.id = eu), 'Uma pessoa')
               || ' não pode ir ao mutirão de ' || to_char(m.dia, 'DD/MM') || '.', 300),
          '/painel/mutiroes/' || m.id);
end
$$;

-- ------------------------------------------------------------------ as telas de quem contrata

-- os mutirões da conta, com o resumo: chamados, escolheram horário, vieram e contratados
create or replace function public.meus_mutiroes()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'dia', m.dia, 'inicio', m.inicio, 'fim', m.fim, 'intervalo', m.intervalo_min,
           'por_horario', m.por_horario, 'local', m.local, 'trazer', m.trazer, 'situacao', m.situacao,
           'vagas', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'titulo', a.titulo) order by a.titulo), '[]')
                       from public.mutirao_vagas v join public.anuncios a on a.id = v.anuncio_id
                      where v.mutirao_id = m.id),
           'resumo', (select jsonb_build_object(
                        'chamados', count(*),
                        'escolheram', count(*) filter (where e.situacao in ('marcada', 'confirmada', 'realizada', 'faltou')),
                        'vieram', count(*) filter (where e.situacao = 'realizada'),
                        'faltaram', count(*) filter (where e.situacao = 'faltou'),
                        'contratados', count(*) filter (where exists (
                          select 1 from public.etapas_candidatos ec
                           where ec.anuncio_id = e.anuncio_id and ec.perfil_id = e.perfil_id and ec.etapa = 'contratado')))
                        from public.entrevistas e where e.mutirao_id = m.id),
           'lugares', (select count(*) * m.por_horario from privado.horarios_do_mutirao(m.id)))
           order by m.dia desc, m.inicio desc), '[]'::jsonb)
    from public.mutiroes m
   where (select auth.uid()) is not null and m.conta_id = public.conta_atual()
$$;

-- o dia: cada pessoa chamada, com o horário, a vaga e como está
create or replace function public.mutirao_do_dia(p_mutirao uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when m.id is null then null else jsonb_build_object(
    'horarios', (select coalesce(jsonb_agg(jsonb_build_object('quando', h.quando, 'ocupados', h.ocupados,
                                                               'lugares', h.lugares) order by h.quando), '[]')
                   from privado.horarios_do_mutirao(m.id) h),
    'pessoas', (select coalesce(jsonb_agg(jsonb_build_object(
                  'entrevista', e.id, 'perfil', e.perfil_id, 'anuncio', e.anuncio_id, 'situacao', e.situacao,
                  'quando', e.quando, 'nome', p.nome, 'vaga', a.titulo,
                  'etapa', (select ec.etapa from public.etapas_candidatos ec
                             where ec.anuncio_id = e.anuncio_id and ec.perfil_id = e.perfil_id))
                  order by (e.situacao = 'escolher'), e.quando, p.nome), '[]')
                  from public.entrevistas e
                  join public.perfis p on p.id = e.perfil_id
                  join public.anuncios a on a.id = e.anuncio_id
                 where e.mutirao_id = m.id),
    -- quem dá para chamar: curtiu uma vaga do mutirão e ainda não foi chamado para ele
    'para_chamar', (select coalesce(jsonb_agg(jsonb_build_object(
                      'perfil', c.perfil_id, 'anuncio', c.anuncio_id, 'nome', p.nome, 'vaga', a.titulo,
                      'match', c.status = 'match', 'curtiu_em', c.criado_em) order by a.titulo, c.criado_em desc), '[]')
                      from public.mutirao_vagas v
                      join public.curtidas c on c.anuncio_id = v.anuncio_id and c.status in ('pendente', 'match')
                      join public.perfis p on p.id = c.perfil_id
                      join public.anuncios a on a.id = c.anuncio_id
                     where v.mutirao_id = m.id
                       and not exists (select 1 from public.entrevistas e
                                        where e.mutirao_id = m.id and e.anuncio_id = c.anuncio_id
                                          and e.perfil_id = c.perfil_id and e.situacao <> 'cancelada')
                       and not exists (select 1 from public.etapas_candidatos ec
                                        where ec.anuncio_id = c.anuncio_id and ec.perfil_id = c.perfil_id
                                          and ec.etapa in ('contratado', 'nao_seguiu')))) end
    from (select * from public.mutiroes x where x.id = p_mutirao and x.conta_id = public.conta_atual()
            and (select auth.uid()) is not null) m
    right join (select 1) um on true
$$;

revoke execute on function public.mutirao_situacao(), public.criar_mutirao(date, time, time, integer, integer, text, text, uuid[]),
  public.chamar_para_mutirao(uuid, uuid, uuid[]), public.cancelar_mutirao(uuid), public.meu_mutirao(uuid),
  public.escolher_horario_mutirao(uuid, timestamptz), public.nao_posso_ir_mutirao(uuid), public.meus_mutiroes(),
  public.mutirao_do_dia(uuid)
  from public, anon;
grant execute on function public.mutirao_situacao(), public.criar_mutirao(date, time, time, integer, integer, text, text, uuid[]),
  public.chamar_para_mutirao(uuid, uuid, uuid[]), public.cancelar_mutirao(uuid), public.meu_mutirao(uuid),
  public.escolher_horario_mutirao(uuid, timestamptz), public.nao_posso_ir_mutirao(uuid), public.meus_mutiroes(),
  public.mutirao_do_dia(uuid)
  to authenticated;
revoke execute on function privado.mutirao_com_plano(uuid), privado.mutirao_liberado(uuid),
  privado.horarios_do_mutirao(uuid) from public;
