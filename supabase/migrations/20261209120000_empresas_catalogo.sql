-- Cadastro de empresas, parte A do plano dos colegas de trabalho (claude/plano-colegas-de-trabalho.md).
-- Ninguém vê nada novo, além do logo da empresa com conta no currículo:
--   * privado.empresas: cada empresa uma vez (o nome limpo é a chave), com o perfil quando tem conta;
--   * privado.empresas_nomes: cada jeito de escrever leva à mesma empresa ("Atacadão S.A." e "atacadao");
--   * privado.experiencias_empresas: cada trabalho do currículo ligado à empresa, com a unidade e as datas,
--     refeito a cada salvar (gatilho no currículo) e apagado junto com o currículo;
--   * o campo opcional "unidade" (unidade ou bairro) nas experiências;
--   * empresas_sugeridas (o currículo sugere enquanto a pessoa escreve) e empresas_do_curriculo (o logo);
--   * Admin › Empresas: a lista, juntar, "não é empresa", ligar ao perfil, as possíveis repetidas e o número
--     que decide a parte B (quantos currículos teriam pelo menos um colega).
-- "Casa de família", "autônomo", "diarista" e parecidos viram "não é empresa" e nunca juntam ninguém. Os
-- clientes das agências não entram (são dado da agência). Pode rodar de novo.

create table if not exists privado.empresas (
  id bigint generated always as identity primary key,
  nome text not null,
  chave text not null unique,
  cnpj text,
  cidade text,
  perfil_id uuid unique references public.perfis (id) on delete set null,
  tipo text not null default 'empresa' check (tipo in ('empresa', 'nao_empresa')),
  criado_em timestamptz not null default now()
);
alter table privado.empresas enable row level security;
revoke all on table privado.empresas from public, anon, authenticated;
create index if not exists empresas_chave_trgm on privado.empresas using gin (chave extensions.gin_trgm_ops);

create table if not exists privado.empresas_nomes (
  chave text primary key,
  empresa_id bigint not null references privado.empresas (id) on delete cascade
);
alter table privado.empresas_nomes enable row level security;
revoke all on table privado.empresas_nomes from public, anon, authenticated;
create index if not exists empresas_nomes_empresa on privado.empresas_nomes (empresa_id);

create table if not exists privado.experiencias_empresas (
  perfil_id uuid not null references public.curriculos (perfil_id) on delete cascade,
  ordem smallint not null,
  empresa_id bigint not null references privado.empresas (id) on delete cascade,
  -- a chave da unidade ou do bairro ("perimetral"), quando a pessoa escreveu
  unidade text,
  inicio text,
  fim text,
  atual boolean not null default false,
  -- quando a empresa entrou no currículo (fica entre um salvar e outro)
  criado_em timestamptz not null default now(),
  primary key (perfil_id, ordem)
);
alter table privado.experiencias_empresas enable row level security;
revoke all on table privado.experiencias_empresas from public, anon, authenticated;
create index if not exists experiencias_empresas_empresa on privado.experiencias_empresas (empresa_id);

-- dois nomes que o admin disse que não são a mesma empresa (saem das possíveis repetidas)
create table if not exists privado.empresas_diferentes (
  a bigint not null references privado.empresas (id) on delete cascade,
  b bigint not null references privado.empresas (id) on delete cascade,
  primary key (a, b),
  check (a < b)
);
alter table privado.empresas_diferentes enable row level security;
revoke all on table privado.empresas_diferentes from public, anon, authenticated;

-- o registro da equipe ganha as mudanças no cadastro de empresas
alter table public.registro_equipe drop constraint if exists registro_equipe_alvo_tipo_check;
alter table public.registro_equipe add constraint registro_equipe_alvo_tipo_check
  check (alvo_tipo in ('usuario', 'anuncio', 'config', 'modelo', 'equipe', 'chave', 'avaliacao', 'recado', 'empresa'));

