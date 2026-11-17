-- Quantas pessoas o ramo contratou na cidade (16/11/2026, "cruzar as empresas x Caged"): o Novo Caged público não traz
-- o CNPJ, então não dá para dizer quantas a empresa contratou. Dá para dizer quantas o ramo dela (a subclasse do CNAE)
-- contratou na cidade dela nos últimos 12 meses, e em quais funções. O robô dos salários (.github/workflows/salarios.yml,
-- comando "cidades" de scripts/salarios/caged.mjs) manda os pares com 10 contratações ou mais (número pequeno quase
-- aponta uma empresa); só as de carteira em tempo integral, as mesmas das faixas de salário. Os cartões de Quem contrata
-- perto e o Abriu perto de você mostram o número dizendo que é do ramo, não da empresa.

create table if not exists privado.ramos_cidades (
  -- a cidade sem acento e em minúsculas ("goiania")
  cidade text not null,
  cnae text not null check (cnae ~ '^[0-9]{7}$'),
  contratacoes integer not null check (contratacoes >= 10),
  -- as funções que mais entraram: [{ "cbo": "521110", "n": 120 }, ...]
  funcoes jsonb not null default '[]'::jsonb,
  -- o primeiro e o último mês da conta
  de date not null,
  ate date not null,
  atualizado_em timestamptz not null default now(),
  primary key (cidade, cnae)
);
alter table privado.ramos_cidades enable row level security;
revoke all on privado.ramos_cidades from public, anon, authenticated;

-- o robô: manda em lotes; o primeiro (p_limpar) apaga a conta velha
create or replace function public.servidor_ramos_cidades_salvar(
  p_chave text, p_linhas jsonb, p_de date, p_ate date, p_limpar boolean)
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
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0
     or jsonb_array_length(p_linhas) > 20000 then
    raise exception 'Mande a lista dos ramos por cidade (até 20 mil por vez).' using errcode = '22023';
  end if;
  if p_de is null or p_ate is null or p_de > p_ate then
    raise exception 'Mande o primeiro e o último mês da conta.' using errcode = '22023';
  end if;
  if p_limpar then
    delete from privado.ramos_cidades where true;
  end if;
  insert into privado.ramos_cidades (cidade, cnae, contratacoes, funcoes, de, ate)
  select lower(public.sem_acento(trim(l ->> 'cidade'))), l ->> 'cnae', (l ->> 'contratacoes')::integer,
         coalesce((select jsonb_agg(jsonb_build_object('cbo', f ->> 'cbo', 'n', (f ->> 'n')::integer))
                     from jsonb_array_elements(case when jsonb_typeof(l -> 'funcoes') = 'array'
                                                    then l -> 'funcoes' else '[]'::jsonb end) f
                    where (f ->> 'cbo') ~ '^[0-9]{6}$' and (f ->> 'n') ~ '^[0-9]{1,7}$'), '[]'::jsonb),
         p_de, p_ate
    from jsonb_array_elements(p_linhas) l
   where (l ->> 'cnae') ~ '^[0-9]{7}$' and coalesce(trim(l ->> 'cidade'), '') <> ''
     and (l ->> 'contratacoes') ~ '^[0-9]{2,7}$' and (l ->> 'contratacoes')::integer >= 10
  on conflict (cidade, cnae) do update
    set contratacoes = excluded.contratacoes, funcoes = excluded.funcoes, de = excluded.de, ate = excluded.ate,
        atualizado_em = now();
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function public.servidor_ramos_cidades_salvar(text, jsonb, date, date, boolean)
  from public, authenticated;
grant execute on function public.servidor_ramos_cidades_salvar(text, jsonb, date, date, boolean) to anon, service_role;

-- o site: o número do ramo de cada lugar da lista (pelo CNAE principal e a cidade da empresa na Receita)
create or replace function public.contratacoes_do_ramo(p_cnpjs text[])
returns table (cnpj text, cidade text, contratacoes integer, funcoes jsonb, de date, ate date)
language sql
stable
security definer
set search_path = ''
as $$
  select e.cnpj, e.cidade, r.contratacoes, r.funcoes, r.de, r.ate
    from privado.empresas_receita e
    join privado.ramos_cidades r
      on r.cnae = e.cnae and r.cidade = lower(public.sem_acento(trim(e.cidade)))
   where e.cnpj = any ((coalesce(p_cnpjs, '{}'::text[]))[1:300])
$$;
revoke execute on function public.contratacoes_do_ramo(text[]) from public;
grant execute on function public.contratacoes_do_ramo(text[]) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270708120000_contratacoes_do_ramo');
