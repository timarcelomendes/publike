-- "Navegadores com conta hoje" sem a equipe (12/11/2026).
--
-- "Contas que entraram hoje" (admin_presenca) já deixa de fora as contas da equipe (moderadores e quem vê o painel
-- no site); o "com conta" de admin_acessos_site contava todo navegador logado, a equipe junto. A tabela de
-- acessos não guarda a conta (só o código do navegador do dia): a marca `equipe` é posta na hora, por gatilho,
-- quando quem abre é da equipe. Os dias de antes ficam como estavam (sem a marca, contam como antes).

alter table privado.acessos_site add column if not exists equipe boolean not null default false;

create or replace function privado.acesso_da_equipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := (select auth.uid());
begin
  if v_conta is not null and not new.equipe then
    new.equipe := exists (select 1 from public.moderadores m where m.perfil_id = v_conta)
               or exists (select 1 from privado.painel_no_site p where p.usuario_id = v_conta);
  end if;
  return new;
end
$$;
revoke execute on function privado.acesso_da_equipe() from public;

drop trigger if exists acesso_da_equipe on privado.acessos_site;
create trigger acesso_da_equipe before insert or update on privado.acessos_site
  for each row execute function privado.acesso_da_equipe();

-- a de 20261114120000, com o "com conta" sem a equipe
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
             -- sem a equipe (moderadores e quem vê o painel no site), como em "Contas que entraram hoje"
             count(*) filter (where a.com_conta and not a.equipe) as com_conta,
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
