-- O resumo da Base da Receita guardado (18/11/2026). Mesmo com os índices da 20270723120000, a primeira abertura depois
-- de o banco tirar os índices da memória lia uns 80 MB do disco e passava dos 8 s ("O resumo da Base da Receita não
-- abriu"; na segunda abertura, meio segundo). As contas só mudam com a carga do mês (e devagar, com o mapa), então:
--
-- 1. privado.resumo_receita: o resumo contado (uma linha) e quando foi contado;
-- 2. o robô das filas (servidor_resumo_receita) reconta a cada 6 horas e logo depois de uma carga terminar;
-- 3. admin_empresas_receita lê o guardado (só conta na hora se ainda não há nada guardado) e junta as cargas ao vivo,
--    para o "Carregando" aparecer na hora.
--
-- Pode rodar de novo.

create table if not exists privado.resumo_receita (
  id boolean primary key default true check (id),
  dados jsonb not null,
  calculado_em timestamptz not null default now()
);
alter table privado.resumo_receita enable row level security;
revoke all on table privado.resumo_receita from public, anon, authenticated;

-- as contas (as mesmas de antes, sem as cargas)
create or replace function privado.contar_resumo_receita()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ref date := privado.ultima_abertura();
begin
  return jsonb_build_object(
    'ativas', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and not e.mei),
    'meis_na_base', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.mei),
    'agencias_mei', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.agencia and e.mei),
    'na_praca', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.na_praca and not e.mei),
    'com_ponto', (select count(*) from privado.empresas_receita e
                   where e.situacao = 'ativa' and not e.mei and e.local is not null),
    'agencias', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.agencia),
    'abertas_60_dias', (select count(*) from privado.empresas_receita e
                         where e.situacao = 'ativa' and e.na_praca and not e.mei and e.data_abertura >= v_ref - 60),
    'por_cidade', coalesce((select jsonb_agg(jsonb_build_object('cidade', x.cidade, 'quantas', x.n) order by x.n desc)
                             from (select e.cidade, count(*) as n from privado.empresas_receita e
                                    where e.situacao = 'ativa' and e.na_praca and not e.mei group by e.cidade) x), '[]'::jsonb),
    'meis', (select coalesce(sum(m.quantos), 0) from privado.mei_por_bairro m),
    'meis_60_dias', (select coalesce(sum(m.quantos), 0) from privado.mei_por_bairro m
                      where m.mes_abertura >= date_trunc('month', v_ref - 60)),
    'ramos_com_nome', (select count(*) from privado.ramos_do_publike),
    'ramos_funcoes', (select count(*) from privado.ramos_funcoes));
end
$$;
revoke all on function privado.contar_resumo_receita() from public;

create or replace function privado.guardar_resumo_receita()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into privado.resumo_receita (id, dados, calculado_em)
  values (true, privado.contar_resumo_receita(), now())
  on conflict (id) do update set dados = excluded.dados, calculado_em = excluded.calculado_em;
  return now();
end
$$;
revoke all on function privado.guardar_resumo_receita() from public;

-- 2. O robô: reconta a cada 6 horas e depois de uma carga terminar ---------------------------------------------------

create or replace function public.servidor_resumo_receita(p_chave text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_quando timestamptz;
begin
  perform privado.exigir_servidor(p_chave);
  select r.calculado_em into v_quando from privado.resumo_receita r where r.id;
  if v_quando is not null
     and v_quando > now() - interval '6 hours'
     and not exists (select 1 from privado.cargas_receita c where c.terminou_em >= v_quando) then
    return false;
  end if;
  perform privado.guardar_resumo_receita();
  return true;
end
$$;
revoke execute on function public.servidor_resumo_receita(text) from public;
grant execute on function public.servidor_resumo_receita(text) to anon, authenticated, service_role;

-- 3. A tela: o guardado, quando foi contado e as cargas ao vivo --------------------------------------------------------

create or replace function public.admin_empresas_receita()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_dados jsonb;
  v_quando timestamptz;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  select r.dados, r.calculado_em into v_dados, v_quando from privado.resumo_receita r where r.id;
  if v_dados is null then
    v_quando := privado.guardar_resumo_receita();
    select r.dados into v_dados from privado.resumo_receita r where r.id;
  end if;
  return v_dados || jsonb_build_object(
    'calculado_em', v_quando,
    'cargas', coalesce((select jsonb_agg(jsonb_build_object('mes', c.mes, 'situacao', c.situacao,
                          'comecou_em', c.comecou_em, 'terminou_em', c.terminou_em,
                          'estabelecimentos', c.estabelecimentos, 'resumo', c.resumo) order by c.mes desc)
                        from (select * from privado.cargas_receita order by mes desc limit 6) c), '[]'::jsonb));
end
$$;
revoke execute on function public.admin_empresas_receita() from public, anon;
grant execute on function public.admin_empresas_receita() to authenticated, service_role;

-- a primeira contagem já sai aqui (o editor de SQL não tem o limite de 8 s)
select privado.guardar_resumo_receita();

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270725120000_resumo_da_receita_guardado');
