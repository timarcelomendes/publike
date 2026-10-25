-- Quem abriu o site, com mais detalhe (24/10/2026). Pode rodar de novo sem problema.
-- 1) A hora da primeira página de cada visitante no dia (só a hora, em Goiânia): dá para
--    comparar o "hoje até agora" com o "ontem até esta hora". Não diz nada de quem visitou.
-- 2) A média por dia só com os dias inteiros (o primeiro dia contado começou no meio do dia e
--    hoje ainda não fechou), dividida pelos dias que de fato entraram, não sempre por 7.
-- 3) Por dia: com conta, sem conta, quem viu só uma página e as páginas vistas.

alter table privado.acessos_site add column if not exists hora smallint;

create or replace function public.contar_acesso(p_ip text, p_navegador text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  agora timestamp := now() at time zone 'America/Sao_Paulo';
  hoje date := agora::date;
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
  insert into privado.acessos_site as a (dia, visitante, com_conta, hora)
  values (hoje,
          sha256(convert_to(s || '|' || p_ip || '|' || left(coalesce(p_navegador, ''), 300), 'UTF8')),
          (select auth.uid()) is not null,
          extract(hour from agora)::smallint)
  on conflict (dia, visitante) do update
    set paginas = a.paginas + 1,
        com_conta = a.com_conta or excluded.com_conta;
end
$$;
revoke execute on function public.contar_acesso(text, text) from public;
grant execute on function public.contar_acesso(text, text) to anon, authenticated;

-- Admin: hoje (e ontem até a mesma hora), ontem, a média dos dias inteiros e os dias contados.
create or replace function public.admin_acessos_site()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  agora timestamp := now() at time zone 'America/Sao_Paulo';
  hoje date := agora::date;
  v_desde date;
begin
  perform privado.exigir_admin();
  select min(a.dia) into v_desde from privado.acessos_site a;
  return (
    with por_dia as (
      select a.dia,
             count(*) as visitantes,
             count(*) filter (where a.com_conta) as com_conta,
             count(*) filter (where a.paginas = 1) as so_uma,
             sum(a.paginas) as paginas
        from privado.acessos_site a
       where a.dia >= hoje - 29
       group by a.dia
    ),
    -- até 7 dias inteiros antes de hoje (o primeiro dia contado não entra: começou no meio)
    inteiros as (
      select p.* from por_dia p
       where p.dia between hoje - 7 and hoje - 1 and p.dia > v_desde
    ),
    dias as (
      select d::date as dia
        from generate_series(greatest(coalesce(v_desde, hoje), hoje - 29), hoje, interval '1 day') d
    )
    select jsonb_build_object(
      'hoje', coalesce((select p.visitantes from por_dia p where p.dia = hoje), 0),
      'com_conta_hoje', coalesce((select p.com_conta from por_dia p where p.dia = hoje), 0),
      'ontem', coalesce((select p.visitantes from por_dia p where p.dia = hoje - 1), 0),
      'hora', extract(hour from agora)::int,
      -- ontem até a mesma hora de agora (null enquanto ontem não tem a hora guardada)
      'ontem_ate_agora', (select case when count(a.hora) > 0
                                      then count(*) filter (where a.hora <= extract(hour from agora)) end
                            from privado.acessos_site a where a.dia = hoje - 1),
      'media_7d', coalesce((select round(avg(i.visitantes)) from inteiros i), 0),
      'dias_na_media', (select count(*) from inteiros),
      'paginas_por_visitante', (select round(sum(i.paginas)::numeric / nullif(sum(i.visitantes), 0), 1) from inteiros i),
      'so_uma_pagina', (select round(100.0 * sum(i.so_uma) / nullif(sum(i.visitantes), 0)) from inteiros i),
      'desde', v_desde,
      'por_dia', (select jsonb_agg(jsonb_build_object(
                           'dia', d.dia,
                           'visitantes', coalesce(p.visitantes, 0),
                           'com_conta', coalesce(p.com_conta, 0))
                         order by d.dia)
                    from dias d left join por_dia p on p.dia = d.dia)
    )
  );
end
$$;
revoke execute on function public.admin_acessos_site() from public, anon, authenticated;
grant execute on function public.admin_acessos_site() to service_role;
