-- Etapas sob medida, o tempo em cada etapa e os horários livres (claude/plano-recursos-concorrentes.md, parte 5).
-- Pode rodar de novo.
-- 1) A conta cria até 6 etapas próprias ("Entrevista RH", "Teste técnico", "Proposta"), cada uma presa a uma
--    etapa de hoje (Em análise, Entrevista ou Contratados): a coluna aparece no quadro logo depois dela. Por baixo,
--    a pessoa continua na etapa de hoje (os avisos, os números e o que o candidato vê não mudam).
-- 2) Desde quando cada candidato está onde está (o histórico da migração 20270104120000).
-- 3) Os horários da semana em que a conta entrevista: viram as opções do "Deixar o candidato escolher".

-- 1. Etapas próprias -----------------------------------------------------------------------------------
create table if not exists public.etapas_da_conta (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.perfis (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 30),
  -- a etapa de hoje a que ela pertence
  base text not null check (base in ('analise', 'entrevista', 'contratado')),
  ordem smallint not null default 0,
  criada_em timestamptz not null default now()
);
create index if not exists etapas_da_conta_conta on public.etapas_da_conta (conta_id, base, ordem);
alter table public.etapas_da_conta enable row level security;
revoke all on public.etapas_da_conta from public, anon, authenticated;

alter table public.etapas_candidatos add column if not exists subetapa uuid references public.etapas_da_conta (id) on delete set null;

-- mudou de etapa: sai da etapa própria (quem põe de novo é marcar_subetapa)
create or replace function privado.etapa_limpa_subetapa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.etapa is distinct from old.etapa then
    new.subetapa := null;
  end if;
  return new;
end
$$;
drop trigger if exists etapas_limpa_subetapa on public.etapas_candidatos;
create trigger etapas_limpa_subetapa before update of etapa on public.etapas_candidatos
  for each row execute function privado.etapa_limpa_subetapa();

create or replace function public.etapas_proprias()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'base', e.base)
                            order by case e.base when 'analise' then 0 when 'entrevista' then 1 else 2 end, e.ordem, e.criada_em),
                  '[]'::jsonb)
    from public.etapas_da_conta e
   where e.conta_id = public.conta_atual() and (select auth.uid()) is not null
$$;

-- salva a lista inteira: [{"id": uuid ou null, "nome": "...", "base": "..."}]; as que saem da lista são apagadas
create or replace function public.salvar_etapas_proprias(p_etapas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := public.conta_atual();
  x jsonb;
  i integer := 0;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_nome text;
begin
  if (select auth.uid()) is null
     or not exists (select 1 from public.perfis p where p.id = v_conta and p.tipo in ('empresa', 'comercio', 'agencia')) then
    raise exception 'Etapas próprias são para quem contrata.' using errcode = '42501';
  end if;
  if public.papel_na_conta() not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta muda as etapas.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_etapas, '[]'::jsonb)) > 6 then
    raise exception 'No máximo 6 etapas próprias.' using errcode = '22023';
  end if;
  for x in select jsonb_array_elements(coalesce(p_etapas, '[]'::jsonb)) loop
    i := i + 1;
    v_nome := nullif(btrim(regexp_replace(coalesce(x ->> 'nome', ''), '[[:space:]]+', ' ', 'g')), '');
    if v_nome is null or char_length(v_nome) < 2 or char_length(v_nome) > 30 then
      raise exception 'Cada etapa tem de 2 a 30 letras.' using errcode = '22023';
    end if;
    if coalesce(x ->> 'base', '') not in ('analise', 'entrevista', 'contratado') then
      raise exception 'Escolha depois de qual etapa ela fica.' using errcode = '22023';
    end if;
    v_id := case when coalesce(x ->> 'id', '') ~ '^[0-9a-f-]{36}$' then (x ->> 'id')::uuid end;
    if v_id is not null and exists (select 1 from public.etapas_da_conta e where e.id = v_id and e.conta_id = v_conta) then
      update public.etapas_da_conta set nome = v_nome, base = x ->> 'base', ordem = i where id = v_id;
    else
      insert into public.etapas_da_conta (conta_id, nome, base, ordem) values (v_conta, v_nome, x ->> 'base', i)
      returning id into v_id;
    end if;
    v_ids := v_ids || v_id;
  end loop;
  delete from public.etapas_da_conta e where e.conta_id = v_conta and not (e.id = any(v_ids));
end
$$;

