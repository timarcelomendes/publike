-- Publicar sabendo o que o ramo contrata (claude/plano-base-de-empresas-da-receita.md, parte 3; fase B): achar a
-- empresa pelo CNPJ ou pelo nome na base da Receita (migração 20270602120000) e as funções que o ramo dela contrata
-- em Goiás (Caged), com a faixa de salário da praça. Só para quem entrou; nunca devolve telefone nem e-mail.
--
-- O MEI também entra na base (15/11/2026, Marcelo: "tem muito MEI que são agências, percebi isso e prestadores de
-- serviço"), marcado, para as listas da equipe (Admin › Convites: agências e prestadores). Como o endereço do MEI
-- quase sempre é a casa da pessoa, dele não se guarda rua, número nem complemento (só o bairro, o CEP e o ponto no meio
-- do CEP), e ele nunca aparece na busca por nome, na rota do currículo nem no "abriu perto de você": só pelo CNPJ
-- inteiro (o próprio dono digitando) e para a equipe.
-- Pode rodar de novo.

alter table privado.empresas_receita add column if not exists mei boolean not null default false;
create index if not exists empresas_receita_mei_idx on privado.empresas_receita (cnae) where situacao = 'ativa' and mei;

-- O robô: o lote agora traz a marca do MEI
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
    agencia, mei, mes_carga, situacao, fora_em, atualizado_em)
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
         coalesce((l ->> 'agencia')::boolean, false), coalesce((l ->> 'mei')::boolean, false), p_mes, 'ativa', null, now()
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
        telefone = excluded.telefone, email = excluded.email, na_praca = excluded.na_praca, agencia = excluded.agencia, mei = excluded.mei,
        mes_carga = excluded.mes_carga, situacao = 'ativa', fora_em = null, atualizado_em = now();
  get diagnostics n = row_count;
  return n;
end
$$;


-- O Admin: o resumo separa o MEI
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
    'ativas', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and not e.mei),
    'meis_na_base', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.mei),
    'agencias_mei', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.agencia and e.mei),
    'na_praca', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.na_praca and not e.mei),
    'com_ponto', (select count(*) from privado.empresas_receita e
                   where e.situacao = 'ativa' and not e.mei and e.local is not null),
    'agencias', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.agencia),
    'abertas_60_dias', (select count(*) from privado.empresas_receita e
                         where e.situacao = 'ativa' and e.na_praca and not e.mei and e.data_abertura >= current_date - 60),
    'por_cidade', coalesce((select jsonb_agg(jsonb_build_object('cidade', x.cidade, 'quantas', x.n) order by x.n desc)
                             from (select e.cidade, count(*) as n from privado.empresas_receita e
                                    where e.situacao = 'ativa' and e.na_praca and not e.mei group by e.cidade) x), '[]'::jsonb),
    'meis', (select coalesce(sum(m.quantos), 0) from privado.mei_por_bairro m),
    'meis_60_dias', (select coalesce(sum(m.quantos), 0) from privado.mei_por_bairro m
                      where m.mes_abertura >= date_trunc('month', current_date - 60)),
    'ramos_com_nome', (select count(*) from privado.ramos_do_publike),
    'ramos_funcoes', (select count(*) from privado.ramos_funcoes));
end
$$;


-- 1. Achar a empresa: CNPJ inteiro (14), a raiz (8: a matriz primeiro) ou o nome (sem acento, em minúsculas) ---------

