-- E-mail às empresas: a cópia em "Enviados" (18/11/2026). Marcelo: "mas em qual caixa eu confiro o envio?" e "sim"
-- para guardar a cópia. O SMTP da GoDaddy não guarda o que sai; o robô põe a mesma mensagem na pasta de enviados da
-- caixa pelo IMAP (src/lib/servidor/email-empresas.ts). Aqui fica o resultado da última cópia, para o Admin mostrar
-- quando ela falha (o e-mail já saiu: só a cópia não ficou).
-- Pode rodar de novo.

alter table privado.email_empresas add column if not exists copia_erro text;
alter table privado.email_empresas add column if not exists copia_em timestamptz;

create or replace function public.servidor_email_empresas_copia(p_chave text, p_erro text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.email_empresas
     set copia_erro = left(nullif(btrim(coalesce(p_erro, '')), ''), 300), copia_em = now()
   where id;
end
$$;
revoke execute on function public.servidor_email_empresas_copia(text, text) from public;
grant execute on function public.servidor_email_empresas_copia(text, text) to anon, authenticated, service_role;

-- a tela: a última cópia (null: nenhuma tentada ainda)
create or replace function public.admin_email_empresas_copia()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg privado.email_empresas;
begin
  perform privado.exigir_equipe_email_empresas();
  select * into cfg from privado.email_empresas where id;
  if cfg.copia_em is null then
    return null;
  end if;
  return jsonb_build_object('erro', cfg.copia_erro, 'em', cfg.copia_em);
end
$$;
revoke execute on function public.admin_email_empresas_copia() from public, anon;
grant execute on function public.admin_email_empresas_copia() to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270729120000_email_empresas_copia_em_enviados');
