-- Logo no topo dos e-mails.
--
-- Os e-mails do site saem com a logo do Publike no topo (dá para desligar no
-- admin). O admin também pode trocar a imagem: ela fica no Storage, na pasta
-- pública "marca", e o endereço fica em config_site. Sem endereço, vale a
-- logo do Publike que está no próprio site (/logo/publike-logo-email.png).
-- Os e-mails de entrar e de confirmar o cadastro (modelos no Supabase) usam
-- /email/logo.png, que segue a mesma escolha.
--
-- Rode depois de 20261009280000_enderecos.sql (pode rodar de novo sem problema).

-- 1. Configuração -----------------------------------------------------------------

alter table public.config_site
  add column if not exists email_logo boolean not null default true,
  add column if not exists email_logo_url text;

alter table public.config_site drop constraint if exists config_site_email_logo_url_check;
alter table public.config_site add constraint config_site_email_logo_url_check
  check (email_logo_url is null
         or (char_length(email_logo_url) <= 500 and email_logo_url ~ '^https?://[^[:space:]"''<>\\]+$'));


-- 2. Imagens da marca (Storage) -------------------------------------------------------
-- Pública para leitura (a imagem aparece nos e-mails). Só o admin envia: sem
-- regras de RLS para anon e authenticated, só a chave secreta grava aqui.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marca', 'marca', true, 524288, array['image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- 3. Funções ---------------------------------------------------------------------------

-- Sem login: a logo aparece em todo e-mail, não é segredo.
create or replace function public.logo_emails()
returns table (mostrar boolean, url text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.email_logo, c.email_logo_url from public.config_site c
$$;

-- Admin: mostrar ou não a logo e qual imagem usar (vazio = a do Publike).
create or replace function public.admin_salvar_logo_emails(p_mostrar boolean, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  endereco text := nullif(btrim(coalesce(p_url, '')), '');
begin
  perform privado.exigir_admin();
  if endereco is not null
     and (char_length(endereco) > 500 or endereco !~ '^https?://[^[:space:]"''<>\\]+$') then
    raise exception 'Endereço da logo inválido.' using errcode = 'P0001';
  end if;
  update public.config_site
     set email_logo = coalesce(p_mostrar, true),
         email_logo_url = endereco,
         atualizado_em = now(),
         atualizado_por = (select auth.uid())
   where id;
  perform privado.registrar('salvar_config', 'config', 'logo_emails', 'Logo dos e-mails',
                            jsonb_build_object('mostrar', coalesce(p_mostrar, true), 'propria', endereco is not null));
end
$$;


-- 4. Permissões ------------------------------------------------------------------------

revoke execute on function public.logo_emails() from public;
grant execute on function public.logo_emails() to anon, authenticated, service_role;

revoke execute on function public.admin_salvar_logo_emails(boolean, text) from public, anon, authenticated;
grant execute on function public.admin_salvar_logo_emails(boolean, text) to service_role;

notify pgrst, 'reload schema';
