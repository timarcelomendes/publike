-- A leitura do currículo, etapa 1 dos currículos qualificados (21/11/2026; claude/plano-curriculos-qualificados.md).
-- Uma IA de qualidade superior lê o currículo inteiro uma vez e guarda:
--   * até 3 funções indicadas (ocupação da CBO, escolhida numa lista; nunca um código inventado), cada uma
--     "pronto" (pronto para assumir) ou "treinamento" (com treinamento), com o porquê curto;
--   * a nota do currículo, de 0 a 100, e até 3 pontos a melhorar.
-- Decisão do Marcelo (21/11): só os currículos visíveis em Talentos (a pessoa escolheu mostrar às empresas), sem nome,
-- foto, bairro nem contato. A nota e os pontos a melhorar são só da pessoa; as empresas acham pela função indicada
-- (a busca de Talentos passa a olhar também os nomes das funções indicadas). A pessoa pode tirar uma função
-- ("Não é isso? Corrigir"), que não volta. O robô fica desligado até o admin ligar, com o modelo escolhido depois da
-- comparação Sonnet x Opus (Admin › Qualificados).
--
-- Pode rodar de novo.

-- 1. O que a IA leu ---------------------------------------------------------------------------------------------

create table if not exists privado.leituras_curriculo (
  perfil_id uuid primary key references public.perfis (id) on delete cascade,
  -- a impressão do currículo lido: muda o currículo, lê de novo
  impressao text not null check (impressao ~ '^[0-9a-f]{32}$'),
  -- [{cbo: "411005", nome: "Auxiliar administrativo", nivel: "pronto"|"treinamento", porque: "..."}]
  funcoes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(funcoes) = 'array' and jsonb_array_length(funcoes) <= 3 and octet_length(funcoes::text) <= 2000),
  -- as funções que a pessoa tirou (não voltam, nem numa leitura nova)
  tiradas text[] not null default '{}' check (cardinality(tiradas) <= 20),
  nota smallint check (nota between 0 and 100),
  melhorar text[] not null default '{}' check (cardinality(melhorar) <= 3),
  modelo text check (char_length(modelo) <= 60),
  lido_em timestamptz not null default now()
);
create index if not exists leituras_curriculo_funcoes_idx on privado.leituras_curriculo using gin (funcoes jsonb_path_ops);
alter table privado.leituras_curriculo enable row level security;
revoke all on privado.leituras_curriculo from public, anon, authenticated;

create table if not exists privado.config_leitura (
  id boolean primary key default true check (id),
  ligado boolean not null default false,
  modelo text check (modelo is null or char_length(modelo) <= 60),
  atualizado_em timestamptz not null default now()
);
insert into privado.config_leitura (id) values (true) on conflict (id) do nothing;
alter table privado.config_leitura enable row level security;
revoke all on privado.config_leitura from public, anon, authenticated;

-- A impressão do que a IA lê (sem nome, foto, bairro nem contato: o currículo não tem contato)
create or replace function privado.impressao_do_curriculo(c public.curriculos)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws('|', c.titulo, c.experiencias::text, c.escolaridade, c.curso, c.estudos::text,
                       array_to_string(c.cursos, ','), array_to_string(c.habilidades, ','), c.cnh,
                       array_to_string(c.disponibilidade, ',')))
$$;

-- Quem entra: currículo visível em Talentos, de pessoa, conta não suspensa, com alguma coisa escrita
create or replace function privado.curriculo_para_leitura(p_perfil uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.curriculo_na_vitrine n
      join public.curriculos c on c.perfil_id = n.perfil_id
      join public.perfis p on p.id = n.perfil_id
     where n.perfil_id = p_perfil
       and p.tipo = 'pessoa'
       and (p.suspenso_ate is null or p.suspenso_ate < now())
       and (coalesce(c.titulo, '') <> '' or jsonb_array_length(c.experiencias) > 0 or cardinality(c.cursos) > 0
            or c.escolaridade is not null))
$$;

-- 2. O robô (as filas) ------------------------------------------------------------------------------------------

