-- Salário do mercado (03/11/2026, claude/plano-salario-e-curriculo.md). Pode rodar de novo.
--
-- Parte 1 · Os dados. As faixas de salário por função (código CBO 2002) e região, contadas pelo robô
-- (.github/workflows/salarios.yml, scripts/salarios/) nos microdados do Novo Caged dos 12 últimos meses: só
-- contratações em Goiás, em jornada integral, sem aprendiz e sem intermitente. A região é a praça do Publike
-- ("goiania", "anapolis") ou Goiás inteiro ("go"); o robô só manda a função com 30 contratações ou mais na região.
-- Dados públicos e agregados: a faixa de uma função pode ser lida por qualquer um (salario_da_funcao).
--   * privado.salarios_mercado: a tabela inteira, trocada de uma vez a cada carga.
--   * servidor_salarios_salvar (o robô, com a chave do servidor) e admin_salarios_salvar (o upload do admin).
--   * salario_da_funcao: a faixa de uma função para uma praça, ou a de Goiás quando a praça não tem.
--   * servidor_salarios_situacao, admin_salarios_situacao, admin_salarios_de: a última carga e a busca do admin.
--
-- Parte 2 · A função (CBO) de cada vaga, numa tabela à parte (mexer no anúncio dispararia as regras de edição e a
-- moderação). Quem publicou escolhe no formulário ("Cargo na carteira"); sem escolha, o robô das filas acha pelo
-- título (as regras de src/lib/funcao-cbo.ts e, com a IA ligada, a IA, que escolhe numa lista curta da CBO). O
-- que a IA achou fica guardado por título: o mesmo título não chama a IA de novo.
--   * privado.funcoes_das_vagas e privado.funcoes_por_titulo.
--   * definir_funcao_da_vaga (quem publicou), funcoes_das_vagas (a função de vagas públicas, para qualquer um).
--   * servidor_vagas_sem_funcao, servidor_definir_funcao, servidor_funcao_guardada, servidor_guardar_funcao.
--
-- Parte 3 · No publicar, ao lado do salário, a faixa do mercado e a média das vagas parecidas no Publike
-- (media_da_funcao_no_publike: as vagas no ar da mesma função, por mês, nas cidades da praça).
--
-- Parte 4 · Em Meu currículo, "Seu currículo no mercado": a faixa da função da pessoa, as vagas que combinam, o que
-- abre mais vagas e a nota do currículo (só a própria pessoa vê). A conta é feita no site (src/lib/servidor/
-- curriculo-mercado.ts), com as vagas de servidor_vagas_do_mercado: as no ar e as dos últimos dias (para a nota),
-- com o que o match precisa, o salário e a função. Só dados de vagas públicas.

create table if not exists privado.salarios_mercado (
  regiao text not null check (regiao in ('goiania', 'anapolis', 'go')),
  cbo text not null check (cbo ~ '^[0-9]{6}$'),
  de date not null,
  ate date not null,
  n integer not null check (n >= 1),
  p25 numeric(10, 2) not null,
  p50 numeric(10, 2) not null,
  p75 numeric(10, 2) not null,
  atualizado_em timestamptz not null default now(),
  primary key (regiao, cbo),
  check (p25 <= p50 and p50 <= p75)
);
alter table privado.salarios_mercado enable row level security;
revoke all on privado.salarios_mercado from public, anon, authenticated;

