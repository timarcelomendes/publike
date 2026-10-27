-- Admin › E-mails › Enviados (27/10/2026): quantos e-mails saíram desde uma data, para acompanhar os
-- créditos do ZeptoMail (o saldo comprado vai sendo gasto, um crédito por e-mail). Só o total, sem quem
-- recebeu. Só o service_role. Pode rodar de novo.

create or replace function public.admin_emails_enviados_desde(p_desde timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from privado.fila_emails f
   where f.status = 'enviado' and f.enviado_em >= p_desde
$$;

revoke execute on function public.admin_emails_enviados_desde(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_emails_enviados_desde(timestamptz) to service_role;