-- O nome limpo: sem acento, minúsculas, só letras e números, sem os finais "ltda", "me", "mei", "epp",
-- "eireli", "s.a." e "cia", com os espaços arrumados. Vazio: null.
create or replace function privado.chave_empresa(p_nome text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text := btrim(regexp_replace(lower(public.sem_acento(coalesce(p_nome, ''))), '[^a-z0-9]+', ' ', 'g'));
  antes text;
begin
  loop
    antes := t;
    t := btrim(regexp_replace(t, '(^| )(ltda|me|mei|epp|eireli|s a|sa|cia|e cia)$', ''));
    exit when t = antes;
  end loop;
  return nullif(t, '');
end
$$;
revoke execute on function privado.chave_empresa(text) from public;

-- O que não é empresa: trabalho em casa de família, por conta própria, informal (muito comum no Publike).
create or replace function privado.chave_nao_empresa(p_chave text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_chave ~ '^(casas? de familias?|residencias?|trabalho autonomo|autonom[oa]s?|por conta( propria)?|conta propria|particular|informal|trabalho informal|freelancer?|freela|diarista|domestica|empregada domestica)( |$)'
    or p_chave in ('casa', 'familia', 'em casa', 'minha casa', 'varias', 'varios', 'diversas', 'diversos', 'bico', 'bicos',
                   'nenhum', 'nenhuma', 'nao lembro', 'propria', 'proprio', 'negocio proprio', 'meu negocio'),
    false)
$$;
revoke execute on function privado.chave_nao_empresa(text) from public;

-- "Atacadão - Perimetral": sem a unidade escrita à parte, o que vem depois do traço é a unidade.
create or replace function privado.partes_do_trabalho(p_onde text, p_unidade text, out empresa text, out unidade text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  m text[];
begin
  empresa := btrim(regexp_replace(coalesce(p_onde, ''), '\s+', ' ', 'g'));
  unidade := nullif(btrim(regexp_replace(coalesce(p_unidade, ''), '\s+', ' ', 'g')), '');
  if unidade is null then
    m := regexp_match(empresa, '^(.+?)\s+[-–—]\s+(.+)$');
    -- "Atacadão Ltda - ME": o que vem depois do traço é só o final da razão social, não a unidade
    if m is not null and privado.chave_empresa(m[2]) is not null then
      empresa := btrim(m[1]);
      unidade := btrim(m[2]);
    end if;
  end if;
  empresa := nullif(empresa, '');
end
$$;
revoke execute on function privado.partes_do_trabalho(text, text) from public;

-- A empresa de um nome: a que já tem esse nome limpo, ou uma nova.
create or replace function privado.empresa_do_nome(p_nome text)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  k text := privado.chave_empresa(p_nome);
  v bigint;
begin
  if k is null then
    return null;
  end if;
  select n.empresa_id into v from privado.empresas_nomes n where n.chave = k;
  if v is not null then
    return v;
  end if;
  insert into privado.empresas (nome, chave, tipo)
  values (left(btrim(regexp_replace(p_nome, '\s+', ' ', 'g')), 80), k,
          case when privado.chave_nao_empresa(k) then 'nao_empresa' else 'empresa' end)
  on conflict (chave) do nothing
  returning id into v;
  if v is null then
    select e.id into v from privado.empresas e where e.chave = k;
  end if;
  insert into privado.empresas_nomes (chave, empresa_id) values (k, v) on conflict (chave) do nothing;
  return v;
end
$$;
revoke execute on function privado.empresa_do_nome(text) from public;

-- Refaz os trabalhos ligados de um currículo. Quando a empresa já estava no currículo, fica a data de antes.
create or replace function privado.ligar_experiencias(p_perfil uuid, p_experiencias jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  velhas jsonb;
begin
  select coalesce(jsonb_object_agg(v.empresa_id::text, v.criado_em), '{}'::jsonb) into velhas
    from (select x.empresa_id, min(x.criado_em) as criado_em
            from privado.experiencias_empresas x where x.perfil_id = p_perfil group by x.empresa_id) v;
  delete from privado.experiencias_empresas x where x.perfil_id = p_perfil;
  insert into privado.experiencias_empresas (perfil_id, ordem, empresa_id, unidade, inicio, fim, atual, criado_em)
  select p_perfil, t.ordem, t.empresa_id, t.unidade, t.inicio, t.fim, t.atual,
         coalesce((velhas ->> t.empresa_id::text)::timestamptz, now())
    from (
      select e.n::smallint as ordem,
             privado.empresa_do_nome(pt.empresa) as empresa_id,
             privado.chave_empresa(pt.unidade) as unidade,
             nullif(e.v ->> 'inicio', '') as inicio,
             nullif(e.v ->> 'fim', '') as fim,
             case when jsonb_typeof(e.v -> 'atual') = 'boolean' then (e.v ->> 'atual')::boolean
                  else coalesce(e.v ->> 'inicio', '') <> '' and coalesce(e.v ->> 'fim', '') = '' end as atual
        from jsonb_array_elements(coalesce(p_experiencias, '[]'::jsonb)) with ordinality as e(v, n)
        cross join lateral privado.partes_do_trabalho(e.v ->> 'onde', e.v ->> 'unidade') pt
       where jsonb_typeof(e.v) = 'object' and privado.chave_empresa(pt.empresa) is not null
    ) t
   where t.empresa_id is not null;
end
$$;
revoke execute on function privado.ligar_experiencias(uuid, jsonb) from public;

-- Depois de salvar o currículo. Se der erro aqui, o currículo salva assim mesmo.
create or replace function privado.curriculos_ligar_empresas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.experiencias is distinct from old.experiencias then
    begin
      perform privado.ligar_experiencias(new.perfil_id, new.experiencias);
    exception when others then
      raise warning 'Publike: não deu para ligar as empresas do currículo % (%).', new.perfil_id, sqlerrm;
    end;
  end if;
  return null;
end
$$;
drop trigger if exists curriculos_ligar_empresas on public.curriculos;
create trigger curriculos_ligar_empresas
  after insert or update of experiencias on public.curriculos
  for each row execute function privado.curriculos_ligar_empresas();

-- A unidade ou o bairro na experiência (opcional, até 60 letras). O resto é a de 20261124120000.
create or replace function public.curriculos_antes_de_salvar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  e jsonb;
  junto text := '';
begin
  if new.perfil_id = (select auth.uid()) and coalesce(current_setting('publike.sistema', true), '') <> 'on' then
    perform privado.exigir_conta_ativa();
  end if;
  new.curso := nullif(btrim(regexp_replace(coalesce(new.curso, ''), '\s+', ' ', 'g')), '');
  new.cursos := coalesce(
    (select array_agg(c order by primeira)
       from (select btrim(c) as c, min(n) as primeira
               from unnest(coalesce(new.cursos, '{}')) with ordinality as t(c, n)
              where char_length(btrim(coalesce(c, ''))) between 2 and 80
              group by btrim(c)) u),
    '{}');
  new.disponibilidade := coalesce((select array_agg(distinct d) from unnest(new.disponibilidade) d), '{}');
  if new.arquivo is not null and split_part(new.arquivo, '/', 1) <> new.perfil_id::text then
    raise exception 'Envie o PDF de novo.' using errcode = 'P0001', hint = 'arquivo_invalido';
  end if;

  for e in select value from jsonb_array_elements(new.experiencias) loop
    if jsonb_typeof(e) <> 'object'
       or char_length(btrim(coalesce(e ->> 'cargo', ''))) not between 2 and 80
       or char_length(btrim(coalesce(e ->> 'onde', ''))) > 80
       or char_length(btrim(coalesce(e ->> 'unidade', ''))) > 60
       or char_length(coalesce(e ->> 'descricao', '')) > 300
       or (coalesce(e ->> 'inicio', '') <> '' and e ->> 'inicio' !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$')
       or (coalesce(e ->> 'fim', '') <> '' and e ->> 'fim' !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$')
       or (e ? 'atual' and jsonb_typeof(e -> 'atual') <> 'boolean') then
      raise exception 'Confira as experiências.' using errcode = 'P0001', hint = 'experiencia_invalida';
    end if;
    junto := junto || ' ' || coalesce(e ->> 'cargo', '') || ' ' || coalesce(e ->> 'onde', '') || ' '
             || coalesce(e ->> 'unidade', '') || ' ' || coalesce(e ->> 'descricao', '');
  end loop;

  if public.tem_contato(junto, true) or public.tem_contato(new.curso)
     or public.tem_contato(array_to_string(new.cursos, ' '), true) then
    raise exception 'Tire o telefone, e-mail ou link do currículo. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;

  new.atualizado_em := now();
  if tg_op = 'UPDATE' then
    new.criado_em := old.criado_em;
    new.perfil_id := old.perfil_id;
  else
    new.criado_em := now();
  end if;
  return new;
end
$$;

-- A carga de hoje: primeiro as contas de empresa, comércio e agência (o perfil fica ligado quando o nome
-- limpo é de uma conta só), depois os currículos.
insert into privado.empresas (nome, chave, cnpj, cidade, perfil_id, tipo)
select distinct on (c.k) c.nome, c.k, case when c.n = 1 then c.cnpj end, case when c.n = 1 then c.cidade end,
       case when c.n = 1 then c.id end, 'empresa'
  from (select p.id, p.nome, p.cnpj, p.cidade, privado.chave_empresa(p.nome) as k,
               count(*) over (partition by privado.chave_empresa(p.nome)) as n
          from public.perfis p
         where p.tipo in ('empresa', 'comercio', 'agencia')) c
 where c.k is not null and not privado.chave_nao_empresa(c.k)
 order by c.k, c.id
on conflict (chave) do nothing;
insert into privado.empresas_nomes (chave, empresa_id)
select e.chave, e.id from privado.empresas e
on conflict (chave) do nothing;
do $$
begin
  perform privado.ligar_experiencias(c.perfil_id, c.experiencias) from public.curriculos c;
end
$$;

-- O currículo sugere enquanto a pessoa escreve "Onde trabalhou": as empresas com conta no Publike e os
-- nomes que estão em 3 currículos ou mais. Só para quem entrou na conta.
create or replace function public.empresas_sugeridas(p_texto text)
returns table (nome text, com_conta boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (select privado.chave_empresa(p_texto) as k)
  select coalesce(p.nome, e.nome), p.id is not null
    from q, privado.empresas e
    left join public.perfis p on p.id = e.perfil_id and (p.suspenso_ate is null or p.suspenso_ate < now())
   where auth.uid() is not null
     and char_length(q.k) >= 2
     and e.tipo = 'empresa'
     and (e.chave like q.k || '%' or e.chave like '% ' || q.k || '%')
     and (p.id is not null
          or (select count(distinct x.perfil_id) from privado.experiencias_empresas x where x.empresa_id = e.id) >= 3)
   order by (p.id is not null) desc, (e.chave like q.k || '%') desc, char_length(e.chave), e.chave
   limit 6
$$;
revoke execute on function public.empresas_sugeridas(text) from public, anon;
grant execute on function public.empresas_sugeridas(text) to authenticated;

-- O logo e o link da empresa com conta, para cada "onde" do currículo (o nome já aparece para quem vê o
-- currículo; isto só liga ao perfil, que é público).
create or replace function public.empresas_do_curriculo(p_nomes text[])
returns table (pedido text, perfil_id uuid, nome text, foto_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select q.pedido, p.id, p.nome, p.foto
    from (select distinct unnest(p_nomes[1:200]) as pedido) q
    cross join lateral privado.partes_do_trabalho(q.pedido, null) pt
    join privado.empresas_nomes n on n.chave = privado.chave_empresa(pt.empresa)
    join privado.empresas e on e.id = n.empresa_id and e.tipo = 'empresa'
    join public.perfis p on p.id = e.perfil_id and (p.suspenso_ate is null or p.suspenso_ate < now())
   where auth.uid() is not null
$$;
revoke execute on function public.empresas_do_curriculo(text[]) from public, anon;
grant execute on function public.empresas_do_curriculo(text[]) to authenticated;

-- ---------------------------------------------------------------- Admin › Empresas

-- Os números do cadastro e o que decide a parte B: quantos currículos teriam pelo menos um colega pelas regras
-- da parte B (sem o emprego atual; em empresa com 30 pessoas ou mais, só a mesma época ou a mesma unidade).
create or replace function public.admin_empresas_resumo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform privado.exigir_admin();
  with
  tam as (select x.empresa_id, count(distinct x.perfil_id) as n from privado.experiencias_empresas x group by 1),
  passados as (
    select x.perfil_id, x.empresa_id, x.unidade, x.inicio, x.fim, t.n
      from privado.experiencias_empresas x
      join privado.empresas e on e.id = x.empresa_id and e.tipo = 'empresa'
      join tam t on t.empresa_id = x.empresa_id
     where not x.atual
  ),
  com_colega as (
    select distinct a.perfil_id
      from passados a
     where exists (
       select 1 from passados b
        where b.empresa_id = a.empresa_id and b.perfil_id <> a.perfil_id
          and (a.n < 30
               or (a.unidade is not null and a.unidade = b.unidade)
               or (a.inicio is not null and a.fim is not null and b.inicio is not null and b.fim is not null
                   and a.inicio <= b.fim and b.inicio <= a.fim)))
  )
  select jsonb_build_object(
    'empresas', (select count(*) from privado.empresas e where e.tipo = 'empresa'),
    'com_conta', (select count(*) from privado.empresas e where e.tipo = 'empresa' and e.perfil_id is not null),
    'nao_empresas', (select count(*) from privado.empresas e where e.tipo = 'nao_empresa'),
    'grandes', (select count(*) from tam t join privado.empresas e on e.id = t.empresa_id and e.tipo = 'empresa' where t.n >= 30),
    'curriculos', (select count(*) from public.curriculos),
    'trabalhos', (select count(*) from privado.experiencias_empresas),
    'trabalhos_em_empresa', (select count(*) from privado.experiencias_empresas x
                               join privado.empresas e on e.id = x.empresa_id and e.tipo = 'empresa'),
    -- os trabalhos numa empresa que está em 2 currículos ou mais (o cadastro já junta alguém)
    'trabalhos_juntos', (select count(*) from privado.experiencias_empresas x
                           join privado.empresas e on e.id = x.empresa_id and e.tipo = 'empresa'
                           join tam t on t.empresa_id = x.empresa_id where t.n >= 2),
    'curriculos_com_empresa', (select count(distinct x.perfil_id) from privado.experiencias_empresas x
                                 join privado.empresas e on e.id = x.empresa_id and e.tipo = 'empresa'),
    'com_colega', (select count(*) from com_colega)
  ) into v;
  return v;
end
$$;
revoke execute on function public.admin_empresas_resumo() from public, anon, authenticated;
grant execute on function public.admin_empresas_resumo() to service_role;

-- A lista: as mais citadas primeiro. Filtro: todas, com_conta, sem_conta, nao_empresa.
create or replace function public.admin_empresas(p_busca text default null, p_filtro text default 'todas',
                                                 p_limite integer default 50, p_pagina integer default 1)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k text := privado.chave_empresa(p_busca);
  lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  pag integer := greatest(coalesce(p_pagina, 1), 1);
  v jsonb;
begin
  perform privado.exigir_admin();
  with base as (
    select e.*, coalesce((select count(distinct x.perfil_id) from privado.experiencias_empresas x where x.empresa_id = e.id), 0) as pessoas
      from privado.empresas e
     where (k is null or e.chave like '%' || k || '%'
            or exists (select 1 from privado.empresas_nomes n where n.empresa_id = e.id and n.chave like '%' || k || '%'))
       and case coalesce(p_filtro, 'todas')
             when 'com_conta' then e.tipo = 'empresa' and e.perfil_id is not null
             when 'sem_conta' then e.tipo = 'empresa' and e.perfil_id is null
             when 'nao_empresa' then e.tipo = 'nao_empresa'
             else true end
  ),
  pagina as (select * from base order by pessoas desc, nome limit lim offset (pag - 1) * lim)
  select jsonb_build_object(
    'total', (select count(*) from base),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'nome', b.nome, 'chave', b.chave, 'tipo', b.tipo, 'cnpj', b.cnpj, 'cidade', b.cidade,
        'pessoas', b.pessoas,
        'perfil', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'foto_url', p.foto)
                     from public.perfis p where p.id = b.perfil_id),
        'nomes', (select coalesce(jsonb_agg(n.chave order by n.chave), '[]'::jsonb)
                    from privado.empresas_nomes n where n.empresa_id = b.id and n.chave <> b.chave),
        -- sem conta ligada: as contas de empresa com o nome parecido
        'contas_parecidas', case when b.perfil_id is null and b.tipo = 'empresa' then (
          select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'cidade', c.cidade)), '[]'::jsonb)
            from (select p.id, p.nome, p.cidade
                    from public.perfis p
                   where p.tipo in ('empresa', 'comercio', 'agencia')
                     and not exists (select 1 from privado.empresas o where o.perfil_id = p.id)
                     and extensions.similarity(privado.chave_empresa(p.nome), b.chave) >= 0.5
                   order by extensions.similarity(privado.chave_empresa(p.nome), b.chave) desc
                   limit 3) c) end
      ) order by b.pessoas desc, b.nome) from pagina b), '[]'::jsonb)
  ) into v;
  return v;
