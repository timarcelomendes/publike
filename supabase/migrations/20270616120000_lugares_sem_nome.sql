-- Lugares sem nome na rota (15/11/2026, Marcelo: "empresas sem nome e com apenas o CNAE"). O empresário individual
-- (natureza 2135) sem nome fantasia não tem nome para mostrar: a razão social dele é o nome da pessoa, que nunca
-- aparece, e o Publike punha o nome do ramo no lugar ("Atividades de estética…"). Quase sempre é uma pessoa
-- trabalhando em casa, como o MEI. Agora esses ficam marcados (sem_nome) e saem da rota do currículo, do "Abriu perto"
-- e da busca por nome; continuam nas listas da equipe. Pode rodar de novo.

alter table privado.empresas_receita add column if not exists sem_nome boolean not null default false;

create or replace function privado.marcar_sem_nome()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.sem_nome := coalesce(new.natureza, '') = '2135' and new.razao_social is null
    and (new.nome = 'Empresa sem nome'
         or exists (select 1 from privado.ramos_do_publike r where r.cnae = new.cnae and r.nome = new.nome));
  return new;
end
$$;
drop trigger if exists empresas_receita_sem_nome on privado.empresas_receita;
create trigger empresas_receita_sem_nome
  before insert or update of nome, razao_social, natureza, cnae on privado.empresas_receita
  for each row execute function privado.marcar_sem_nome();

-- os que já estão na base
update privado.empresas_receita e
   set sem_nome = true
 where not e.sem_nome and e.natureza = '2135' and e.razao_social is null
   and (e.nome = 'Empresa sem nome'
        or exists (select 1 from privado.ramos_do_publike r where r.cnae = e.cnae and r.nome = e.nome));