drop function if exists public.buscar_empresas_receita(text, integer);
create or replace function public.buscar_empresas_receita(p_texto text, p_limite integer default 6)
returns table (
  cnpj text, nome text, razao_social text, cnae text, ramo text, agencia boolean, matriz boolean, mei boolean,
  logradouro text, numero text, complemento text, bairro text, cep text, cidade text, uf text,
  lat double precision, lng double precision, precisao text, data_abertura date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_doc text := upper(regexp_replace(coalesce(p_texto, ''), '[^0-9A-Za-z]', '', 'g'));
  v_nome text := lower(trim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')));
  v_limite integer := least(greatest(coalesce(p_limite, 6), 1), 10);
begin
  if auth.uid() is null and not privado.eh_admin() then
    raise exception 'Entre para buscar a empresa.' using errcode = '42501';
  end if;
  -- CNPJ: o inteiro (14, os dois últimos números, com algum número antes; desde 2026 pode ter letras) ou a raiz
  -- (8 números), com ou sem a pontuação
  if (v_doc ~ '^[0-9A-Z]{12}[0-9]{2}$' and substr(v_doc, 1, 12) ~ '[0-9]' and coalesce(p_texto, '') ~ '^[0-9A-Za-z./ -]+$'
      and coalesce(p_texto, '') ~ '[0-9]{2}')
     or v_doc ~ '^[0-9]{8}$' and coalesce(p_texto, '') ~ '^[0-9. ]+$' then
    return query
      select e.cnpj, e.nome, e.razao_social, e.cnae, r.nome, e.agencia, e.matriz, e.mei,
             e.logradouro, e.numero, e.complemento, e.bairro, e.cep, e.cidade, e.uf,
             extensions.st_y(e.local::extensions.geometry), extensions.st_x(e.local::extensions.geometry),
             e.precisao, e.data_abertura
        from privado.empresas_receita e
        left join privado.ramos_do_publike r on r.cnae = e.cnae
       where e.situacao = 'ativa'
         and (case when length(v_doc) = 14 then e.cnpj = v_doc else e.cnpj_basico = v_doc end)
       order by e.matriz desc, e.cnpj
       limit v_limite;
    return;
  end if;
  if length(v_nome) < 3 then
    return;
  end if;
  return query
    select e.cnpj, e.nome, e.razao_social, e.cnae, r.nome, e.agencia, e.matriz, e.mei,
           e.logradouro, e.numero, e.complemento, e.bairro, e.cep, e.cidade, e.uf,
           extensions.st_y(e.local::extensions.geometry), extensions.st_x(e.local::extensions.geometry),
           e.precisao, e.data_abertura
      from privado.empresas_receita e
      left join privado.ramos_do_publike r on r.cnae = e.cnae
     where e.situacao = 'ativa' and not e.mei
       -- o like e o <% (nome parecido, com erro de digitação) usam o índice de trigramas da busca
       and (e.busca like '%' || v_nome || '%' or v_nome operator(extensions.<%) e.busca)
     order by (e.busca like v_nome || '%') desc, (e.busca like '%' || v_nome || '%') desc,
              extensions.word_similarity(v_nome, e.busca) desc, e.na_praca desc, e.matriz desc, e.nome
     limit v_limite;
end
$$;
revoke execute on function public.buscar_empresas_receita(text, integer) from public, anon;
grant execute on function public.buscar_empresas_receita(text, integer) to authenticated, service_role;

-- 2. O que o ramo contrata: as funções com mais contratações em Goiás (12 meses, Caged) e a faixa da praça ---------

create or replace function public.funcoes_do_ramo(p_cnae text, p_regiao text default 'goiania', p_limite integer default 8)
returns table (cbo text, contratacoes integer, p25 numeric, p50 numeric, p75 numeric, regiao text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.cbo, f.contratacoes, s.p25, s.p50, s.p75, s.regiao
    from privado.ramos_funcoes f
    left join lateral (
      select m.p25, m.p50, m.p75, m.regiao
        from privado.salarios_mercado m
       where m.cbo = f.cbo and m.regiao in (coalesce(p_regiao, 'goiania'), 'go')
       order by (m.regiao = 'go')
       limit 1) s on true
   where f.cnae = p_cnae and auth.uid() is not null
   order by f.contratacoes desc, f.cbo
   limit least(greatest(coalesce(p_limite, 8), 1), 20)
$$;
revoke execute on function public.funcoes_do_ramo(text, text, integer) from public, anon;
grant execute on function public.funcoes_do_ramo(text, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