-- A configuração: ligado e o modelo (sem a migração ou desligado, nada é lido)
create or replace function public.servidor_config_leitura(p_chave text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (select jsonb_build_object('ligado', c.ligado, 'modelo', c.modelo) from privado.config_leitura c where c.id);
end
$$;

-- Os currículos que faltam ler (novos ou mudados), os mais recentes primeiro
create or replace function public.servidor_curriculos_para_leitura(p_chave text, p_limite integer default 6)
returns table (perfil_id uuid, impressao text, titulo text, experiencias jsonb, escolaridade text, curso text,
               estudos jsonb, cursos text[], habilidades text[], cnh text, disponibilidade text[], tiradas text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select c.perfil_id, privado.impressao_do_curriculo(c), c.titulo, c.experiencias, c.escolaridade, c.curso,
         c.estudos, c.cursos, c.habilidades, c.cnh, c.disponibilidade, coalesce(l.tiradas, '{}')
    from public.curriculos c
    left join privado.leituras_curriculo l on l.perfil_id = c.perfil_id
   where privado.curriculo_para_leitura(c.perfil_id)
     and (l.perfil_id is null or l.impressao <> privado.impressao_do_curriculo(c))
   order by c.atualizado_em desc
   limit least(greatest(coalesce(p_limite, 6), 1), 30);
end
$$;

-- Guarda o que a IA leu (as funções tiradas pela pessoa ficam de fora)
create or replace function public.servidor_guardar_leitura(
  p_chave text,
  p_perfil uuid,
  p_impressao text,
  p_funcoes jsonb,
  p_nota integer,
  p_melhorar text[],
  p_modelo text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  tiradas text[] := coalesce((select l.tiradas from privado.leituras_curriculo l where l.perfil_id = p_perfil), '{}');
  limpas jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  if jsonb_typeof(coalesce(p_funcoes, '[]'::jsonb)) <> 'array' then
    raise exception 'funções inválidas' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'cbo', f ->> 'cbo',
           'nome', left(f ->> 'nome', 80),
           'nivel', f ->> 'nivel',
           'porque', left(coalesce(f ->> 'porque', ''), 200))), '[]'::jsonb)
    into limpas
    from (select f from jsonb_array_elements(p_funcoes) f
           where f ->> 'cbo' ~ '^[0-9]{6}$' and f ->> 'nivel' in ('pronto', 'treinamento')
             and coalesce(f ->> 'nome', '') <> '' and not ((f ->> 'cbo') = any (tiradas))
           limit 3) x;
  insert into privado.leituras_curriculo (perfil_id, impressao, funcoes, tiradas, nota, melhorar, modelo, lido_em)
  values (p_perfil, p_impressao, limpas, tiradas, least(greatest(p_nota, 0), 100),
          (select coalesce(array_agg(left(m, 220)), '{}') from (select unnest(p_melhorar[1:3]) m) x
            where coalesce(trim(m), '') <> ''),
          left(p_modelo, 60), now())
  on conflict (perfil_id) do update
     set impressao = excluded.impressao, funcoes = excluded.funcoes, nota = excluded.nota,
         melhorar = excluded.melhorar, modelo = excluded.modelo, lido_em = excluded.lido_em;
end
$$;

revoke execute on function public.servidor_config_leitura(text), public.servidor_curriculos_para_leitura(text, integer),
  public.servidor_guardar_leitura(text, uuid, text, jsonb, integer, text[], text) from public;
grant execute on function public.servidor_config_leitura(text), public.servidor_curriculos_para_leitura(text, integer),
  public.servidor_guardar_leitura(text, uuid, text, jsonb, integer, text[], text)
  to anon, authenticated, service_role;

-- 3. A pessoa: a leitura do próprio currículo e o "Corrigir" --------------------------------------------------

create or replace function public.minha_leitura_do_curriculo()
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
  return (
    select jsonb_build_object(
      'em_talentos', exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = eu),
      'funcoes', coalesce(l.funcoes, '[]'::jsonb),
      'nota', l.nota,
      'melhorar', coalesce(to_jsonb(l.melhorar), '[]'::jsonb),
      'lido_em', l.lido_em,
      -- o currículo mudou depois da leitura: a leitura nova vem na fila
      'desatualizada', l.perfil_id is not null and exists (
        select 1 from public.curriculos c where c.perfil_id = eu and privado.impressao_do_curriculo(c) <> l.impressao))
      from (select 1) um
      left join privado.leituras_curriculo l on l.perfil_id = eu);
end
$$;
revoke execute on function public.minha_leitura_do_curriculo() from public, anon;
grant execute on function public.minha_leitura_do_curriculo() to authenticated;

