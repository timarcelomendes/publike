-- Painel do admin: o histórico guardado (claude/plano-indicadores-do-admin.md, parte 3). Pode rodar de novo.
-- Rode depois de 20270331120000_indicadores_do_admin.sql.
--
-- 1) privado.indicadores_dia: os números de cada dia (privado.indicadores_entre, sem a equipe), com a versão da regra.
--    O dia em que ainda não se contavam os visitantes guarda visitantes = null (lacuna, não zero).
-- 2) public.servidor_guardar_indicadores(chave): o /api/filas chama a cada rodada; guarda ontem (e os dias que
--    faltarem nas últimas 2 semanas) uma vez só.
-- 3) Na migração, os dias de antes são recontados com o que tem data guardada.
-- 4) public.admin_historico_indicadores(semanas): as últimas N semanas (até ontem), somando os dias, mais as pessoas
--    ativas de cada semana (contas diferentes, contadas na hora).
-- 5) painel_no_site_indicadores passa a levar o histórico.

create table if not exists privado.indicadores_dia (
  dia date primary key,
  numeros jsonb not null,
  versao smallint not null,
  gerado_em timestamptz not null default now()
);
alter table privado.indicadores_dia enable row level security;
revoke all on privado.indicadores_dia from public, anon, authenticated;

-- a regra de agora (privado.indicadores_entre de 20270331120000): mudou a regra, sobe o número
create or replace function privado.versao_dos_indicadores()
returns smallint
language sql
immutable
set search_path = ''
as $$ select 1::smallint $$;

create or replace function privado.guardar_indicadores_dia(p_dia date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  ini timestamptz := p_dia::timestamp at time zone 'America/Sao_Paulo';
  fim timestamptz := (p_dia + 1)::timestamp at time zone 'America/Sao_Paulo';
  v jsonb;
  primeiro_visitante date := (select min(s.dia) from privado.acessos_site s);
begin
  v := privado.indicadores_entre(ini, fim, false);
  if primeiro_visitante is null or p_dia < primeiro_visitante then
    v := v || jsonb_build_object('visitantes', null);
  end if;
  insert into privado.indicadores_dia (dia, numeros, versao, gerado_em)
  values (p_dia, v, privado.versao_dos_indicadores(), now())
  on conflict (dia) do update set numeros = excluded.numeros, versao = excluded.versao, gerado_em = now();
end
$$;
revoke execute on function privado.guardar_indicadores_dia(date) from public, anon, authenticated;

-- Volatile (as servidor_* nunca são stable). Devolve quantos dias guardou.
create or replace function public.servidor_guardar_indicadores(p_chave text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  d date;
  n integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  -- depois das 00:15 em Goiânia, para o dia de ontem estar fechado
  if (now() at time zone 'America/Sao_Paulo')::time < time '00:15' then
    return 0;
  end if;
  for d in
    select g::date from generate_series(hoje - 14, hoje - 1, interval '1 day') g
     where not exists (select 1 from privado.indicadores_dia x where x.dia = g::date)
       and g::date >= coalesce((select (min(u.created_at) at time zone 'America/Sao_Paulo')::date from auth.users u), hoje)
  loop
    perform privado.guardar_indicadores_dia(d);
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function public.servidor_guardar_indicadores(text) from public;
grant execute on function public.servidor_guardar_indicadores(text) to anon, authenticated, service_role;

-- os dias de antes, do primeiro cadastro até ontem (só os que faltam)
do $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  d date;
begin
  for d in
    select g::date
      from generate_series(
             coalesce((select (min(u.created_at) at time zone 'America/Sao_Paulo')::date from auth.users u), hoje),
             hoje - 1, interval '1 day') g
     where not exists (select 1 from privado.indicadores_dia x where x.dia = g::date)
  loop
    perform privado.guardar_indicadores_dia(d);
  end loop;
end
$$;

create or replace function public.admin_historico_indicadores(p_semanas integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  semanas integer := least(greatest(coalesce(p_semanas, 12), 2), 53);
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v jsonb;
begin
  perform privado.exigir_admin();
  with blocos as (
    select k, hoje - 7 * (k + 1) as inicio, hoje - 7 * k - 1 as fim
      from generate_series(0, semanas - 1) k
  ),
  somas as (
    select b.k, b.inicio, b.fim,
           count(x.dia) as dias_guardados,
           count(x.dia) filter (where x.numeros ->> 'visitantes' is null) as dias_sem_visitantes
      from blocos b
      left join privado.indicadores_dia x on x.dia between b.inicio and b.fim
     group by b.k, b.inicio, b.fim
  )
  select jsonb_build_object(
    'semanas', coalesce(jsonb_agg(
      jsonb_build_object('inicio', s.inicio, 'fim', s.fim, 'dias_guardados', s.dias_guardados)
        || coalesce((select jsonb_object_agg(t.chave, t.total)
                       from (select e.key as chave, sum((e.value)::numeric) as total
                               from privado.indicadores_dia x, jsonb_each(x.numeros) e
                              where x.dia between s.inicio and s.fim and jsonb_typeof(e.value) = 'number'
                              group by e.key) t), '{}'::jsonb)
        -- a semana com dia sem visitantes contados não tem o total de visitantes
        || case when s.dias_sem_visitantes > 0 or s.dias_guardados = 0
                then jsonb_build_object('visitantes', null) else '{}'::jsonb end
        || case when s.dias_guardados = 0 then '{}'::jsonb
                else privado.ativos_entre(s.inicio, s.fim, false) end
      order by s.inicio), '[]'::jsonb),
    'desde', (select min(x.dia) from privado.indicadores_dia x)
  ) into v
    from somas s;
  return v;
end
$$;
revoke execute on function public.admin_historico_indicadores(integer) from public, anon, authenticated;
grant execute on function public.admin_historico_indicadores(integer) to service_role;

-- Equipe › Números: os indicadores, a oferta e procura e o histórico
create or replace function public.painel_no_site_indicadores(p_dias integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not privado.pode_ver_painel_no_site() then
    raise exception 'Só a equipe do Publike vê o painel.' using errcode = '42501';
  end if;
  perform set_config('publike.painel_no_site', 'sim', true);
  v := jsonb_build_object(
    'indicadores', public.admin_indicadores(p_dias, false),
    'oferta', public.admin_oferta_procura(case when p_dias in (7, 30, 90) then p_dias else 30 end, false),
    'historico', public.admin_historico_indicadores(12)
  );
  perform set_config('publike.painel_no_site', '', true);
  return v;
exception when others then
  perform set_config('publike.painel_no_site', '', true);
  raise;
end
$$;
revoke execute on function public.painel_no_site_indicadores(integer) from public, anon;
grant execute on function public.painel_no_site_indicadores(integer) to authenticated;

notify pgrst, 'reload schema';
