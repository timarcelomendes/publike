-- A indicação (08/11/2026; claude/plano-painel-feed-indicacao-documentos.md, parte 3). Pode rodar de novo.
--
-- 1. links_indicacao: o link de quem indica para uma vaga. A empresa cria um por pessoa ("João, do caixa"); quem
--    tem conta indica com o próprio link (?i=p.<perfil>), e a linha nasce quando a primeira indicação chega.
-- 2. curtidas.indicacao_id: a curtida que veio por um link. Vale para qualquer vaga da mesma empresa.
-- 3. registrar_indicacao: chamada depois de curtir, com o código guardado num cookie (30 dias). Indicar a si
--    mesmo não conta, e a primeira indicação vale.
-- 4. A empresa: criar_link_indicacao, links_indicacao_da_vaga (com indicados e contratados), indicacoes_da_vaga
--    (quem indicou cada candidato) e indicados_das_vagas (para o Hoje). Quem indicou não vê nada do candidato.
-- 5. numeros_origem: os Resultados mostram "Indicados" como origem.

create table if not exists public.links_indicacao (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 60),
  perfil_id uuid references public.perfis (id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[a-z0-9]{8}$'),
  criado_em timestamptz not null default now()
);
comment on table public.links_indicacao is 'Os links de indicação das vagas (quem indica). Só pelas funções.';
create index if not exists links_indicacao_anuncio_idx on public.links_indicacao (anuncio_id);
create unique index if not exists links_indicacao_pessoa_idx on public.links_indicacao (conta_id, perfil_id)
  where perfil_id is not null;
alter table public.links_indicacao enable row level security;
revoke all on public.links_indicacao from anon, authenticated;
grant select, insert, update, delete on public.links_indicacao to service_role;

alter table public.curtidas add column if not exists indicacao_id uuid references public.links_indicacao (id) on delete set null;

create or replace function privado.codigo_de_indicacao()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + (get_byte(b, i) % 31), 1), '')
    from (select extensions.gen_random_bytes(8) b) x, generate_series(0, 7) i
$$;

-- A empresa cria o link de quem indica, numa vaga sua.
create or replace function public.criar_link_indicacao(p_anuncio uuid, p_nome text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v_nome text := left(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), 60);
  v_codigo text;
begin
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = conta and a.tipo = 'vaga') then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  if char_length(v_nome) < 2 then
    raise exception 'Escreva o nome de quem vai indicar.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.links_indicacao l where l.anuncio_id = p_anuncio) >= 50 then
    raise exception 'A vaga já tem 50 links de indicação.' using errcode = 'P0001';
  end if;
  loop
    v_codigo := privado.codigo_de_indicacao();
    exit when not exists (select 1 from public.links_indicacao l where l.codigo = v_codigo);
  end loop;
  insert into public.links_indicacao (anuncio_id, conta_id, nome, codigo) values (p_anuncio, conta, v_nome, v_codigo);
  return v_codigo;
end
$$;
revoke execute on function public.criar_link_indicacao(uuid, text) from public, anon;
grant execute on function public.criar_link_indicacao(uuid, text) to authenticated;

