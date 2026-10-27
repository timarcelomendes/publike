-- Admin › E-mails › Enviados (27/10/2026): os créditos do ZeptoMail. Sem API para ler o saldo, a equipe
-- informa no admin quantos e-mails o ZeptoMail mostra disponíveis e o próximo vencimento. O site conta os
-- enviados desde então (um crédito por e-mail). Só totais, sem quem recebeu. Só o service_role.
-- Pode rodar de novo.

drop function if exists public.admin_emails_enviados_desde(timestamptz);

create table if not exists privado.creditos_email (
  id boolean primary key default true check (id),   -- uma linha só
  emails integer not null check (emails between 0 and 100000000),   -- disponíveis quando foi informado
  total integer check (total between 1 and 100000000),               -- o "/ 20000" do ZeptoMail
  vence_em date,
  contado_em timestamptz not null default now()
);
alter table privado.creditos_email enable row level security;

-- o saldo informado e quantos saíram desde que foi informado
create or replace function public.admin_creditos_email()
returns table (emails integer, total integer, vence_em date, contado_em timestamptz, enviados integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.emails, c.total, c.vence_em, c.contado_em,
         (select count(*) from privado.fila_emails f
           where f.status = 'enviado' and f.enviado_em >= c.contado_em)::integer
    from privado.creditos_email c
$$;

drop function if exists public.admin_salvar_creditos_email(integer, date);
create or replace function public.admin_salvar_creditos_email(p_emails integer, p_total integer, p_vence_em date)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into privado.creditos_email (id, emails, total, vence_em, contado_em)
  values (true, p_emails, p_total, p_vence_em, now())
  on conflict (id) do update
    set emails = excluded.emails, total = excluded.total, vence_em = excluded.vence_em, contado_em = now()
$$;

revoke execute on function public.admin_creditos_email() from public, anon, authenticated;
revoke execute on function public.admin_salvar_creditos_email(integer, integer, date) from public, anon, authenticated;
grant execute on function public.admin_creditos_email() to service_role;
grant execute on function public.admin_salvar_creditos_email(integer, integer, date) to service_role;
