-- Cadastro de empresas: a conta nova de empresa, comércio ou agência entra sozinha (depois da 20261209120000).
-- Para ninguém se passar por outra empresa (o logo aparece no currículo de quem trabalhou lá):
--   * nome que nenhum currículo cita ainda: a empresa entra no cadastro já ligada à conta;
--   * nome que algum currículo já cita: liga sozinha só a conta verificada; a outra fica em Admin › Empresas,
--     em "Contas para ligar", e o admin confirma ou diz que não é a mesma.
-- A conta já ligada continua ligada quando muda o nome. Pode rodar de novo.

create table if not exists privado.empresas_contas_dispensadas (
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  empresa_id bigint not null references privado.empresas (id) on delete cascade,
  primary key (perfil_id, empresa_id)
);
alter table privado.empresas_contas_dispensadas enable row level security;
revoke all on table privado.empresas_contas_dispensadas from public, anon, authenticated;

create or replace function privado.ligar_conta_ao_cadastro(p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta public.perfis;
  k text;
  emp privado.empresas;
  citada boolean;
  nova bigint;
begin
  select * into conta from public.perfis where id = p_perfil;
  if conta.id is null or conta.tipo not in ('empresa', 'comercio', 'agencia') then
    return;
  end if;
  if exists (select 1 from privado.empresas e where e.perfil_id = conta.id) then
    return;
  end if;
  k := privado.chave_empresa(conta.nome);
  if k is null or privado.chave_nao_empresa(k) then
    return;
  end if;
  select e.* into emp from privado.empresas_nomes n join privado.empresas e on e.id = n.empresa_id where n.chave = k;
  if emp.id is null then
    insert into privado.empresas (nome, chave, cnpj, cidade, perfil_id, tipo)
    values (conta.nome, k, conta.cnpj, conta.cidade, conta.id, 'empresa')
    on conflict (chave) do nothing
    returning id into nova;
    if nova is not null then
      insert into privado.empresas_nomes (chave, empresa_id) values (k, nova) on conflict (chave) do nothing;
    end if;
    return;
  end if;
  if emp.perfil_id is not null or emp.tipo <> 'empresa' then
    return;
  end if;
  citada := exists (select 1 from privado.experiencias_empresas x where x.empresa_id = emp.id);
  if not citada or coalesce(conta.verificado, false) then
    update privado.empresas
       set perfil_id = conta.id, cnpj = coalesce(cnpj, conta.cnpj), cidade = coalesce(cidade, conta.cidade)
     where id = emp.id and perfil_id is null;
  end if;
end
$$;
revoke execute on function privado.ligar_conta_ao_cadastro(uuid) from public;

create or replace function privado.perfis_ligar_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.nome is distinct from old.nome or new.tipo is distinct from old.tipo
     or new.verificado is distinct from old.verificado then
    begin
      perform privado.ligar_conta_ao_cadastro(new.id);
    exception when others then
      raise warning 'Publike: não deu para pôr a conta % no cadastro de empresas (%).', new.id, sqlerrm;
    end;
  end if;
  return null;
end
$$;
drop trigger if exists perfis_ligar_empresa on public.perfis;
create trigger perfis_ligar_empresa
  after insert or update of nome, tipo, verificado on public.perfis
  for each row execute function privado.perfis_ligar_empresa();

-- as contas que já existem e ficaram de fora da carga
do $$
begin
  perform privado.ligar_conta_ao_cadastro(p.id)
     from public.perfis p
    where p.tipo in ('empresa', 'comercio', 'agencia')
      and not exists (select 1 from privado.empresas e where e.perfil_id = p.id);
end
$$;

-- Admin › Empresas › Contas para ligar: a conta sem ligar com o mesmo nome limpo de uma empresa que os
-- currículos citam (e que ainda não tem conta).
create or replace function public.admin_empresas_contas_para_ligar()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform privado.exigir_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
           'perfil', jsonb_build_object('id', p.id, 'nome', p.nome, 'cidade', p.cidade, 'foto', p.foto,
                                        'verificado', p.verificado, 'criado_em', p.criado_em),
           'empresa', jsonb_build_object('id', e.id, 'nome', e.nome,
                                         'pessoas', (select count(distinct x.perfil_id) from privado.experiencias_empresas x where x.empresa_id = e.id)))
         order by p.criado_em desc), '[]'::jsonb)
    into v
    from public.perfis p
    join privado.empresas_nomes n on n.chave = privado.chave_empresa(p.nome)
    join privado.empresas e on e.id = n.empresa_id and e.tipo = 'empresa' and e.perfil_id is null
   where p.tipo in ('empresa', 'comercio', 'agencia')
     and not exists (select 1 from privado.empresas o where o.perfil_id = p.id)
     and not exists (select 1 from privado.empresas_contas_dispensadas d where d.perfil_id = p.id and d.empresa_id = e.id);
  return v;
end
$$;
revoke execute on function public.admin_empresas_contas_para_ligar() from public, anon, authenticated;
grant execute on function public.admin_empresas_contas_para_ligar() to service_role;

create or replace function public.admin_empresa_conta_dispensar(p_perfil uuid, p_empresa bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  insert into privado.empresas_contas_dispensadas (perfil_id, empresa_id) values (p_perfil, p_empresa)
  on conflict do nothing;
end
$$;
revoke execute on function public.admin_empresa_conta_dispensar(uuid, bigint) from public, anon, authenticated;
grant execute on function public.admin_empresa_conta_dispensar(uuid, bigint) to service_role;

-- Para a IA sugerir as repetidas: as empresas citadas, das mais para as menos (só nome e número).
create or replace function public.admin_empresas_para_ia(p_limite integer default 200)
returns table (id bigint, nome text, pessoas bigint, com_conta boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return query
    select e.id, e.nome, count(distinct x.perfil_id), e.perfil_id is not null
      from privado.empresas e
      join privado.experiencias_empresas x on x.empresa_id = e.id
     where e.tipo = 'empresa'
     group by e.id
     order by count(distinct x.perfil_id) desc, e.nome
     limit least(greatest(coalesce(p_limite, 200), 1), 400);
end
$$;
revoke execute on function public.admin_empresas_para_ia(integer) from public, anon, authenticated;
grant execute on function public.admin_empresas_para_ia(integer) to service_role;

notify pgrst, 'reload schema';