-- Depois de curtir: grava quem indicou na curtida desta vaga (o link pode ser de outra vaga da mesma empresa).
-- p_codigo: o código do link, ou "p.<perfil>" (o link de quem tem conta); p_origem: a vaga onde o link foi
-- aberto (tem de ser da mesma empresa). Devolve se gravou.
create or replace function public.registrar_indicacao(p_anuncio uuid, p_codigo text, p_origem uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  conta uuid;
  v_link uuid;
  v_indicador uuid;
  v_nome text;
begin
  if eu is null or p_codigo is null then
    return false;
  end if;
  select a.autor_id into conta from public.anuncios a where a.id = p_anuncio and a.tipo = 'vaga';
  if conta is null
     or not exists (select 1 from public.anuncios o where o.id = p_origem and o.autor_id = conta)
     or not exists (
    select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = eu and k.indicacao_id is null) then
    return false;
  end if;
  if p_codigo ~ '^p\.[0-9a-f-]{36}$' then
    v_indicador := substr(p_codigo, 3)::uuid;
    if v_indicador = eu or v_indicador = conta then
      return false;
    end if;
    select p.nome into v_nome from public.perfis p where p.id = v_indicador;
    if v_nome is null then
      return false;
    end if;
    insert into public.links_indicacao (anuncio_id, conta_id, nome, perfil_id, codigo)
    values (p_anuncio, conta, left(v_nome, 60), v_indicador, privado.codigo_de_indicacao())
    on conflict (conta_id, perfil_id) where perfil_id is not null do nothing;
    select l.id into v_link from public.links_indicacao l where l.conta_id = conta and l.perfil_id = v_indicador;
  elsif p_codigo ~ '^[a-z0-9]{8}$' then
    select l.id, l.perfil_id into v_link, v_indicador from public.links_indicacao l
     where l.codigo = p_codigo and l.conta_id = conta;
    if v_indicador = eu then
      return false;
    end if;
  end if;
  if v_link is null then
    return false;
  end if;
  update public.curtidas set indicacao_id = v_link
   where anuncio_id = p_anuncio and perfil_id = eu and indicacao_id is null;
  return found;
end
$$;
revoke execute on function public.registrar_indicacao(uuid, text, uuid) from public, anon;
grant execute on function public.registrar_indicacao(uuid, text, uuid) to authenticated;

-- Os links de uma vaga da conta, com quantos curtiram e quantos foram contratados por cada um.
create or replace function public.links_indicacao_da_vaga(p_anuncio uuid)
returns table (id uuid, nome text, codigo text, de_pessoa boolean, indicados bigint, contratados bigint, criado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.nome, l.codigo, l.perfil_id is not null,
         (select count(*) from public.curtidas k where k.indicacao_id = l.id and k.anuncio_id = p_anuncio),
         (select count(*) from public.curtidas k join public.etapas_candidatos e
             on e.anuncio_id = k.anuncio_id and e.perfil_id = k.perfil_id
           where k.indicacao_id = l.id and k.anuncio_id = p_anuncio and e.etapa = 'contratado'),
         l.criado_em
    from public.links_indicacao l
    join public.anuncios a on a.id = p_anuncio and a.autor_id = (select public.conta_atual())
   where l.conta_id = a.autor_id
     and (l.anuncio_id = p_anuncio
          or exists (select 1 from public.curtidas k where k.indicacao_id = l.id and k.anuncio_id = p_anuncio))
   order by l.criado_em desc
$$;
revoke execute on function public.links_indicacao_da_vaga(uuid) from public, anon;
grant execute on function public.links_indicacao_da_vaga(uuid) to authenticated;

-- Quem indicou cada candidato de uma vaga da conta (o quadro e a ficha).
create or replace function public.indicacoes_da_vaga(p_anuncio uuid)
returns table (perfil_id uuid, indicado_por text)
language sql
stable
security definer
set search_path = ''
as $$
  select k.perfil_id, l.nome
    from public.curtidas k
    join public.links_indicacao l on l.id = k.indicacao_id
    join public.anuncios a on a.id = k.anuncio_id
   where k.anuncio_id = p_anuncio and a.autor_id = (select public.conta_atual())
$$;
revoke execute on function public.indicacoes_da_vaga(uuid) from public, anon;
grant execute on function public.indicacoes_da_vaga(uuid) to authenticated;

-- Para o Hoje: os indicados e os contratados por indicação de cada vaga da conta.
create or replace function public.indicados_das_vagas(p_anuncios uuid[])
returns table (anuncio_id uuid, indicados bigint, contratados bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select k.anuncio_id, count(*),
         count(*) filter (where exists (select 1 from public.etapas_candidatos e
                                         where e.anuncio_id = k.anuncio_id and e.perfil_id = k.perfil_id
                                           and e.etapa = 'contratado'))
    from public.curtidas k
    join public.anuncios a on a.id = k.anuncio_id
   where k.anuncio_id = any (p_anuncios[1:200]) and k.indicacao_id is not null
     and a.autor_id = (select public.conta_atual())
   group by k.anuncio_id
$$;
revoke execute on function public.indicados_das_vagas(uuid[]) from public, anon;
grant execute on function public.indicados_das_vagas(uuid[]) to authenticated;

-- 5. Os Resultados: "Indicados" na origem dos candidatos (a mesma função da 20270109120000, com a indicação primeiro)
create or replace function public.numeros_origem(p_dias integer default null, p_anuncio uuid default null)
returns table (origem text, candidatos integer, entrevista integer, contratados integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  return query
  with base as (
    select case
             when c.indicacao_id is not null then 'indicacao'
             when exists (select 1 from public.convites_candidato k
                           where k.anuncio_id = c.anuncio_id and k.perfil_id = c.perfil_id) then 'de_fora'
             when exists (select 1 from public.convites_vaga k
                           where k.anuncio_id = c.anuncio_id and k.perfil_id = c.perfil_id) then 'convite'
             else coalesce((select 'campanha:' || split_part(o.origem, ':', 1) from privado.origens o
                             where o.usuario_id = c.perfil_id order by o.criado_em limit 1), 'direto')
           end as origem,
           coalesce(e.etapa, 'novo') as etapa,
           exists (select 1 from public.entrevistas x where x.anuncio_id = c.anuncio_id and x.perfil_id = c.perfil_id)
             or exists (select 1 from privado.historico_etapas h where h.anuncio_id = c.anuncio_id
                          and h.perfil_id = c.perfil_id and h.o_que = 'etapa:entrevista') as teve_entrevista
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where a.autor_id = eu and a.tipo = 'vaga' and (p_anuncio is null or a.id = p_anuncio)
       and (p_dias is null or c.criado_em >= now() - make_interval(days => p_dias))
  )
  select b.origem, count(*)::integer,
         (count(*) filter (where b.teve_entrevista or b.etapa in ('entrevista', 'contratado')))::integer,
         (count(*) filter (where b.etapa = 'contratado'))::integer
    from base b
   group by b.origem
   order by count(*) desc;
end
$$;

notify pgrst, 'reload schema';
