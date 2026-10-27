-- Admin › E-mails › Enviados (27/10/2026): quantos e-mails saíram por dia (no horário de Brasília), para
-- acompanhar o limite diário do ZeptoMail. Só os totais, sem quem recebeu. Só o service_role.
-- Pode rodar de novo.

create or replace function public.admin_emails_por_dia(p_dias integer default 7)
returns table (dia date, enviados integer, falharam integer, na_fila integer)
language sql
stable
security definer
set search_path = ''
as $$
  with dias as (
    select (generate_series(
              (now() at time zone 'America/Sao_Paulo')::date - (least(greatest(coalesce(p_dias, 7), 1), 31) - 1),
              (now() at time zone 'America/Sao_Paulo')::date,
              interval '1 day'))::date as dia
  )
  select d.dia,
         (select count(*) from privado.fila_emails f
           where f.status = 'enviado' and (f.enviado_em at time zone 'America/Sao_Paulo')::date = d.dia)::integer,
         (select count(*) from privado.fila_emails f
           where f.status = 'falhou' and (f.criado_em at time zone 'America/Sao_Paulo')::date = d.dia)::integer,
         (select count(*) from privado.fila_emails f
           where f.status in ('pendente', 'enviando') and (f.criado_em at time zone 'America/Sao_Paulo')::date = d.dia)::integer
    from dias d
   order by d.dia desc
$$;

revoke execute on function public.admin_emails_por_dia(integer) from public, anon, authenticated;
grant execute on function public.admin_emails_por_dia(integer) to service_role;
