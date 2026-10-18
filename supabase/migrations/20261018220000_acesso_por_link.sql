-- Acesso pelo link (WhatsApp): a conta que o admin criou sem e-mail (a empresa disse "sim" no
-- WhatsApp e a vaga foi publicada por ela) recebe um link /acesso/<token>. A empresa abre, digita
-- o e-mail e ele vira o login da conta (o Publike entra só pelo e-mail) e o e-mail de contato.
-- O link vale uma vez e por 30 dias. Quem já tem e-mail de login não troca por aqui.

create table if not exists public.acessos_conta (
  token text primary key check (token ~ '^[0-9a-f]{64}$'),
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '30 days',
  usado_em timestamptz,
  email text
);
create index if not exists acessos_conta_perfil_idx on public.acessos_conta (perfil_id);
alter table public.acessos_conta enable row level security;
revoke all on public.acessos_conta from anon, authenticated;
grant select, insert, update, delete on public.acessos_conta to service_role;

-- A página /acesso/<token>: de quem é a conta, a vaga e se o link ainda vale
create or replace function public.acesso_do_link(p_token text)
returns table (nome text, vaga text, situacao text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.acessos_conta;
  tem_email boolean;
begin
  if p_token !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  select * into a from public.acessos_conta where token = p_token;
  if not found then
    return;
  end if;
  select coalesce(u.email, '') <> '' into tem_email from auth.users u where u.id = a.perfil_id;
  return query
    select p.nome,
           (select an.titulo from public.anuncios an
             where an.autor_id = p.id and an.tipo = 'vaga' order by an.criado_em desc limit 1),
           case
             when a.usado_em is not null then 'usado'
             when a.expira_em < now() then 'expirado'
             when coalesce(tem_email, false) then 'ja_tem_email'
             else 'valido'
           end
      from public.perfis p
     where p.id = a.perfil_id;
end
$$;
revoke execute on function public.acesso_do_link(text) from public;
grant execute on function public.acesso_do_link(text) to anon, authenticated;

-- A empresa digitou o e-mail: vira o login da conta (já confirmado) e o e-mail de contato
create or replace function public.vincular_email_do_link(p_token text, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.acessos_conta;
  v_email text := lower(btrim(coalesce(p_email, '')));
  atual text;
begin
  if p_token !~ '^[0-9a-f]{64}$' then
    return 'invalido';
  end if;
  select * into a from public.acessos_conta where token = p_token for update;
  if not found then
    return 'invalido';
  end if;
  if a.usado_em is not null then
    return 'usado';
  end if;
  if a.expira_em < now() then
    return 'expirado';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 200 then
    return 'email_invalido';
  end if;
  select coalesce(u.email, '') into atual from auth.users u where u.id = a.perfil_id;
  if atual is null then
    return 'invalido';
  end if;
  if atual <> '' then
    return 'ja_tem_email';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email and u.id <> a.perfil_id) then
    return 'email_em_uso';
  end if;

  update auth.users
     set email = v_email,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = a.perfil_id;
  -- a identidade de e-mail (como a que o Supabase cria ao confirmar um e-mail)
  if not exists (select 1 from auth.identities i where i.user_id = a.perfil_id and i.provider = 'email') then
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (
      a.perfil_id::text,
      a.perfil_id,
      jsonb_build_object('sub', a.perfil_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
      'email',
      now(),
      now()
    );
  end if;
  update public.contatos set email = coalesce(email, v_email), atualizado_em = now() where perfil_id = a.perfil_id;
  update public.acessos_conta set usado_em = now(), email = v_email where token = p_token;
  return 'ok';
end
$$;
revoke execute on function public.vincular_email_do_link(text, text) from public;
grant execute on function public.vincular_email_do_link(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
