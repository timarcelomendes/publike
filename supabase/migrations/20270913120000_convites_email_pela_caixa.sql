-- O convite por e-mail de Admin › Convites pela caixa do Marcelo, com limite por dia (22/11/2026; Marcelo: "concordo").
-- Até aqui, o e-mail do convite saía pelo serviço dos avisos do site (o ZeptoMail), que só aceita e-mail transacional: um
-- bloqueio por prospecção pararia também os links de entrar e os avisos. Agora sai pela caixa marcelo@publike.org (a do
-- "E-mail às empresas", GoDaddy, com a cópia em Enviados), com no máximo N por dia (50 para começar; a caixa aceita 500
-- pelo SMTP). E o convite guarda por onde saiu (`enviada_por`): o contador de "uns 10 por hora" conta só o WhatsApp.
-- Pode rodar de novo.

alter table public.convites add column if not exists enviada_por text;
alter table public.convites drop constraint if exists convites_enviada_por_check;
alter table public.convites add constraint convites_enviada_por_check
  check (enviada_por is null or enviada_por in ('whatsapp', 'email'));

alter table privado.email_empresas add column if not exists convites_por_dia integer not null default 50;
alter table privado.email_empresas drop constraint if exists email_empresas_convites_por_dia;
alter table privado.email_empresas add constraint email_empresas_convites_por_dia check (convites_por_dia between 1 and 300);

-- quantos convites por e-mail hoje (os registrados em Enviados, desde a meia-noite de Brasília), o limite e o remetente
create or replace function public.admin_convites_email()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return jsonb_build_object(
    'por_dia', coalesce((select e.convites_por_dia from privado.email_empresas e where e.id), 50),
    'remetente_nome', (select e.remetente_nome from privado.email_empresas e where e.id),
    'hoje', (select count(*) from privado.fila_emails f
              where f.modelo = 'convite_convidado' and f.status = 'enviado'
                and f.criado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')));
end
$$;

create or replace function public.admin_convites_email_por_dia(p_por_dia integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  update privado.email_empresas
     set convites_por_dia = least(greatest(coalesce(p_por_dia, 50), 1), 300), atualizado_em = now()
   where id;
end
$$;
revoke execute on function public.admin_convites_email(), public.admin_convites_email_por_dia(integer) from public, anon, authenticated;
grant execute on function public.admin_convites_email(), public.admin_convites_email_por_dia(integer) to service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270913120000_convites_email_pela_caixa');
