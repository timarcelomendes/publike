-- Divulgar também para as empresas dos convites (23/11/2026; Marcelo: "a ideia é pegar o whatsapp de empresas que
-- divulgaram vagas com whatsapp, como já é feito, mas aparecer aqui"): os convites de empresa e agência com WhatsApp
-- (lidos dos anúncios de vaga de outros lugares), fora quem não quis, quem tem o contato que não serve e quem já
-- publicou pelo convite. O "Mandei" guarda a chave `convite:<id>` em privado.divulgacoes. Pode rodar de novo.

alter table privado.divulgacoes drop constraint if exists divulgacoes_publico_check;
alter table privado.divulgacoes add constraint divulgacoes_publico_check
  check (publico in ('contabilidades', 'gestao', 'empresas'));

create or replace function public.admin_divulgar_convites(
  p_mostrar text default 'faltam',
  p_limite integer default 30,
  p_pagina integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 30), 1), 200);
  v_pagina integer := greatest(coalesce(p_pagina, 0), 0);
  v jsonb;
begin
  if not privado.eh_admin() then
    raise exception 'Só o admin vê os contatos.' using errcode = '42501';
  end if;
  if p_mostrar not in ('faltam', 'mandados', 'todos') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  with base as (
    select cv.id, cv.nome, cv.tipo, cv.vagas, cv.whatsapp, cv.status, cv.criado_em, d.mandado_em
      from public.convites cv
      left join privado.divulgacoes d on d.cnpj = 'convite:' || cv.id
     where cv.tipo in ('empresa', 'agencia')
       and cardinality(cv.whatsapp) > 0
       and cv.status not in ('recusou', 'sem_contato')
       and cv.aceite_em is null and cv.anuncio_id is null
  ), filtrada as (
    select * from base b
     where case p_mostrar when 'faltam' then b.mandado_em is null
                          when 'mandados' then b.mandado_em is not null
                          else true end
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrada),
    'faltam', (select count(*) from base where mandado_em is null),
    'mandados', (select count(*) from base where mandado_em is not null),
    'linhas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'nome', f.nome, 'tipo', f.tipo, 'vagas', f.vagas, 'whatsapp', f.whatsapp,
               'status', f.status, 'criado_em', f.criado_em, 'mandado_em', f.mandado_em) order by f.ord)
        from (select f.*, row_number() over (order by f.mandado_em desc nulls last, f.criado_em desc, f.nome) ord
                from filtrada f order by ord limit v_limite offset v_pagina * v_limite) f), '[]'::jsonb))
    into v;
  return v;
end
$$;
revoke execute on function public.admin_divulgar_convites(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_divulgar_convites(text, integer, integer) to service_role;

-- o "Mandei" aceita as empresas dos convites
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
  if p_publico not in ('contabilidades', 'gestao', 'empresas') then
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

select privado.migracao_aplicada('20270916130000_divulgar_convites');