create or replace function public.lugares_da_rota(
  p_cbo text, p_lat double precision, p_lng double precision, p_raio_km numeric default 2, p_limite integer default 60
)
returns table (
  cnpj text, nome text, ramo text, cnae text, endereco text, bairro text, cidade text,
  lat double precision, lng double precision, distancia_m integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raio numeric := least(greatest(coalesce(p_raio_km, 2), 0.5), 10);
  v_ponto extensions.geography;
begin
  -- sem conta também (para conhecer a rota): até 30 lugares; montar e imprimir pedem a conta
  if p_cbo !~ '^[0-9]{6}$' or p_lat is null or p_lng is null then
    return;
  end if;
  v_ponto := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  return query
    with ramos as (
      -- os ramos onde a função pesa (privado.ramos_da_funcao: sem escritório, agência e governo)
      select r.cnae from privado.ramos_da_funcao(p_cbo, 12) r
    )
    select e.cnpj, e.nome, r.nome, e.cnae, concat_ws(', ', e.logradouro, e.numero), e.bairro, e.cidade,
           extensions.st_y(e.local::extensions.geometry), extensions.st_x(e.local::extensions.geometry),
           round(extensions.st_distance(e.local, v_ponto))::integer
      from privado.empresas_receita e
      join ramos using (cnae)
      left join privado.ramos_do_publike r on r.cnae = e.cnae
     where e.situacao = 'ativa' and not e.mei and not e.sem_nome and e.local is not null
       and extensions.st_dwithin(e.local, v_ponto, v_raio * 1000)
     order by extensions.st_distance(e.local, v_ponto), e.nome
     limit least(greatest(coalesce(p_limite, 60), 1), case when auth.uid() is null then 30 else 100 end);
end
$$;

create or replace function privado.abriu_perto(
  p_lat double precision, p_lng double precision, p_cbos text[], p_dias integer, p_raio_km numeric, p_limite integer
)
returns table (cnpj text, nome text, ramo text, bairro text, cidade text, abertura date, distancia_m integer, cbo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ponto extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  v_desde date := privado.ultima_abertura() - least(greatest(coalesce(p_dias, 30), 1), 120);
  v_raio double precision := least(greatest(coalesce(p_raio_km, 3), 0.5), 10) * 1000;
  v_cnaes text[];
  v_cbos text[];
begin
  -- de cada função, os ramos onde ela pesa (até 8); o ramo fica com a função que mais contrata nele
  select array_agg(x.cnae order by x.cnae), array_agg(x.cbo order by x.cnae)
    into v_cnaes, v_cbos
    from (select distinct on (r.cnae) r.cnae, c.cbo
            from unnest(p_cbos) as c(cbo)
            cross join lateral privado.ramos_da_funcao(c.cbo, 8) r
           order by r.cnae, r.contratacoes desc) x;
  if v_cnaes is null then
    return;
  end if;
  return query
    select e.cnpj, e.nome, r2.nome, e.bairro, e.cidade, e.data_abertura,
           round(extensions.st_distance(e.local, v_ponto))::integer,
           v_cbos[array_position(v_cnaes, e.cnae)]
      from privado.empresas_receita e
      left join privado.ramos_do_publike r2 on r2.cnae = e.cnae
     where e.situacao = 'ativa' and not e.mei and not e.sem_nome and e.local is not null
       and e.data_abertura >= v_desde
       and e.cnae = any(v_cnaes)
       and extensions.st_dwithin(e.local, v_ponto, v_raio)
     order by e.data_abertura desc, extensions.st_distance(e.local, v_ponto)
     limit least(greatest(coalesce(p_limite, 3), 1), 10);
end
$$;

create or replace function public.criar_rota_curriculo(
  p_cbo text, p_funcao text, p_lat double precision, p_lng double precision, p_raio_km numeric,
  p_cnpjs text[], p_curriculo jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_eu uuid := auth.uid();
  v_rota uuid;
  v_ponto extensions.geography;
  v_n integer;
begin
  if v_eu is null then
    raise exception 'Entre para montar a rota.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_cnpjs, 1), 0) not between 1 and 15 then
    raise exception 'Escolha de 1 a 15 lugares.' using errcode = '22023';
  end if;
  if (select count(*) from privado.rotas_curriculo r
       where r.perfil_id = v_eu and r.criada_em > now() - interval '1 day') >= 3
     or (select count(*) from privado.copias_curriculo c
          where c.perfil_id = v_eu and c.criada_em > now() - interval '1 day') + array_length(p_cnpjs, 1) > 45 then
    raise exception 'Você já montou rotas demais hoje. Amanhã dá para montar outra.' using errcode = '54000';
  end if;
  if p_lat is null or p_lng is null or coalesce(length(trim(p_funcao)), 0) < 2 then
    raise exception 'Falta a função ou o ponto de partida.' using errcode = '22023';
  end if;
  v_ponto := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  insert into privado.rotas_curriculo (perfil_id, cbo, funcao, raio_km, lat, lng, curriculo)
  values (v_eu, nullif(p_cbo, ''), left(trim(p_funcao), 90), least(greatest(coalesce(p_raio_km, 2), 0.5), 10),
          p_lat, p_lng, coalesce(p_curriculo, '{}'::jsonb))
  returning id into v_rota;

  insert into privado.copias_curriculo (codigo, rota_id, perfil_id, cnpj, nome_local, endereco, bairro, cidade, distancia_m, ordem)
  select substr(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                          'abcdefghijklmnopqrstuvwxyz0123'), 1, 10),
         v_rota, v_eu, e.cnpj, e.nome, concat_ws(', ', e.logradouro, e.numero), e.bairro, e.cidade,
         round(extensions.st_distance(e.local, v_ponto))::integer,
         row_number() over (order by extensions.st_distance(e.local, v_ponto), e.nome)
    from privado.empresas_receita e
   where e.cnpj = any(p_cnpjs) and e.situacao = 'ativa' and not e.mei and not e.sem_nome and e.local is not null;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Nenhum desses lugares está na base.' using errcode = '22023';
  end if;
  return jsonb_build_object('rota', v_rota, 'copias', v_n);
end
$$;

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
     where e.situacao = 'ativa' and not e.mei and not e.sem_nome
       -- o like e o <% (nome parecido, com erro de digitação) usam o índice de trigramas da busca
       and (e.busca like '%' || v_nome || '%' or v_nome operator(extensions.<%) e.busca)
     order by (e.busca like v_nome || '%') desc, (e.busca like '%' || v_nome || '%') desc,
              extensions.word_similarity(v_nome, e.busca) desc, e.na_praca desc, e.matriz desc, e.nome
     limit v_limite;
end
$$;

notify pgrst, 'reload schema';