-- põe (ou tira, com null) os candidatos numa etapa própria; eles já estão na etapa de hoje dela
create or replace function public.marcar_subetapa(p_anuncio uuid, p_perfis uuid[], p_subetapa uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  n integer;
begin
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = public.conta_atual()) then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  if p_subetapa is not null then
    select e.base into v_base from public.etapas_da_conta e where e.id = p_subetapa and e.conta_id = public.conta_atual();
    if v_base is null then
      raise exception 'Etapa não encontrada.' using errcode = '22023';
    end if;
  end if;
  update public.etapas_candidatos ec set subetapa = p_subetapa
   where ec.anuncio_id = p_anuncio and ec.perfil_id = any(coalesce(p_perfis, '{}'))
     and (p_subetapa is null or ec.etapa = v_base);
  get diagnostics n = row_count;
  if p_subetapa is not null then
    insert into privado.historico_etapas (anuncio_id, perfil_id, o_que)
    select p_anuncio, ec.perfil_id, 'sub:' || p_subetapa from public.etapas_candidatos ec
     where ec.anuncio_id = p_anuncio and ec.perfil_id = any(coalesce(p_perfis, '{}')) and ec.subetapa = p_subetapa;
  end if;
  return n;
end
$$;

-- 2. Desde quando --------------------------------------------------------------------------------------
-- por candidato da vaga: a etapa própria e desde quando está onde está (a última mudança; sem histórico, a curtida)
create or replace function public.onde_esta_desde(p_anuncio uuid)
returns table (perfil_id uuid, subetapa uuid, desde timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = public.conta_atual()) then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  return query
  select c.perfil_id, ec.subetapa,
         greatest(c.criado_em, coalesce(c.respondida_em, c.criado_em),
                  coalesce((select max(h.em) from privado.historico_etapas h
                             where h.anuncio_id = c.anuncio_id and h.perfil_id = c.perfil_id), c.criado_em))
    from public.curtidas c
    left join public.etapas_candidatos ec on ec.anuncio_id = c.anuncio_id and ec.perfil_id = c.perfil_id
   where c.anuncio_id = p_anuncio;
end
$$;

-- 3. Horários livres -----------------------------------------------------------------------------------
create table if not exists public.horarios_livres (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  -- [{"dia": 1..6 (segunda a sábado), "de": "14:00", "ate": "17:00"}]
  faixas jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.horarios_livres enable row level security;
revoke all on public.horarios_livres from public, anon, authenticated;

create or replace function public.meus_horarios_livres()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select h.faixas from public.horarios_livres h where h.conta_id = public.conta_atual()
                    and (select auth.uid()) is not null), '[]'::jsonb)
$$;

create or replace function public.salvar_horarios_livres(p_faixas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  x jsonb;
  v jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_faixas, '[]'::jsonb)) > 14 then
    raise exception 'No máximo 14 faixas.' using errcode = '22023';
  end if;
  for x in select jsonb_array_elements(coalesce(p_faixas, '[]'::jsonb)) loop
    if (x ->> 'dia') !~ '^[0-6]$' or (x ->> 'de') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (x ->> 'ate') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (x ->> 'ate') <= (x ->> 'de') then
      raise exception 'Confira os horários: o fim vem depois do começo.' using errcode = '22023';
    end if;
    v := v || jsonb_build_object('dia', (x ->> 'dia')::integer, 'de', x ->> 'de', 'ate', x ->> 'ate');
  end loop;
  insert into public.horarios_livres (conta_id, faixas) values (public.conta_atual(), v)
  on conflict (conta_id) do update set faixas = excluded.faixas, atualizado_em = now();
end
$$;

-- os horários já tomados da conta nos próximos dias (para não oferecer o mesmo duas vezes)
create or replace function public.horarios_ocupados(p_dias integer default 21)
returns table (inicio timestamptz, fim timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o, o + make_interval(mins => e.duracao_min)
    from public.entrevistas e
    join public.anuncios a on a.id = e.anuncio_id
    cross join lateral unnest(case when e.situacao = 'escolher' then e.opcoes else array[e.quando] end) o
   where a.autor_id = public.conta_atual() and (select auth.uid()) is not null
     and e.situacao in ('marcada', 'confirmada', 'remarcar', 'escolher')
     and o between now() and now() + make_interval(days => greatest(1, least(coalesce(p_dias, 21), 60)))
$$;

revoke all on function public.etapas_proprias(), public.salvar_etapas_proprias(jsonb),
                       public.marcar_subetapa(uuid, uuid[], uuid), public.onde_esta_desde(uuid),
                       public.meus_horarios_livres(), public.salvar_horarios_livres(jsonb), public.horarios_ocupados(integer)
  from public, anon;
grant execute on function public.etapas_proprias(), public.salvar_etapas_proprias(jsonb),
                          public.marcar_subetapa(uuid, uuid[], uuid), public.onde_esta_desde(uuid),
                          public.meus_horarios_livres(), public.salvar_horarios_livres(jsonb), public.horarios_ocupados(integer)
  to authenticated;

notify pgrst, 'reload schema';
