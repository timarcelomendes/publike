-- Admin › Convites com a base da Receita (claude/plano-base-de-empresas-da-receita.md, partes 1 e 5; fase C; 15/11/2026,
-- Marcelo: "sim" aos prestadores pelos ramos da vitrine). Três listas para mandar convite:
--   * abriram: as empresas (fora o MEI) que abriram nos últimos dias nas cidades das praças;
--   * agencias: as agências de RH de Goiás inteiro, MEI também;
--   * prestadores: o MEI das praças nos ramos da vitrine de serviços (os ramos vêm da tela, src/lib/ramos-prestadores.ts).
-- Cada linha diz se a empresa já está no Publike (pelo CNPJ do perfil) e se já recebeu convite (pelo CNPJ guardado no
-- convite ou pelo telefone). Telefone e e-mail só para o admin. Pode rodar de novo.

alter table public.convites add column if not exists cnpj_receita text
  check (cnpj_receita is null or cnpj_receita ~ '^[0-9A-Z]{12}[0-9]{2}$');
create index if not exists convites_cnpj_receita_idx on public.convites (cnpj_receita) where cnpj_receita is not null;
alter table public.convites drop constraint if exists convites_origem_check;
alter table public.convites add constraint convites_origem_check
  check (origem is null or origem in ('arquivo', 'imagem', 'receita'));

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
revoke execute on function public.admin_lista_receita(text, text, text[], integer, integer, integer) from public, anon;
grant execute on function public.admin_lista_receita(text, text, text[], integer, integer, integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';

-- o admin também vê o que o ramo contrata (o convite da empresa nova já vai com a vaga típica do ramo)
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
   where f.cnae = p_cnae and (auth.uid() is not null or privado.eh_admin())
   order by f.contratacoes desc, f.cbo
   limit least(greatest(coalesce(p_limite, 8), 1), 20)
$$;

notify pgrst, 'reload schema';
