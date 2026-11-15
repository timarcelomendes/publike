-- "Abriu perto de você" não aparecia (15/11/2026, Marcelo: "não apareceu"). Os dados abertos da Receita chegam com
-- um mês de atraso: na carga de outubro, a abertura mais nova é de 11/10. Contando "os últimos 30 dias" a partir de
-- hoje, não sobrava nenhum lugar. Agora as janelas ("abriu nos últimos 30 dias", as listas de Admin › Convites e o
-- "abriram em 60 dias" do Admin) contam a partir da abertura mais nova da base. E o e-mail da semana não repete o
-- mesmo lugar para a mesma pessoa. Pode rodar de novo.

-- a abertura mais nova da base (o "hoje" dos dados da Receita)
create or replace function privado.ultima_abertura()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(e.data_abertura), (now() at time zone 'America/Sao_Paulo')::date)
    from privado.empresas_receita e
   where e.situacao = 'ativa'
$$;
revoke all on function privado.ultima_abertura() from public;

create table if not exists privado.abriu_perto_enviados (
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  cnpj text not null,
  enviado_em timestamptz not null default now(),
  primary key (perfil_id, cnpj)
);
alter table privado.abriu_perto_enviados enable row level security;
revoke all on privado.abriu_perto_enviados from public, anon, authenticated;

create or replace function privado.abriu_perto(
  p_lat double precision, p_lng double precision, p_cbos text[], p_dias integer, p_raio_km numeric, p_limite integer
)
returns table (cnpj text, nome text, ramo text, bairro text, cidade text, abertura date, distancia_m integer, cbo text)
language sql
stable
security definer
set search_path = ''
as $$
  with ponto as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  ), ramos as (
    -- de cada função, os ramos que mais a contratam (até 8)
    select distinct on (x.cnae) x.cnae, x.cbo
      from (select r.cnae, c.cbo, r.contratacoes
              from unnest(p_cbos) as c(cbo)
              cross join lateral privado.ramos_da_funcao(c.cbo, 8) r) x
     order by x.cnae, x.contratacoes desc
  )
  select e.cnpj, e.nome, r2.nome, e.bairro, e.cidade, e.data_abertura,
         round(extensions.st_distance(e.local, p.g))::integer, ramos.cbo
    from privado.empresas_receita e
    join ramos on ramos.cnae = e.cnae
    cross join ponto p
    left join privado.ramos_do_publike r2 on r2.cnae = e.cnae
   where e.situacao = 'ativa' and not e.mei and e.local is not null
     and e.data_abertura >= privado.ultima_abertura() - least(greatest(p_dias, 1), 120)
     and extensions.st_dwithin(e.local, p.g, least(greatest(p_raio_km, 0.5), 10) * 1000)
   order by e.data_abertura desc, extensions.st_distance(e.local, p.g)
   limit least(greatest(coalesce(p_limite, 3), 1), 10)
$$;

create or replace function public.servidor_abriu_perto(p_chave text, p_pessoas jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  pessoa jsonb;
  lugares jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  if jsonb_typeof(p_pessoas) is distinct from 'array' or jsonb_array_length(p_pessoas) > 500 then
    raise exception 'Mande até 500 pessoas.' using errcode = '22023';
  end if;
  for pessoa in select * from jsonb_array_elements(p_pessoas) loop
    -- os 2 mais novos que a pessoa ainda não recebeu (a base muda uma vez por mês: sem isso, repetia toda semana)
    with achados as (
      select a.*
        from public.casas c
        cross join lateral privado.abriu_perto(
          extensions.st_y(c.local::extensions.geometry), extensions.st_x(c.local::extensions.geometry),
          array(select jsonb_array_elements_text(pessoa -> 'cbos')), 30, 3, 10) a
       where c.perfil_id = (pessoa ->> 'perfil_id')::uuid and c.local is not null
         and not exists (select 1 from privado.abriu_perto_enviados x
                          where x.perfil_id = c.perfil_id and x.cnpj = a.cnpj)
       limit 2
    ), marcados as (
      insert into privado.abriu_perto_enviados (perfil_id, cnpj)
      select (pessoa ->> 'perfil_id')::uuid, achados.cnpj from achados
      on conflict do nothing
    )
    select jsonb_agg(jsonb_build_object('nome', a.nome, 'ramo', a.ramo, 'bairro', a.bairro, 'distancia_m', a.distancia_m))
      into lugares
      from achados a;
    if lugares is not null then
      v := v || jsonb_build_object(pessoa ->> 'perfil_id', lugares);
    end if;
  end loop;
  return v;
end
$$;

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
                                 and e.data_abertura >= privado.ultima_abertura() - v_dias
             when 'agencias' then e.agencia
             else e.mei and e.na_praca and e.cnae = any(coalesce(p_cnaes, '{}'))
                  and (p_dias is null or e.data_abertura >= privado.ultima_abertura() - v_dias)
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
                                 and e.data_abertura >= privado.ultima_abertura() - v_dias
             when 'agencias' then e.agencia
             else e.mei and e.na_praca and e.cnae = any(coalesce(p_cnaes, '{}'))
                  and (p_dias is null or e.data_abertura >= privado.ultima_abertura() - v_dias)
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
                         where e.situacao = 'ativa' and e.na_praca and not e.mei and e.data_abertura >= privado.ultima_abertura() - 60),
    'por_cidade', coalesce((select jsonb_agg(jsonb_build_object('cidade', x.cidade, 'quantas', x.n) order by x.n desc)
                             from (select e.cidade, count(*) as n from privado.empresas_receita e
                                    where e.situacao = 'ativa' and e.na_praca and not e.mei group by e.cidade) x), '[]'::jsonb),
    'meis', (select coalesce(sum(m.quantos), 0) from privado.mei_por_bairro m),
    'meis_60_dias', (select coalesce(sum(m.quantos), 0) from privado.mei_por_bairro m
                      where m.mes_abertura >= date_trunc('month', privado.ultima_abertura() - 60)),
    'ramos_com_nome', (select count(*) from privado.ramos_do_publike),
    'ramos_funcoes', (select count(*) from privado.ramos_funcoes));
end
$$;

notify pgrst, 'reload schema';
