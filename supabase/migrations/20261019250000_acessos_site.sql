-- Quantas pessoas abriram o site, por dia (19/10/2026). Pode rodar de novo sem problema.
-- Sem cookie e sem guardar nada de quem visitou: o site manda o IP e o navegador, o banco
-- mistura com um sorteio do dia e guarda só o resultado (um código). O sorteio de cada dia
-- é apagado no dia seguinte, e aí nem o banco consegue saber de quem era o código. Por isso
-- dá para contar visitantes de cada dia, mas não somar a mesma pessoa em dias diferentes.

create table if not exists privado.sorteio_acessos (
  dia date primary key,
  sorteio text not null default gen_random_uuid()::text
);
alter table privado.sorteio_acessos enable row level security;
revoke all on table privado.sorteio_acessos from public, anon, authenticated;

create table if not exists privado.acessos_site (
  dia date not null,
  visitante bytea not null,
  com_conta boolean not null default false,
  paginas integer not null default 1,
  primary key (dia, visitante)
);
alter table privado.acessos_site enable row level security;
revoke all on table privado.acessos_site from public, anon, authenticated;

-- Chamada pelo site a cada página aberta inteira (robôs ficam de fora lá). Mesmo IP e
-- navegador no mesmo dia: a mesma pessoa, que só soma páginas.
create or replace function public.contar_acesso(p_ip text, p_navegador text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  s text;
begin
  if coalesce(p_ip, '') = '' or length(p_ip) > 64 then
    return;
  end if;
  select a.sorteio into s from privado.sorteio_acessos a where a.dia = hoje;
  if s is null then
    insert into privado.sorteio_acessos (dia) values (hoje) on conflict (dia) do nothing;
    select a.sorteio into s from privado.sorteio_acessos a where a.dia = hoje;
    -- o sorteio de ontem para trás não serve mais: sem ele, ninguém liga o código à pessoa
    delete from privado.sorteio_acessos a where a.dia < hoje;
  end if;
  -- trava contra enxurrada: um dia normal fica muito abaixo disso
  if (select count(*) from privado.acessos_site a where a.dia = hoje) >= 200000 then
    return;
  end if;
  insert into privado.acessos_site as a (dia, visitante, com_conta)
  values (hoje,
          sha256(convert_to(s || '|' || p_ip || '|' || left(coalesce(p_navegador, ''), 300), 'UTF8')),
          (select auth.uid()) is not null)
  on conflict (dia, visitante) do update
    set paginas = a.paginas + 1,
        com_conta = a.com_conta or excluded.com_conta;
end
$$;
revoke execute on function public.contar_acesso(text, text) from public;
grant execute on function public.contar_acesso(text, text) to anon, authenticated;

-- Admin: visitantes de hoje, de ontem, a média dos últimos 7 dias e os últimos 30 dias.
create or replace function public.admin_acessos_site()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform privado.exigir_admin();
  return (
    with dias as (
      select d::date as dia from generate_series(hoje - 29, hoje, interval '1 day') d
    ),
    por_dia as (
      select a.dia, count(*) as visitantes, count(*) filter (where a.com_conta) as com_conta
        from privado.acessos_site a
       where a.dia >= hoje - 29
       group by a.dia
    )
    select jsonb_build_object(
      'hoje', coalesce((select p.visitantes from por_dia p where p.dia = hoje), 0),
      'com_conta_hoje', coalesce((select p.com_conta from por_dia p where p.dia = hoje), 0),
      'ontem', coalesce((select p.visitantes from por_dia p where p.dia = hoje - 1), 0),
      -- só os dias já fechados (ontem e os 6 antes)
      'media_7d', coalesce((select round(sum(p.visitantes) / 7.0) from por_dia p
                             where p.dia between hoje - 7 and hoje - 1), 0),
      'desde', (select min(a.dia) from privado.acessos_site a),
      'por_dia', (select jsonb_agg(jsonb_build_object('dia', d.dia, 'visitantes', coalesce(p.visitantes, 0))
                                   order by d.dia)
                    from dias d left join por_dia p on p.dia = d.dia)
    )
  );
end
$$;
revoke execute on function public.admin_acessos_site() from public, anon, authenticated;
grant execute on function public.admin_acessos_site() to service_role;