create or replace function public.tirar_funcao_indicada(p_cbo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if coalesce(p_cbo, '') !~ '^[0-9]{6}$' then
    raise exception 'Função inválida.' using errcode = '22023';
  end if;
  update privado.leituras_curriculo l
     set tiradas = (select array_agg(distinct t) from unnest(l.tiradas || p_cbo) t),
         funcoes = coalesce((select jsonb_agg(f) from jsonb_array_elements(l.funcoes) f where f ->> 'cbo' <> p_cbo),
                            '[]'::jsonb)
   where l.perfil_id = eu;
end
$$;
revoke execute on function public.tirar_funcao_indicada(text) from public, anon;
grant execute on function public.tirar_funcao_indicada(text) to authenticated;

-- 4. Talentos: a busca também acha pela função indicada --------------------------------------------------------

create or replace function privado.texto_do_talento(c public.curriculos)
returns text
language sql
stable
set search_path = ''
as $$
  select lower(public.sem_acento(concat_ws(' ', c.titulo, array_to_string(c.habilidades, ' '),
           array_to_string(c.cursos, ' '), c.curso,
           (select string_agg(e ->> 'cargo', ' ') from jsonb_array_elements(c.experiencias) e),
           -- as funções indicadas pela leitura do currículo (migração 20270826120000)
           (select string_agg(f ->> 'nome', ' ')
              from privado.leituras_curriculo l, jsonb_array_elements(l.funcoes) f
             where l.perfil_id = c.perfil_id))))
$$;

-- 5. O admin: os qualificados por função e cidade, a configuração e a comparação dos modelos -------------------

create or replace function public.admin_qualificados()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return jsonb_build_object(
    'config', (select jsonb_build_object('ligado', c.ligado, 'modelo', c.modelo, 'atualizado_em', c.atualizado_em)
                 from privado.config_leitura c where c.id),
    'em_talentos', (select count(*) from public.curriculo_na_vitrine n
                     where privado.curriculo_para_leitura(n.perfil_id)),
    'lidos', (select count(*) from privado.leituras_curriculo l where privado.curriculo_para_leitura(l.perfil_id)),
    'nota_media', (select round(avg(l.nota)) from privado.leituras_curriculo l
                    where privado.curriculo_para_leitura(l.perfil_id)),
    'funcoes', coalesce((
      select jsonb_agg(x order by x.prontos desc, x.total desc)
        from (select f ->> 'cbo' as cbo, max(f ->> 'nome') as nome, p.cidade,
                     count(*) filter (where f ->> 'nivel' = 'pronto') as prontos,
                     count(*) filter (where f ->> 'nivel' = 'treinamento') as treinamento,
                     count(*) as total
                from privado.leituras_curriculo l
                join public.perfis p on p.id = l.perfil_id
                cross join jsonb_array_elements(l.funcoes) f
               where privado.curriculo_para_leitura(l.perfil_id)
               group by 1, 3
               order by prontos desc, total desc
               limit 200) x), '[]'::jsonb));
end
$$;
revoke execute on function public.admin_qualificados() from public, anon;
grant execute on function public.admin_qualificados() to authenticated, service_role;

create or replace function public.admin_config_leitura(p_ligado boolean, p_modelo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  update privado.config_leitura
     set ligado = coalesce(p_ligado, ligado), modelo = coalesce(left(p_modelo, 60), modelo), atualizado_em = now()
   where id;
end
$$;
revoke execute on function public.admin_config_leitura(boolean, text) from public, anon;
grant execute on function public.admin_config_leitura(boolean, text) to authenticated, service_role;

-- Os currículos para a comparação dos modelos (sem nome, foto, bairro nem contato): uma amostra dos visíveis em
-- Talentos, os mais recentes
create or replace function public.admin_curriculos_para_comparar(p_limite integer default 30)
returns table (perfil_id uuid, titulo text, experiencias jsonb, escolaridade text, curso text, estudos jsonb,
               cursos text[], habilidades text[], cnh text, disponibilidade text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return query
  select c.perfil_id, c.titulo, c.experiencias, c.escolaridade, c.curso, c.estudos, c.cursos, c.habilidades, c.cnh,
         c.disponibilidade
    from public.curriculos c
   where privado.curriculo_para_leitura(c.perfil_id)
   order by c.atualizado_em desc
   limit least(greatest(coalesce(p_limite, 30), 1), 60);
end
$$;
revoke execute on function public.admin_curriculos_para_comparar(integer) from public, anon;
grant execute on function public.admin_curriculos_para_comparar(integer) to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270826120000_leitura_do_curriculo');
