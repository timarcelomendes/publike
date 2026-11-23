-- Os contatos de Admin › Convites › Divulgar (23/11/2026; Marcelo: "gostaria de ver os contatos aqui também"): as
-- contabilidades (CNAE 6920-6/01 e 6920-6/02) e as empresas de gestão de pessoas (as agências de RH: seleção, mão de
-- obra temporária e terceirização) das praças, da base da Receita, com o telefone. Em 23/11 eram 3.005 contabilidades
-- e 261 agências nas praças, quase todas com telefone. "Mandei" guarda quem já recebeu a mensagem (e sai da lista dos
-- que faltam); "Não mandar" usa a lista de sempre (privado.receita_sem_convite). Pode rodar de novo.

create table if not exists privado.divulgacoes (
  cnpj text primary key,
  publico text not null check (publico in ('contabilidades', 'gestao')),
  mandado_em timestamptz not null default now()
);
alter table privado.divulgacoes enable row level security;
revoke all on table privado.divulgacoes from anon, authenticated;

create or replace function public.admin_divulgar_contatos(
  p_publico text,
  p_cidade text default null,
  p_mostrar text default 'faltam',
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
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_pagina integer := greatest(coalesce(p_pagina, 0), 0);
  v jsonb;
begin
  if not privado.eh_admin() then
    raise exception 'Só o admin vê os contatos.' using errcode = '42501';
  end if;
  if p_publico not in ('contabilidades', 'gestao') or p_mostrar not in ('faltam', 'mandados', 'todos') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;

  with base as (
    select e.cnpj, e.nome, e.razao_social, e.bairro, e.cidade, e.porte, e.matriz, e.telefone, e.email,
           e.data_abertura, d.mandado_em
      from privado.empresas_receita e
      left join privado.divulgacoes d on d.cnpj = e.cnpj
     where e.situacao = 'ativa' and e.na_praca
       and not exists (select 1 from privado.receita_sem_convite s where s.cnpj = e.cnpj)
       and case p_publico
             when 'contabilidades' then e.cnae in ('6920601', '6920602')
             else e.agencia
           end
  ), filtrada as (
    select * from base b
     where (p_cidade is null or b.cidade = p_cidade)
       and case p_mostrar when 'faltam' then b.mandado_em is null
                          when 'mandados' then b.mandado_em is not null
                          else true end
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrada),
    'faltam', (select count(*) from base where mandado_em is null),
    'mandados', (select count(*) from base where mandado_em is not null),
    'cidades', coalesce((select jsonb_agg(x.cidade order by x.n desc)
                           from (select cidade, count(*) n from base group by cidade) x), '[]'::jsonb),
    'linhas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cnpj', f.cnpj, 'nome', f.nome, 'razao_social', f.razao_social, 'bairro', f.bairro,
               'cidade', f.cidade, 'porte', f.porte, 'matriz', f.matriz, 'telefone', f.telefone, 'email', f.email,
               'mandado_em', f.mandado_em,
               'no_publike', exists (select 1 from public.perfis pf where pf.cnpj = f.cnpj))
             order by f.ord)
        from (select f.*,
                     row_number() over (
                       order by f.mandado_em desc nulls last,
                                (f.telefone is not null) desc,
                                case f.porte when 'demais' then 0 when 'pequena' then 1 else 2 end,
                                f.matriz desc, f.data_abertura asc nulls last, f.nome, f.cnpj) as ord
                from filtrada f
               order by ord
               limit v_limite offset v_pagina * v_limite) f), '[]'::jsonb))
    into v;
  return v;
end
$$;
revoke execute on function public.admin_divulgar_contatos(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_divulgar_contatos(text, text, text, integer, integer) to service_role;

-- "Mandei" (p_mandado true) ou desfazer
create or replace function public.admin_divulgar_marcar(p_cnpj text, p_publico text, p_mandado boolean default true)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v timestamptz;
begin
  if not privado.eh_admin() then
    raise exception 'Só o admin marca os contatos.' using errcode = '42501';
  end if;
  if p_publico not in ('contabilidades', 'gestao') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  if not coalesce(p_mandado, true) then
    delete from privado.divulgacoes where cnpj = p_cnpj;
    return null;
  end if;
  insert into privado.divulgacoes (cnpj, publico) values (p_cnpj, p_publico)
  on conflict (cnpj) do update set publico = excluded.publico, mandado_em = now()
  returning mandado_em into v;
  return v;
end
$$;
revoke execute on function public.admin_divulgar_marcar(text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_divulgar_marcar(text, text, boolean) to service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270916120000_divulgar_contatos');