end
$$;
revoke execute on function public.admin_empresas(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_empresas(text, text, integer, integer) to service_role;

-- As possíveis repetidas: nomes parecidos (ou um começa com o outro), das mais citadas para as menos.
create or replace function public.admin_empresas_repetidas(p_limite integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform privado.exigir_admin();
  with
  tam as (select x.empresa_id, count(distinct x.perfil_id) as n from privado.experiencias_empresas x group by 1),
  e as (select e.id, e.nome, e.chave, e.perfil_id, coalesce(t.n, 0) as pessoas
          from privado.empresas e left join tam t on t.empresa_id = e.id
         where e.tipo = 'empresa'),
  -- com o índice de trigramas: os nomes parecidos e os que começam com o outro ("atacadao" e "atacadao goiania")
  candidatos as (
    select a.id as a_id, b.id as b_id
      from privado.empresas a
      join privado.empresas b on b.chave operator(extensions.%) a.chave and b.id > a.id
    union
    select least(a.id, b.id), greatest(a.id, b.id)
      from privado.empresas a
      join privado.empresas b on b.chave like a.chave || ' %'
  ),
  pares as (
    select a.id as a_id, b.id as b_id, extensions.similarity(a.chave, b.chave) as parecido
      from candidatos c
      join e a on a.id = c.a_id
      join e b on b.id = c.b_id
     where not exists (select 1 from privado.empresas_diferentes d where d.a = a.id and d.b = b.id)
       and not (a.perfil_id is not null and b.perfil_id is not null)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'a', jsonb_build_object('id', r.a_id, 'nome', r.a_nome, 'pessoas', r.a_pessoas, 'com_conta', r.a_conta),
           'b', jsonb_build_object('id', r.b_id, 'nome', r.b_nome, 'pessoas', r.b_pessoas, 'com_conta', r.b_conta),
           'parecido', round(r.parecido::numeric, 2))
         order by r.a_pessoas + r.b_pessoas desc, r.parecido desc), '[]'::jsonb)
    into v
    from (select a.id as a_id, a.nome as a_nome, a.pessoas as a_pessoas, a.perfil_id is not null as a_conta,
                 b.id as b_id, b.nome as b_nome, b.pessoas as b_pessoas, b.perfil_id is not null as b_conta, p.parecido
            from pares p
            join e a on a.id = p.a_id
            join e b on b.id = p.b_id
           where a.pessoas + b.pessoas >= 2
           order by a.pessoas + b.pessoas desc, p.parecido desc
           limit least(greatest(coalesce(p_limite, 20), 1), 100)) r;
  return v;
