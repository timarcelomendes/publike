-- O "não quero receber" dos convites da base da Receita (claude/plano-base-de-empresas-da-receita.md, riscos; 15/11/2026,
-- Marcelo: "faça"): todo convite mandado a uma empresa ou MEI da Receita diz de onde veio o contato e traz o link para
-- não receber mais (/convite/<token>/sair). Quem pede sai das listas de Admin › Convites (pelo CNPJ) e o convite vira
-- "Não quis". A equipe também pode tirar um CNPJ das listas (pedido por e-mail, Política de privacidade).
-- E as matérias do mês saem sozinhas, como rascunho, depois de cada carga mensal.
-- Pode rodar de novo.

create table if not exists privado.receita_sem_convite (
  cnpj text primary key check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  pedido_em timestamptz not null default now(),
  por text not null check (por in ('link', 'equipe'))
);
alter table privado.receita_sem_convite enable row level security;
revoke all on privado.receita_sem_convite from public, anon, authenticated;

-- 1. O link do convite: "Não quero receber" (aberto, pelo token do convite) --------------------------------------

create or replace function public.sair_dos_convites(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c record;
begin
  if coalesce(length(p_token), 0) not between 8 and 100 then
    return null;
  end if;
  select cv.id, cv.nome, cv.cnpj_receita, cv.status into c from public.convites cv where cv.token = p_token;
  if not found then
    return null;
  end if;
  update public.convites cv
     set status = 'recusou',
         nota = left(concat_ws(E'\n', nullif(cv.nota, ''), 'Pediu para não receber mais (link do convite).'), 1000)
   where cv.id = c.id and cv.status <> 'autorizou';
  if c.cnpj_receita is not null then
    insert into privado.receita_sem_convite (cnpj, por) values (c.cnpj_receita, 'link') on conflict do nothing;
  end if;
  return jsonb_build_object('nome', c.nome);
end
$$;
revoke execute on function public.sair_dos_convites(text) from public;
grant execute on function public.sair_dos_convites(text) to anon, authenticated, service_role;

-- 2. A equipe tira um CNPJ das listas (o pedido chegou por e-mail) -----------------------------------------------

create or replace function public.admin_receita_sem_convite(p_cnpj text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Só o admin.' using errcode = '42501';
  end if;
  if coalesce(p_cnpj, '') !~ '^[0-9A-Z]{12}[0-9]{2}$' then
    raise exception 'CNPJ inválido.' using errcode = '22023';
  end if;
  insert into privado.receita_sem_convite (cnpj, por) values (p_cnpj, 'equipe') on conflict do nothing;
  return true;
end
$$;
revoke execute on function public.admin_receita_sem_convite(text) from public, anon;
grant execute on function public.admin_receita_sem_convite(text) to authenticated, service_role;

-- 3. As listas da Receita deixam de fora quem pediu -----------------------------------------------------------------

create or replace function public.admin_lista_receita(
  p_lista text,
  p_cidade text default null,
  p_cnaes text[] default null,
  p_dias integer default 60,
  p_limite integer default 50,
  p_pagina integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dias integer := least(greatest(coalesce(p_dias, 60), 1), 730);
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_pagina integer := greatest(coalesce(p_pagina, 0), 0);
  v_total integer;
  v_linhas jsonb;
begin
  if not privado.eh_admin() then
    raise exception 'Só o admin vê as listas da Receita.' using errcode = '42501';
  end if;
  if p_lista not in ('abriram', 'agencias', 'prestadores') then
    raise exception 'Lista inválida.' using errcode = '22023';
  end if;

  with base as (
    select e.*
      from privado.empresas_receita e
     where e.situacao = 'ativa'
       and not exists (select 1 from privado.receita_sem_convite s where s.cnpj = e.cnpj)
       and (p_cidade is null or e.cidade = p_cidade)
       and case p_lista
             when 'abriram' then not e.mei and e.na_praca
                                 and e.data_abertura >= (now() at time zone 'America/Sao_Paulo')::date - v_dias
             when 'agencias' then e.agencia
             else e.mei and e.na_praca and e.cnae = any(coalesce(p_cnaes, '{}'))
                  and (p_dias is null or e.data_abertura >= (now() at time zone 'America/Sao_Paulo')::date - v_dias)
           end
  )
  select count(*) into v_total from base;

  with base as (
    select e.*,
           nullif(regexp_replace(coalesce(e.telefone, ''), '\D', '', 'g'), '') as tel
      from privado.empresas_receita e
     where e.situacao = 'ativa'
       and not exists (select 1 from privado.receita_sem_convite s where s.cnpj = e.cnpj)
       and (p_cidade is null or e.cidade = p_cidade)
       and case p_lista
             when 'abriram' then not e.mei and e.na_praca
                                 and e.data_abertura >= (now() at time zone 'America/Sao_Paulo')::date - v_dias
             when 'agencias' then e.agencia
             else e.mei and e.na_praca and e.cnae = any(coalesce(p_cnaes, '{}'))
                  and (p_dias is null or e.data_abertura >= (now() at time zone 'America/Sao_Paulo')::date - v_dias)
           end
  ), pagina as (
    select b.*
      from base b
     order by (b.telefone is not null or b.email is not null) desc,
              case when p_lista = 'agencias' then (case when b.na_praca then 0 else 1 end) else 0 end,
              case when p_lista = 'agencias' then (case b.porte when 'demais' then 0 when 'pequena' then 1 else 2 end) else 0 end,
              b.data_abertura desc nulls last, b.nome, b.cnpj
     limit v_limite offset v_pagina * v_limite
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cnpj', p.cnpj, 'nome', p.nome, 'razao_social', p.razao_social, 'cnae', p.cnae, 'ramo', r.nome,
           'bairro', p.bairro, 'cidade', p.cidade, 'cep', p.cep,
           'endereco', case when p.mei then null else concat_ws(', ', p.logradouro, p.numero) end,
           'abertura', p.data_abertura, 'porte', p.porte, 'mei', p.mei, 'matriz', p.matriz, 'na_praca', p.na_praca,
           'telefone', p.telefone, 'email', p.email,
           'no_publike', exists (select 1 from public.perfis pf where pf.cnpj = p.cnpj),
           'convite', (select jsonb_build_object('id', cv.id, 'status', cv.status, 'criado_em', cv.criado_em)
                         from public.convites cv
                        where cv.cnpj_receita = p.cnpj
                           or (p.tel is not null and (p.tel = any(cv.whatsapp) or p.tel = any(cv.telefones)))
                        order by cv.criado_em desc
                        limit 1))
         order by (p.telefone is not null or p.email is not null) desc,
                  case when p_lista = 'agencias' then (case when p.na_praca then 0 else 1 end) else 0 end,
                  case when p_lista = 'agencias' then (case p.porte when 'demais' then 0 when 'pequena' then 1 else 2 end) else 0 end,
                  p.data_abertura desc nulls last, p.nome, p.cnpj), '[]'::jsonb)
    into v_linhas
    from pagina p
    left join privado.ramos_do_publike r on r.cnae = p.cnae;

  return jsonb_build_object(
    'total', v_total,
    'pagina', v_pagina,
    'limite', v_limite,
    'linhas', v_linhas,
    'cidades', coalesce((select jsonb_agg(x.cidade order by x.n desc)
                           from (select e.cidade, count(*) as n from privado.empresas_receita e
                                  where e.situacao = 'ativa' and (e.na_praca or p_lista = 'agencias')
                                  group by e.cidade) x), '[]'::jsonb));
end
$$;

-- 4. As matérias do mês saem sozinhas depois de cada carga (o site chama com a chave do servidor) ------------------
-- as funções do admin aceitam também a chamada do servidor (marcada nesta transação pelo invólucro abaixo)

create or replace function public.admin_numeros_do_mes_receita(p_mes date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ini date := date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Sao_Paulo')::date - interval '1 month'))::date;
  v_fim date := (v_ini + interval '1 month')::date;
begin
  if not (privado.eh_admin() or privado.equipe_publike() or current_setting('publike.servidor', true) = '1') then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'mes', v_ini,
    -- o que mais contratou em Goiânia e região (Caged, 12 meses): as funções e a faixa de salário
    'mais_contratadas', coalesce((select jsonb_agg(jsonb_build_object('cbo', s.cbo, 'contratacoes', s.n, 'p25', s.p25,
                                                                   'p50', s.p50, 'p75', s.p75, 'de', s.de, 'ate', s.ate)
                                                   order by s.n desc)
                                    from (select * from privado.salarios_mercado m where m.regiao = 'goiania'
                                           order by m.n desc limit 10) s), '[]'::jsonb),
    'por_cidade', coalesce((select jsonb_agg(jsonb_build_object(
          'cidade', x.cidade, 'empresas', x.empresas, 'meis', coalesce(m.meis, 0),
          'bairros', (select jsonb_agg(jsonb_build_object('bairro', b.bairro, 'quantas', b.n) order by b.n desc)
                        from (select coalesce(e.bairro, '(sem bairro)') as bairro, count(*) as n
                                from privado.empresas_receita e
                               where e.cidade = x.cidade and e.na_praca and not e.mei
                                 and e.data_abertura >= v_ini and e.data_abertura < v_fim
                               group by 1 order by 2 desc limit 5) b),
          'ramos', (select jsonb_agg(jsonb_build_object('ramo', coalesce(r.nome, b.cnae), 'quantas', b.n) order by b.n desc)
                      from (select e.cnae, count(*) as n
                              from privado.empresas_receita e
                             where e.cidade = x.cidade and e.na_praca and not e.mei
                               and e.data_abertura >= v_ini and e.data_abertura < v_fim
                             group by 1 order by 2 desc limit 5) b
                      left join privado.ramos_do_publike r on r.cnae = b.cnae),
          -- os destaques: só empresas (nunca MEI), dos ramos que contratam (os que aparecem no Caged)
          'destaques', (select jsonb_agg(jsonb_build_object('nome', d.nome, 'ramo', d.ramo, 'bairro', d.bairro))
                          from (select e.nome, r.nome as ramo, e.bairro
                                  from privado.empresas_receita e
                                  left join privado.ramos_do_publike r on r.cnae = e.cnae
                                 where e.cidade = x.cidade and e.na_praca and not e.mei and e.matriz
                                   and e.data_abertura >= v_ini and e.data_abertura < v_fim
                                   and exists (select 1 from privado.ramos_funcoes f where f.cnae = e.cnae)
                                   and e.nome <> coalesce(r.nome, '')
                                 order by e.porte = 'demais' desc, e.porte = 'pequena' desc, e.data_abertura desc
                                 limit 10) d))
        order by x.empresas desc)
      from (select e.cidade, count(*) as empresas
              from privado.empresas_receita e
             where e.na_praca and not e.mei and e.data_abertura >= v_ini and e.data_abertura < v_fim
             group by e.cidade) x
      left join (select m.cidade, sum(m.quantos) as meis from privado.mei_por_bairro m
                  where m.mes_abertura = v_ini group by m.cidade) m on m.cidade = x.cidade), '[]'::jsonb));
end
$$;

create or replace function public.admin_rascunhos_receita(p_itens jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  item jsonb;
  novos integer := 0;
begin
  if not (privado.eh_admin() or privado.equipe_publike() or current_setting('publike.servidor', true) = '1') then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  for item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) limit 4 loop
    begin
    insert into public.noticias (slug, titulo, resumo, corpo, pratico, tema, cidade, fonte_nome, fonte_url, fonte_data)
    values (item ->> 'slug', btrim(item ->> 'titulo'), btrim(item ->> 'resumo'), btrim(item ->> 'corpo'),
            nullif(btrim(item ->> 'pratico'), ''), coalesce(item ->> 'tema', 'mercado'), nullif(btrim(item ->> 'cidade'), ''),
            btrim(item ->> 'fonte_nome'), btrim(item ->> 'fonte_url'), nullif(item ->> 'fonte_data', '')::date)
    on conflict do nothing;
    if found then
      novos := novos + 1;
    end if;
    exception when others then
      -- um texto fora das regras das notícias (curto ou longo demais) não derruba o outro
      raise warning 'Publike: matéria do mês não entrou (%).', sqlerrm;
    end;
  end loop;
  return novos;
end
$$;

create table if not exists privado.materias_receita_feitas (
  mes date primary key,
  feitas_em timestamptz not null default now(),
  novas integer not null default 0
);
alter table privado.materias_receita_feitas enable row level security;
revoke all on privado.materias_receita_feitas from public, anon, authenticated;

create or replace function public.servidor_numeros_do_mes_receita(p_chave text, p_mes date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Sao_Paulo')::date - interval '1 month'))::date;
begin
  perform privado.exigir_servidor(p_chave);
  -- uma vez por mês
  if exists (select 1 from privado.materias_receita_feitas f where f.mes = v_mes) then
    return null;
  end if;
  perform set_config('publike.servidor', '1', true);
  return public.admin_numeros_do_mes_receita(v_mes);
end
$$;
revoke execute on function public.servidor_numeros_do_mes_receita(text, date) from public;
grant execute on function public.servidor_numeros_do_mes_receita(text, date) to anon, authenticated, service_role;

create or replace function public.servidor_rascunhos_receita(p_chave text, p_mes date, p_itens jsonb)
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
  perform set_config('publike.servidor', '1', true);
  n := public.admin_rascunhos_receita(p_itens);
  insert into privado.materias_receita_feitas (mes, novas) values (date_trunc('month', p_mes)::date, n)
  on conflict (mes) do nothing;
  return n;
end
$$;
revoke execute on function public.servidor_rascunhos_receita(text, date, jsonb) from public;
grant execute on function public.servidor_rascunhos_receita(text, date, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