-- Troca a tabela inteira (o mesmo período em todas as linhas). Devolve quantas linhas entraram.
-- p_linhas: [{regiao, cbo, n, p25, p50, p75}]
create or replace function privado.salvar_salarios(p_de date, p_ate date, p_linhas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if p_de is null or p_ate is null or p_de > p_ate or p_ate > current_date then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 or jsonb_array_length(p_linhas) > 20000 then
    raise exception 'Lista de salários inválida.' using errcode = '22023';
  end if;
  -- os valores são conferidos antes de apagar a tabela de antes (um erro no meio não deixa a tabela vazia)
  if exists (
    select 1 from jsonb_array_elements(p_linhas) l
     where coalesce(l ->> 'regiao', '') not in ('goiania', 'anapolis', 'go')
        or coalesce(l ->> 'cbo', '') !~ '^[0-9]{6}$'
        or coalesce(l ->> 'n', '') !~ '^[0-9]{1,7}$'
        or coalesce(l ->> 'p25', '') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$'
        or coalesce(l ->> 'p50', '') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$'
        or coalesce(l ->> 'p75', '') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$'
        or (l ->> 'p25')::numeric > (l ->> 'p50')::numeric
        or (l ->> 'p50')::numeric > (l ->> 'p75')::numeric
        or (l ->> 'p25')::numeric < 100
  ) then
    raise exception 'Há linha com valor inválido na lista de salários.' using errcode = '22023';
  end if;
  delete from privado.salarios_mercado where true;
  insert into privado.salarios_mercado (regiao, cbo, de, ate, n, p25, p50, p75)
  select l ->> 'regiao', l ->> 'cbo', p_de, p_ate, (l ->> 'n')::integer,
         (l ->> 'p25')::numeric, (l ->> 'p50')::numeric, (l ->> 'p75')::numeric
    from jsonb_array_elements(p_linhas) l
  on conflict (regiao, cbo) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;
revoke execute on function privado.salvar_salarios(date, date, jsonb) from public, anon, authenticated;

-- O robô (com a chave do servidor)
create or replace function public.servidor_salarios_salvar(p_chave text, p_de date, p_ate date, p_linhas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return privado.salvar_salarios(p_de, p_ate, p_linhas);
end
$$;

-- O último mês carregado (o robô só trabalha quando sai um mês novo)
create or replace function public.servidor_salarios_situacao(p_chave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (select jsonb_build_object('de', min(s.de), 'ate', max(s.ate), 'linhas', count(*),
                                    'atualizado_em', max(s.atualizado_em))
            from privado.salarios_mercado s);
end
$$;

revoke execute on function public.servidor_salarios_salvar(text, date, date, jsonb),
  public.servidor_salarios_situacao(text) from public;
grant execute on function public.servidor_salarios_salvar(text, date, date, jsonb),
  public.servidor_salarios_situacao(text) to anon, authenticated, service_role;

-- O upload do admin (o plano B: o script rodou no computador)
create or replace function public.admin_salarios_salvar(p_de date, p_ate date, p_linhas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return privado.salvar_salarios(p_de, p_ate, p_linhas);
end
$$;

-- A situação para o admin: a última carga e quantas funções têm faixa em cada região
create or replace function public.admin_salarios_situacao()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'de', min(s.de), 'ate', max(s.ate), 'atualizado_em', max(s.atualizado_em), 'linhas', count(*),
    'goiania', count(*) filter (where s.regiao = 'goiania'),
    'anapolis', count(*) filter (where s.regiao = 'anapolis'),
    'go', count(*) filter (where s.regiao = 'go'))
    from privado.salarios_mercado s
$$;

-- As faixas de algumas funções, em todas as regiões (a busca do admin)
create or replace function public.admin_salarios_de(p_cbos text[])
returns table (regiao text, cbo text, de date, ate date, n integer, p25 numeric, p50 numeric, p75 numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select s.regiao, s.cbo, s.de, s.ate, s.n, s.p25, s.p50, s.p75
    from privado.salarios_mercado s
   where s.cbo = any (coalesce(p_cbos, '{}'))
   order by s.cbo, case s.regiao when 'goiania' then 0 when 'anapolis' then 1 else 2 end
$$;

revoke execute on function public.admin_salarios_salvar(date, date, jsonb), public.admin_salarios_situacao(),
  public.admin_salarios_de(text[]) from public, anon, authenticated;
grant execute on function public.admin_salarios_salvar(date, date, jsonb), public.admin_salarios_situacao(),
  public.admin_salarios_de(text[]) to service_role;

-- A faixa de uma função para quem vê: a da praça ("goiania" ou "anapolis"); sem ela, a de Goiás ("go").
-- Nada quando nenhuma das duas tem (o robô só manda a função com 30 contratações ou mais na região).
create or replace function public.salario_da_funcao(p_cbo text, p_regiao text default 'goiania')
returns table (regiao text, cbo text, de date, ate date, n integer, p25 numeric, p50 numeric, p75 numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select s.regiao, s.cbo, s.de, s.ate, s.n, s.p25, s.p50, s.p75
    from privado.salarios_mercado s
   where s.cbo = p_cbo and s.regiao in (coalesce(p_regiao, 'goiania'), 'go')
   order by (s.regiao = 'go')
   limit 1
$$;
revoke execute on function public.salario_da_funcao(text, text) from public;
grant execute on function public.salario_da_funcao(text, text) to anon, authenticated, service_role;

-- Parte 2 · A função (CBO) de cada vaga ------------------------------------------------------------------------

create table if not exists privado.funcoes_das_vagas (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  cbo text check (cbo is null or cbo ~ '^[0-9]{6}$'),
  -- empresa: quem publicou escolheu (o robô não troca); regra e ia: o robô achou; nenhuma: o robô não achou
  origem text not null check (origem in ('empresa', 'regra', 'ia', 'nenhuma')),
  atualizado_em timestamptz not null default now()
);
alter table privado.funcoes_das_vagas enable row level security;
revoke all on privado.funcoes_das_vagas from public, anon, authenticated;

create table if not exists privado.funcoes_por_titulo (
  -- o título sem acento, em minúsculas (src/lib/cbo.ts, normalizarTexto)
  titulo text primary key check (char_length(titulo) between 1 and 120),
  cbo text check (cbo is null or cbo ~ '^[0-9]{6}$'),
  origem text not null check (origem in ('ia', 'nenhuma')),
  criado_em timestamptz not null default now()
);
alter table privado.funcoes_por_titulo enable row level security;
revoke all on privado.funcoes_por_titulo from public, anon, authenticated;

-- Quem publicou (ou a equipe da agência) escolhe a função da vaga; null tira a escolha (o robô volta a sugerir).
create or replace function public.definir_funcao_da_vaga(p_anuncio uuid, p_cbo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_cbo is not null and p_cbo !~ '^[0-9]{6}$' then
    raise exception 'Função inválida.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.anuncios a
                  where a.id = p_anuncio and a.tipo = 'vaga' and a.autor_id = public.conta_atual()) then
    raise exception 'Vaga não encontrada.' using errcode = 'P0002';
  end if;
  if p_cbo is null then
    delete from privado.funcoes_das_vagas where anuncio_id = p_anuncio;
  else
    insert into privado.funcoes_das_vagas (anuncio_id, cbo, origem) values (p_anuncio, p_cbo, 'empresa')
    on conflict (anuncio_id) do update set cbo = excluded.cbo, origem = 'empresa', atualizado_em = now();
  end if;
end
$$;
revoke execute on function public.definir_funcao_da_vaga(uuid, text) from public, anon;
grant execute on function public.definir_funcao_da_vaga(uuid, text) to authenticated;

-- A função das vagas (a ocupação de uma vaga pública: qualquer um pode ler), e de onde veio.
create or replace function public.funcoes_das_vagas(p_ids uuid[])
returns table (anuncio_id uuid, cbo text, origem text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.anuncio_id, f.cbo, f.origem
    from privado.funcoes_das_vagas f
   where f.anuncio_id = any (coalesce(p_ids, '{}')) and f.cbo is not null
   limit 1000
$$;
revoke execute on function public.funcoes_das_vagas(uuid[]) from public;
grant execute on function public.funcoes_das_vagas(uuid[]) to anon, authenticated, service_role;

-- O robô das filas: as vagas sem função (as mais novas primeiro)
create or replace function public.servidor_vagas_sem_funcao(p_chave text, p_limite integer default 20)
returns table (id uuid, titulo text, descricao text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select a.id, a.titulo, left(a.descricao, 600)
    from public.anuncios a
   where a.tipo = 'vaga' and a.status in ('ativo', 'pausado', 'em_analise')
     -- a que não achou função volta depois de 7 dias (a IA pode ter sido ligada, a regra pode ter mudado)
     and not exists (select 1 from privado.funcoes_das_vagas f
                      where f.anuncio_id = a.id and (f.origem <> 'nenhuma' or f.atualizado_em > now() - interval '7 days'))
   order by a.criado_em desc
   limit least(greatest(coalesce(p_limite, 20), 1), 100);
end
$$;

-- O robô grava o que achou (nunca troca a escolha da empresa)
create or replace function public.servidor_definir_funcao(p_chave text, p_anuncio uuid, p_cbo text, p_origem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if p_origem not in ('regra', 'ia', 'nenhuma') or (p_cbo is not null and p_cbo !~ '^[0-9]{6}$') then
    raise exception 'Função inválida.' using errcode = '22023';
  end if;
  insert into privado.funcoes_das_vagas (anuncio_id, cbo, origem) values (p_anuncio, p_cbo, p_origem)
  on conflict (anuncio_id) do update set cbo = excluded.cbo, origem = excluded.origem, atualizado_em = now()
   where privado.funcoes_das_vagas.origem <> 'empresa';
end
$$;

-- O que a IA já achou para um título (uma linha: achou; nenhuma linha: ainda não perguntou)
create or replace function public.servidor_funcao_guardada(p_chave text, p_titulo text)
returns table (cbo text, origem text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query select t.cbo, t.origem from privado.funcoes_por_titulo t where t.titulo = left(p_titulo, 120);
end
$$;

create or replace function public.servidor_guardar_funcao(p_chave text, p_titulo text, p_cbo text, p_origem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if p_origem not in ('ia', 'nenhuma') or (p_cbo is not null and p_cbo !~ '^[0-9]{6}$')
     or coalesce(btrim(p_titulo), '') = '' then
    raise exception 'Função inválida.' using errcode = '22023';
  end if;
  insert into privado.funcoes_por_titulo (titulo, cbo, origem) values (left(p_titulo, 120), p_cbo, p_origem)
  on conflict (titulo) do update set cbo = excluded.cbo, origem = excluded.origem, criado_em = now();
end
$$;

revoke execute on function public.servidor_vagas_sem_funcao(text, integer),
  public.servidor_definir_funcao(text, uuid, text, text), public.servidor_funcao_guardada(text, text),
  public.servidor_guardar_funcao(text, text, text, text) from public;
grant execute on function public.servidor_vagas_sem_funcao(text, integer),
  public.servidor_definir_funcao(text, uuid, text, text), public.servidor_funcao_guardada(text, text),
  public.servidor_guardar_funcao(text, text, text, text) to anon, authenticated, service_role;

-- Parte 3 · A média do que as vagas parecidas oferecem no Publike (as vagas no ar da mesma função, com salário por
-- mês, nas cidades da praça; sem as da própria conta). Só números de vagas públicas.
drop function if exists public.media_da_funcao_no_publike(text, text[]);
create or replace function public.media_da_funcao_no_publike(p_cbo text, p_cidades text[], p_sem_autor uuid default null)
returns table (n integer, media numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer, round(avg(a.pagamento_valor), 2)
    from public.anuncios a
    join privado.funcoes_das_vagas f on f.anuncio_id = a.id
   where f.cbo = p_cbo and a.tipo = 'vaga' and a.status = 'ativo' and a.expira_em > now()
     and a.preenchida_em is null and a.pagamento_valor is not null and a.pagamento_unidade = 'mes'
     and a.cidade = any (coalesce(p_cidades, '{}'))
     and (p_sem_autor is null or a.autor_id <> p_sem_autor)
$$;
revoke execute on function public.media_da_funcao_no_publike(text, text[], uuid) from public;
grant execute on function public.media_da_funcao_no_publike(text, text[], uuid) to anon, authenticated, service_role;

-- Parte 4 · As vagas para "Seu currículo no mercado": as no ar (de qualquer data) e as que saíram, mas foram
-- publicadas nos últimos p_dias (a nota olha o mercado dos últimos 60 dias). Sem as em análise, as removidas e as
-- de contas suspensas. A descrição vai cortada: o match só procura nela os cursos e as habilidades citados.
create or replace function public.servidor_vagas_do_mercado(p_chave text, p_dias integer default 60)
returns table (id uuid, autor_id uuid, titulo text, descricao text, escolaridade_minima text, experiencia text,
               cnh text, cidade text, bairro text, jornada text, horario_detalhe jsonb, horario text,
               pagamento_valor numeric, pagamento_unidade text, cbo text, criado_em timestamptz, no_ar boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select a.id, a.autor_id, a.titulo, left(a.descricao, 1500), a.escolaridade_minima, a.experiencia, a.cnh,
         a.cidade, a.bairro, a.jornada, to_jsonb(a.horario_detalhe), a.horario, a.pagamento_valor,
         a.pagamento_unidade, f.cbo, a.criado_em,
         (a.status = 'ativo' and a.preenchida_em is null and a.expira_em > now())
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join privado.funcoes_das_vagas f on f.anuncio_id = a.id
   where a.tipo = 'vaga' and a.status in ('ativo', 'pausado', 'encerrado', 'expirado')
     and not coalesce(p.suspenso_ate > now(), false)
     and ((a.status = 'ativo' and a.preenchida_em is null and a.expira_em > now())
          or a.criado_em > now() - make_interval(days => least(greatest(coalesce(p_dias, 60), 1), 120)))
   order by a.criado_em desc
   limit 1500;
end
$$;
revoke execute on function public.servidor_vagas_do_mercado(text, integer) from public;
grant execute on function public.servidor_vagas_do_mercado(text, integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
