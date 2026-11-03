-- Admin › Testadores do app: as pessoas que toparam testar o app na Play (o teste fechado pela lista de e-mails, sem
-- o Grupo do Google). O admin cola o nome, o e-mail da conta Google da Play Store e o WhatsApp; copia os e-mails para
-- a lista da Play Console; e manda o convite pelo WhatsApp ou pelo e-mail dele (o Publike não manda nada sozinho: só
-- monta a mensagem e marca quando o admin tocou). Só o admin (service_role). Pode rodar de novo.

create table if not exists privado.testadores_app (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 1 and 80),
  email text not null unique check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  whatsapp text check (whatsapp is null or whatsapp ~ '^55[1-9][0-9]{9,10}$'),
  whatsapp_em timestamptz,
  email_em timestamptz,
  criado_em timestamptz not null default now()
);
alter table privado.testadores_app enable row level security;
revoke all on privado.testadores_app from public, anon, authenticated;

create or replace function public.admin_testadores_app()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.criado_em, t.nome), '[]'::jsonb) from privado.testadores_app t
$$;

-- a lista colada: [{nome, email, whatsapp}]; o mesmo e-mail atualiza o nome e o WhatsApp. Devolve quantos entraram.
create or replace function public.admin_salvar_testadores_app(p_lista jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
  n integer := 0;
begin
  if jsonb_typeof(p_lista) <> 'array' or jsonb_array_length(p_lista) > 200 then
    raise exception 'Lista inválida.' using errcode = '22023';
  end if;
  for v in select * from jsonb_array_elements(p_lista) loop
    insert into privado.testadores_app (nome, email, whatsapp)
    values (left(btrim(v ->> 'nome'), 80), lower(btrim(v ->> 'email')), nullif(v ->> 'whatsapp', ''))
    on conflict (email) do update
      set nome = excluded.nome, whatsapp = coalesce(excluded.whatsapp, privado.testadores_app.whatsapp);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- o admin tocou em mandar (whatsapp ou email): marca a hora
create or replace function public.admin_marcar_convite_testador(p_id uuid, p_canal text)
returns void
language sql
security definer
set search_path = ''
as $$
  update privado.testadores_app
     set whatsapp_em = case when p_canal = 'whatsapp' then now() else whatsapp_em end,
         email_em = case when p_canal = 'email' then now() else email_em end
   where id = p_id
$$;

create or replace function public.admin_apagar_testador(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from privado.testadores_app where id = p_id
$$;

revoke execute on function public.admin_testadores_app(), public.admin_salvar_testadores_app(jsonb),
  public.admin_marcar_convite_testador(uuid, text), public.admin_apagar_testador(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_testadores_app(), public.admin_salvar_testadores_app(jsonb),
  public.admin_marcar_convite_testador(uuid, text), public.admin_apagar_testador(uuid)
  to service_role;

notify pgrst, 'reload schema';
