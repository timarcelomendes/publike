-- A base de empresas da Receita (claude/plano-base-de-empresas-da-receita.md, parte 0; 15/11/2026, Marcelo: "vamos lá").
-- O robô do GitHub (.github/workflows/empresas.yml) baixa os dados abertos do CNPJ todo mês, fica só com o que serve e
-- manda para o site (POST /api/empresas), que grava aqui:
--   * privado.empresas_receita: os estabelecimentos ativos das cidades das praças (sem MEI) e as agências de RH de
--     Goiás inteiro, com o ponto no mapa pelo CNEFE do IBGE;
--   * privado.mei_por_bairro: do MEI, só as contagens de abertura por bairro e ramo (o endereço do MEI quase sempre é a
--     casa da pessoa);
--   * privado.ramos_funcoes: do Caged, quantas contratações cada ramo (subclasse do CNAE) fez de cada função (CBO) em
--     Goiás nos últimos 12 meses (o robô dos salários manda);
--   * privado.ramos_do_publike: a categoria do Publike de cada ramo (preenchida à mão, na parte 3);
--   * privado.cargas_receita: cada carga mensal.
-- Nada de sócios nem CPF. Telefone e e-mail só para a equipe (as funções do site nunca devolvem). Pode rodar de novo.

create table if not exists privado.empresas_receita (
  cnpj text primary key check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  cnpj_basico text not null,
  matriz boolean not null default true,
  -- o nome fantasia; sem ele, a razão social (nunca a do empresário individual, que é o nome de uma pessoa)
  nome text not null,
  razao_social text,
  -- o nome sem acento e em minúsculas, para a busca por nome
  busca text not null,
  data_abertura date,
  cnae text check (cnae ~ '^[0-9]{7}$'),
  cnaes_secundarios text[] not null default '{}',
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cep text check (cep ~ '^[0-9]{8}$'),
  cidade text not null,
  uf text not null default 'GO',
  local extensions.geography(point, 4326),
  -- endereco: o número achado no CNEFE; cep: o meio do CEP
  precisao text check (precisao in ('endereco', 'cep')),
  porte text check (porte in ('micro', 'pequena', 'demais')),
  natureza text,
  capital_social numeric(16, 2),
  telefone text,
  email text,
  -- a cidade é de uma praça do Publike (as agências de fora das praças entram com false)
  na_praca boolean not null default true,
  agencia boolean not null default false,
  mes_carga date not null,
  situacao text not null default 'ativa' check (situacao in ('ativa', 'fora')),
  fora_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create index if not exists empresas_receita_local_idx on privado.empresas_receita using gist (local)
  where situacao = 'ativa';
create index if not exists empresas_receita_busca_idx on privado.empresas_receita
  using gin (busca extensions.gin_trgm_ops) where situacao = 'ativa';
create index if not exists empresas_receita_abertura_idx on privado.empresas_receita (data_abertura desc)
  where situacao = 'ativa';
create index if not exists empresas_receita_cnae_idx on privado.empresas_receita (cnae) where situacao = 'ativa';
create index if not exists empresas_receita_basico_idx on privado.empresas_receita (cnpj_basico);
create index if not exists empresas_receita_agencia_idx on privado.empresas_receita (agencia) where agencia;
alter table privado.empresas_receita enable row level security;
revoke all on privado.empresas_receita from public, anon, authenticated;

create table if not exists privado.mei_por_bairro (
  cidade text not null,
  bairro text not null,
  cnae text not null,
  mes_abertura date not null,
  quantos integer not null check (quantos > 0),
  mes_carga date not null,
  primary key (cidade, bairro, cnae, mes_abertura)
);
alter table privado.mei_por_bairro enable row level security;
revoke all on privado.mei_por_bairro from public, anon, authenticated;

create table if not exists privado.ramos_funcoes (
  cnae text not null check (cnae ~ '^[0-9]{7}$'),
  cbo text not null check (cbo ~ '^[0-9]{6}$'),
  contratacoes integer not null check (contratacoes > 0),
  atualizado_em timestamptz not null default now(),
  primary key (cnae, cbo)
);
create index if not exists ramos_funcoes_cbo_idx on privado.ramos_funcoes (cbo);
alter table privado.ramos_funcoes enable row level security;
revoke all on privado.ramos_funcoes from public, anon, authenticated;

create table if not exists privado.ramos_do_publike (
  cnae text primary key check (cnae ~ '^[0-9]{7}$'),
  nome text not null,
  categoria text
);
alter table privado.ramos_do_publike enable row level security;
revoke all on privado.ramos_do_publike from public, anon, authenticated;

create table if not exists privado.cargas_receita (
  mes date primary key,
  comecou_em timestamptz not null default now(),
  terminou_em timestamptz,
  situacao text not null default 'carregando' check (situacao in ('carregando', 'pronta')),
  estabelecimentos integer not null default 0,
  resumo jsonb not null default '{}'
);
alter table privado.cargas_receita enable row level security;
revoke all on privado.cargas_receita from public, anon, authenticated;

drop function if exists public.servidor_empresas_fim(text, date, jsonb, jsonb);
alter table privado.mei_por_bairro add column if not exists mes_carga date;

-- 1. O robô: o que o site já tem ------------------------------------------------------------------------------------

create or replace function public.servidor_empresas_situacao(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return jsonb_build_object(
    'pronta', (select to_char(max(c.mes), 'YYYY-MM') from privado.cargas_receita c where c.situacao = 'pronta'),
    'carregando', (select to_char(max(c.mes), 'YYYY-MM') from privado.cargas_receita c where c.situacao = 'carregando'),
    'ramos', (select count(*) from privado.ramos_funcoes));
end
$$;

-- 2. O robô: um lote de estabelecimentos (até 2.000) -----------------------------------------------------------------

create or replace function public.servidor_empresas_lote(p_chave text, p_mes date, p_linhas jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform privado.exigir_servidor(p_chave);
  if p_mes is null or extract(day from p_mes) <> 1 then
    raise exception 'Mês inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) > 2000 then
    raise exception 'Mande de 1 a 2.000 linhas.' using errcode = '22023';
  end if;
  -- carregar de novo um mês pronto (o "refazer" do robô) volta a carga para "carregando"
  insert into privado.cargas_receita as c (mes) values (p_mes)
  on conflict (mes) do update
    set situacao = 'carregando', terminou_em = null,
        comecou_em = case when c.situacao = 'pronta' then now() else c.comecou_em end
    where c.situacao = 'pronta';
  insert into privado.empresas_receita as e (
    cnpj, cnpj_basico, matriz, nome, razao_social, busca, data_abertura, cnae, cnaes_secundarios, logradouro, numero,
    complemento, bairro, cep, cidade, uf, local, precisao, porte, natureza, capital_social, telefone, email, na_praca,
    agencia, mes_carga, situacao, fora_em, atualizado_em)
  select l ->> 'cnpj', l ->> 'cnpj_basico', coalesce((l ->> 'matriz')::boolean, true),
         left(l ->> 'nome', 160), left(nullif(l ->> 'razao_social', ''), 200), left(l ->> 'busca', 200),
         nullif(l ->> 'data_abertura', '')::date, nullif(l ->> 'cnae', ''),
         coalesce(array(select jsonb_array_elements_text(l -> 'cnaes_secundarios')), '{}'),
         left(nullif(l ->> 'logradouro', ''), 160), left(nullif(l ->> 'numero', ''), 20),
         left(nullif(l ->> 'complemento', ''), 120), left(nullif(l ->> 'bairro', ''), 80), nullif(l ->> 'cep', ''),
         l ->> 'cidade', coalesce(nullif(l ->> 'uf', ''), 'GO'),
         case when (l ->> 'lat') is not null and (l ->> 'lng') is not null
              then extensions.st_setsrid(extensions.st_makepoint((l ->> 'lng')::float8, (l ->> 'lat')::float8), 4326)::extensions.geography
         end,
         nullif(l ->> 'precisao', ''), nullif(l ->> 'porte', ''), nullif(l ->> 'natureza', ''),
         nullif(l ->> 'capital_social', '')::numeric, left(nullif(l ->> 'telefone', ''), 40),
         left(nullif(l ->> 'email', ''), 160), coalesce((l ->> 'na_praca')::boolean, true),
         coalesce((l ->> 'agencia')::boolean, false), p_mes, 'ativa', null, now()
    from (select distinct on (x ->> 'cnpj') x as l from jsonb_array_elements(p_linhas) x) d
   where (l ->> 'cnpj') ~ '^[0-9A-Z]{12}[0-9]{2}$' and coalesce(l ->> 'nome', '') <> '' and coalesce(l ->> 'cidade', '') <> ''
  on conflict (cnpj) do update
    set cnpj_basico = excluded.cnpj_basico, matriz = excluded.matriz, nome = excluded.nome,
        razao_social = excluded.razao_social, busca = excluded.busca, data_abertura = excluded.data_abertura,
        cnae = excluded.cnae, cnaes_secundarios = excluded.cnaes_secundarios, logradouro = excluded.logradouro,
        numero = excluded.numero, complemento = excluded.complemento, bairro = excluded.bairro, cep = excluded.cep,
        cidade = excluded.cidade, uf = excluded.uf, local = coalesce(excluded.local, e.local),
        precisao = case when excluded.local is null then e.precisao else excluded.precisao end,
        porte = excluded.porte, natureza = excluded.natureza, capital_social = excluded.capital_social,
        telefone = excluded.telefone, email = excluded.email, na_praca = excluded.na_praca, agencia = excluded.agencia,
        mes_carga = excluded.mes_carga, situacao = 'ativa', fora_em = null, atualizado_em = now();
  get diagnostics n = row_count;
  return n;
end
$$;

-- 3. O robô: as contagens do MEI (um lote de até 5.000) --------------------------------------------------------------

create or replace function public.servidor_empresas_meis(p_chave text, p_mes date, p_linhas jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform privado.exigir_servidor(p_chave);
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) > 5000 then
    raise exception 'Mande de 1 a 5.000 linhas.' using errcode = '22023';
  end if;
  -- carregar de novo um mês pronto (o "refazer" do robô) volta a carga para "carregando"
  insert into privado.cargas_receita as c (mes) values (p_mes)
  on conflict (mes) do update
    set situacao = 'carregando', terminou_em = null,
        comecou_em = case when c.situacao = 'pronta' then now() else c.comecou_em end
    where c.situacao = 'pronta';
  -- o robô já manda cada contagem uma vez só (somada); mandar o mesmo lote de novo não soma em dobro
  insert into privado.mei_por_bairro as m (cidade, bairro, cnae, mes_abertura, quantos, mes_carga)
  select x.cidade, x.bairro, x.cnae, x.mes_abertura, sum(x.quantos), p_mes
    from (select l ->> 'cidade' as cidade, left(coalesce(nullif(l ->> 'bairro', ''), '(sem bairro)'), 80) as bairro,
                 l ->> 'cnae' as cnae, (l ->> 'mes_abertura')::date as mes_abertura, (l ->> 'quantos')::integer as quantos
            from jsonb_array_elements(p_linhas) l
           where (l ->> 'cnae') ~ '^[0-9]{7}$' and (l ->> 'mes_abertura') ~ '^\d{4}-\d{2}-01$'
             and coalesce((l ->> 'quantos')::integer, 0) > 0 and coalesce(l ->> 'cidade', '') <> '') x
   group by x.cidade, x.bairro, x.cnae, x.mes_abertura
  on conflict (cidade, bairro, cnae, mes_abertura) do update
    set quantos = excluded.quantos, mes_carga = p_mes;
  get diagnostics n = row_count;
  return n;
end
$$;

-- 3b. O robô: os nomes dos ramos (a tabela de CNAE da Receita; a categoria do Publike não muda) -----------------------

create or replace function public.servidor_ramos_nomes(p_chave text, p_linhas jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform privado.exigir_servidor(p_chave);
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) > 5000 then
    raise exception 'Mande de 1 a 5.000 ramos.' using errcode = '22023';
  end if;
  insert into privado.ramos_do_publike as r (cnae, nome)
  select l ->> 'cnae', left(l ->> 'nome', 200)
    from jsonb_array_elements(p_linhas) l
   where (l ->> 'cnae') ~ '^[0-9]{7}$' and coalesce(l ->> 'nome', '') <> ''
  on conflict (cnae) do update set nome = excluded.nome;
  get diagnostics n = row_count;
  return n;
end
$$;

-- 4. O robô: o fim da carga (quem não veio sai; o resumo) ---------------------------------------

create or replace function public.servidor_empresas_fim(p_chave text, p_mes date, p_resumo jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fora integer;
  v_ativas integer;
begin
  perform privado.exigir_servidor(p_chave);
  if not exists (select 1 from privado.cargas_receita c where c.mes = p_mes) then
    raise exception 'Essa carga não começou.' using errcode = 'P0002';
  end if;
  -- quem não veio nesta carga fechou, deixou de estar ativo ou saiu da conta (o MEI): fica marcado, não some
  update privado.empresas_receita e set situacao = 'fora', fora_em = now()
   where e.situacao = 'ativa'
     and (e.mes_carga < p_mes
          or e.atualizado_em < (select c.comecou_em from privado.cargas_receita c where c.mes = p_mes));
  get diagnostics v_fora = row_count;
  -- as contagens do MEI de cargas antigas saem (as desta vieram por servidor_empresas_meis)
  delete from privado.mei_por_bairro m where m.mes_carga < p_mes;
  -- o mês que nunca termina (o robô parou no meio) não apaga nada: só o fim apaga
  select count(*) into v_ativas from privado.empresas_receita e where e.situacao = 'ativa';
  update privado.cargas_receita c
     set situacao = 'pronta', terminou_em = now(), estabelecimentos = v_ativas,
         resumo = coalesce(p_resumo, '{}'::jsonb) || jsonb_build_object('fora', v_fora)
   where c.mes = p_mes;
  return jsonb_build_object('ativas', v_ativas, 'fora', v_fora);
end
$$;

-- 5. O robô dos salários: o Caged por ramo e função (troca a tabela inteira) ------------------------------------------

create or replace function public.servidor_ramos_salvar(p_chave text, p_linhas jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform privado.exigir_servidor(p_chave);
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0
     or jsonb_array_length(p_linhas) > 200000 then
    raise exception 'Mande a lista dos ramos.' using errcode = '22023';
  end if;
  delete from privado.ramos_funcoes;
  insert into privado.ramos_funcoes (cnae, cbo, contratacoes)
  select l ->> 'cnae', l ->> 'cbo', (l ->> 'contratacoes')::integer
    from jsonb_array_elements(p_linhas) l
   where (l ->> 'cnae') ~ '^[0-9]{7}$' and (l ->> 'cbo') ~ '^[0-9]{6}$' and coalesce((l ->> 'contratacoes')::integer, 0) > 0
  on conflict (cnae, cbo) do update set contratacoes = excluded.contratacoes, atualizado_em = now();
  get diagnostics n = row_count;
  return n;
end
$$;

-- 6. O Admin: o resumo da base ---------------------------------------------------------------------------------------

create or replace function public.admin_empresas_receita()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'cargas', coalesce((select jsonb_agg(jsonb_build_object('mes', c.mes, 'situacao', c.situacao,
                          'comecou_em', c.comecou_em, 'terminou_em', c.terminou_em,
                          'estabelecimentos', c.estabelecimentos, 'resumo', c.resumo) order by c.mes desc)
                        from (select * from privado.cargas_receita order by mes desc limit 6) c), '[]'::jsonb),
    'ativas', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa'),
    'na_praca', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.na_praca),
    'com_ponto', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.local is not null),
    'agencias', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.agencia),
    'abertas_60_dias', (select count(*) from privado.empresas_receita e
                         where e.situacao = 'ativa' and e.na_praca and e.data_abertura >= current_date - 60),
    'por_cidade', coalesce((select jsonb_agg(jsonb_build_object('cidade', x.cidade, 'quantas', x.n) order by x.n desc)
                             from (select e.cidade, count(*) as n from privado.empresas_receita e
                                    where e.situacao = 'ativa' and e.na_praca group by e.cidade) x), '[]'::jsonb),
    'meis', (select coalesce(sum(m.quantos), 0) from privado.mei_por_bairro m),
    'meis_60_dias', (select coalesce(sum(m.quantos), 0) from privado.mei_por_bairro m
                      where m.mes_abertura >= date_trunc('month', current_date - 60)),
    'ramos_com_nome', (select count(*) from privado.ramos_do_publike),
    'ramos_funcoes', (select count(*) from privado.ramos_funcoes));
end
$$;

revoke execute on function public.servidor_empresas_situacao(text), public.servidor_empresas_lote(text, date, jsonb),
  public.servidor_empresas_meis(text, date, jsonb), public.servidor_ramos_nomes(text, jsonb),
  public.servidor_empresas_fim(text, date, jsonb), public.servidor_ramos_salvar(text, jsonb) from public;
-- o site chama com a chave pública e a chave do servidor (como as outras funções do servidor)
grant execute on function public.servidor_empresas_situacao(text), public.servidor_empresas_lote(text, date, jsonb),
  public.servidor_empresas_meis(text, date, jsonb), public.servidor_ramos_nomes(text, jsonb),
  public.servidor_empresas_fim(text, date, jsonb), public.servidor_ramos_salvar(text, jsonb)
  to anon, authenticated, service_role;
revoke execute on function public.admin_empresas_receita() from public, anon;
grant execute on function public.admin_empresas_receita() to authenticated, service_role;

-- a tela na lista de Admin › Quem vê cada tela (só a equipe publike.org)
insert into privado.telas_do_admin (rota, somente_publike) values ('/admin/receita', true)
on conflict (rota) do nothing;

notify pgrst, 'reload schema';