end
$$;
revoke execute on function public.admin_empresas_repetidas(integer) from public, anon, authenticated;
grant execute on function public.admin_empresas_repetidas(integer) to service_role;

-- Juntar: a empresa "de" passa a ser a "para" (os nomes, os trabalhos, a conta e o CNPJ, se a outra não tem).
create or replace function public.admin_empresa_juntar(p_de bigint, p_para bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  de privado.empresas;
  para privado.empresas;
begin
  perform privado.exigir_admin();
  select * into de from privado.empresas where id = p_de;
  select * into para from privado.empresas where id = p_para;
  if de.id is null or para.id is null then
    raise exception 'Não achei uma das empresas.' using errcode = 'P0001';
  end if;
  if de.id = para.id then
    raise exception 'Escolha outra empresa.' using errcode = 'P0001';
  end if;
  if de.perfil_id is not null and para.perfil_id is not null then
    raise exception 'As duas têm conta no Publike. Tire a conta de uma antes de juntar.' using errcode = 'P0001';
  end if;
  update privado.empresas_nomes set empresa_id = para.id where empresa_id = de.id;
  update privado.experiencias_empresas set empresa_id = para.id where empresa_id = de.id;
  update privado.empresas set perfil_id = null where id = de.id;
  update privado.empresas
     set perfil_id = coalesce(para.perfil_id, de.perfil_id),
         cnpj = coalesce(para.cnpj, de.cnpj),
         cidade = coalesce(para.cidade, de.cidade)
   where id = para.id;
  delete from privado.empresas where id = de.id;
  perform privado.registrar('empresa_juntar', 'empresa', para.id::text, de.nome || ' → ' || para.nome,
                            jsonb_build_object('de', de.id, 'de_nome', de.nome, 'para', para.id, 'para_nome', para.nome));
  return para.nome;
end
$$;
revoke execute on function public.admin_empresa_juntar(bigint, bigint) from public, anon, authenticated;
grant execute on function public.admin_empresa_juntar(bigint, bigint) to service_role;

-- "Não é empresa" (casa de família, autônomo…) ou de volta para empresa.
create or replace function public.admin_empresa_tipo(p_id bigint, p_tipo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  nome_dela text;
begin
  perform privado.exigir_admin();
  if p_tipo not in ('empresa', 'nao_empresa') then
    raise exception 'Pedido inválido.' using errcode = 'P0001';
  end if;
  update privado.empresas set tipo = p_tipo, perfil_id = case when p_tipo = 'nao_empresa' then null else perfil_id end
   where id = p_id
  returning nome into nome_dela;
  if nome_dela is null then
    raise exception 'Não achei a empresa.' using errcode = 'P0001';
  end if;
  perform privado.registrar('empresa_tipo', 'empresa', p_id::text,
                            nome_dela || case when p_tipo = 'nao_empresa' then ': não é empresa' else ': é empresa' end,
                            jsonb_build_object('tipo', p_tipo));
end
$$;
revoke execute on function public.admin_empresa_tipo(bigint, text) from public, anon, authenticated;
grant execute on function public.admin_empresa_tipo(bigint, text) to service_role;

-- O nome que aparece (na sugestão do currículo e no admin).
create or replace function public.admin_empresa_nome(p_id bigint, p_nome text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  depois text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  antes text;
begin
  perform privado.exigir_admin();
  if char_length(depois) not between 2 and 80 then
    raise exception 'O nome precisa ter de 2 a 80 letras.' using errcode = 'P0001';
  end if;
  select nome into antes from privado.empresas where id = p_id;
  if antes is null then
    raise exception 'Não achei a empresa.' using errcode = 'P0001';
  end if;
  update privado.empresas set nome = depois where id = p_id;
  -- o nome novo também leva a ela
  if privado.chave_empresa(depois) is not null then
    insert into privado.empresas_nomes (chave, empresa_id) values (privado.chave_empresa(depois), p_id)
    on conflict (chave) do nothing;
  end if;
  perform privado.registrar('empresa_nome', 'empresa', p_id::text, antes || ' → ' || depois,
                            jsonb_build_object('antes', antes, 'depois', depois));
  return depois;
end
$$;
revoke execute on function public.admin_empresa_nome(bigint, text) from public, anon, authenticated;
grant execute on function public.admin_empresa_nome(bigint, text) to service_role;

-- Ligar ao perfil da empresa no Publike (ou tirar, com p_perfil null).
create or replace function public.admin_empresa_ligar_perfil(p_id bigint, p_perfil uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  emp privado.empresas;
  conta public.perfis;
  outra text;
begin
  perform privado.exigir_admin();
  select * into emp from privado.empresas where id = p_id;
  if emp.id is null then
    raise exception 'Não achei a empresa.' using errcode = 'P0001';
  end if;
  if p_perfil is null then
    update privado.empresas set perfil_id = null where id = p_id;
    perform privado.registrar('empresa_perfil', 'empresa', p_id::text, emp.nome || ': sem conta', '{}'::jsonb);
    return null;
  end if;
  select * into conta from public.perfis where id = p_perfil;
  if conta.id is null or conta.tipo not in ('empresa', 'comercio', 'agencia') then
    raise exception 'Escolha uma conta de empresa, comércio ou agência.' using errcode = 'P0001';
  end if;
  select e.nome into outra from privado.empresas e where e.perfil_id = p_perfil and e.id <> p_id;
  if outra is not null then
    raise exception 'Essa conta já está ligada a "%". Junte as duas empresas.', outra using errcode = 'P0001';
  end if;
  update privado.empresas
     set perfil_id = conta.id, tipo = 'empresa', cnpj = coalesce(cnpj, conta.cnpj), cidade = coalesce(cidade, conta.cidade)
   where id = p_id;
  perform privado.registrar('empresa_perfil', 'empresa', p_id::text, emp.nome || ' → ' || conta.nome,
                            jsonb_build_object('perfil', conta.id));
  return conta.nome;
end
$$;
revoke execute on function public.admin_empresa_ligar_perfil(bigint, uuid) from public, anon, authenticated;
grant execute on function public.admin_empresa_ligar_perfil(bigint, uuid) to service_role;

-- "São diferentes": o par sai das possíveis repetidas.
create or replace function public.admin_empresas_diferentes(p_a bigint, p_b bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  insert into privado.empresas_diferentes (a, b) values (least(p_a, p_b), greatest(p_a, p_b)) on conflict do nothing;
end
$$;
revoke execute on function public.admin_empresas_diferentes(bigint, bigint) from public, anon, authenticated;
grant execute on function public.admin_empresas_diferentes(bigint, bigint) to service_role;

notify pgrst, 'reload schema';
