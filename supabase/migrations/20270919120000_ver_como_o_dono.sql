-- Ver como o dono (24/11/2026; Marcelo: "quero uma maneira de ver como os donos das vagas enxergam suas vagas, status,
-- candidatos"). A equipe publike.org abre, em Admin › Usuários, o painel de uma conta como o dono vê, só olhando.
--
-- Como funciona: a mesma troca de conta da equipe da agência (privado.conta_ativa e o gancho do token). Quem é da
-- equipe grava em privado.olhando a conta e até quando (1 hora); o gancho põe no token "conta" e "papel": "olhar";
-- public.conta_atual() devolve a conta (conferindo, a cada chamada, a linha, o prazo e que a pessoa é da equipe) e
-- public.papel_na_conta() devolve "dono", para a tela ser a mesma do dono.
--
-- Só olhar: (1) o PostgREST roda public.antes_da_requisicao() antes de cada pedido, e com "papel": "olhar" no token a
-- transação vira somente leitura (nenhuma tabela muda, nem pelas funções security definer); só o parar_de_olhar
-- escapa. (2) O proxy do site recusa os POST (ações do servidor e a API) de quem está olhando. (3) A faixa do alto
-- para os toques nos botões que mudam algo.
--
-- Cada abertura fica no registro da equipe ("viu o painel como").

create table if not exists privado.olhando (
  usuario_id uuid primary key references public.perfis (id) on delete cascade,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  desde timestamptz not null default now(),
  ate timestamptz not null,
  check (usuario_id <> conta_id)
);
revoke all on privado.olhando from public, anon, authenticated;
grant select, insert, update, delete on privado.olhando to service_role;

-- a conta que a pessoa está olhando agora (o token diz "olhar" e a linha vale), ou null
create or replace function privado.conta_olhada()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'papel', '') <> 'olhar'
             then null
           else (select o.conta_id
                   from privado.olhando o
                  where o.usuario_id = (select auth.uid())
                    and o.conta_id::text = (select auth.jwt() ->> 'conta')
                    and o.ate > now()
                    and privado.equipe_publike())
         end
$$;
revoke execute on function privado.conta_olhada() from public;
grant execute on function privado.conta_olhada() to anon, authenticated, service_role;

create or replace function public.conta_atual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select e.agencia_id
       from public.equipe_agencia e
      where e.membro_id = (select auth.uid())
        and e.agencia_id::text = (select auth.jwt() ->> 'conta')),
    (select privado.conta_olhada()),
    (select auth.uid()))
$$;

-- olhando, o papel é o do dono (a tela é a do dono; o que muda, a transação somente leitura recusa)
create or replace function public.papel_na_conta()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when (select auth.uid()) is null then null
           when (select public.conta_atual()) = (select auth.uid()) then 'dono'
           when (select privado.conta_olhada()) is not null then 'dono'
           else (select e.papel from public.equipe_agencia e
                  where e.agencia_id = (select public.conta_atual()) and e.membro_id = (select auth.uid()))
         end
$$;

revoke execute on function public.conta_atual(), public.papel_na_conta() from public;
grant execute on function public.conta_atual(), public.papel_na_conta() to anon, authenticated, service_role;

-- o gancho do token: a conta da equipe da agência (como antes) ou, sem ela, a conta olhada (até o fim do prazo)
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_conta uuid;
  v_papel text;
begin
  select e.agencia_id, e.papel into v_conta, v_papel
    from privado.conta_ativa c
    join public.equipe_agencia e on e.agencia_id = c.agencia_id and e.membro_id = c.usuario_id
   where c.usuario_id = (event ->> 'user_id')::uuid;
  if v_conta is null then
    select o.conta_id, 'olhar' into v_conta, v_papel
      from privado.olhando o
     where o.usuario_id = (event ->> 'user_id')::uuid
       and o.ate > now();
  end if;
  v_claims := v_claims - 'conta' - 'papel';
  if v_conta is not null then
    v_claims := v_claims || jsonb_build_object('conta', v_conta, 'papel', v_papel);
  end if;
  return jsonb_set(event, '{claims}', v_claims);
exception
  when others then
    -- nunca trava o login: sem a conta da equipe, a pessoa entra na própria
    return event;
end
$$;

revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
    grant usage on schema privado to supabase_auth_admin;
    grant select on privado.olhando to supabase_auth_admin;
  end if;
end
$$;

-- começar a olhar: só a equipe publike.org (com login), por 1 hora; sai da conta da agência, se estava nela
create or replace function public.equipe_comecar_a_olhar(p_conta uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_nome text;
begin
  if eu is null or not privado.equipe_publike() then
    raise exception 'Só a equipe do Publike, com a conta publike.org, vê como o dono.' using errcode = '42501';
  end if;
  if p_conta is null or p_conta = eu then
    raise exception 'Escolha outra conta.' using errcode = '22023';
  end if;
  select coalesce(nullif(p.nome, ''), 'conta') into v_nome from public.perfis p where p.id = p_conta;
  if v_nome is null then
    raise exception 'Conta não encontrada.' using errcode = 'P0002';
  end if;
  delete from privado.conta_ativa c where c.usuario_id = eu;
  insert into privado.olhando (usuario_id, conta_id, ate) values (eu, p_conta, now() + interval '1 hour')
  on conflict (usuario_id) do update set conta_id = excluded.conta_id, desde = now(), ate = excluded.ate;
  perform privado.registrar('ver_como', 'usuario', p_conta::text, v_nome);
end
$$;
revoke execute on function public.equipe_comecar_a_olhar(uuid) from public, anon;
grant execute on function public.equipe_comecar_a_olhar(uuid) to authenticated;

-- parar de olhar: qualquer um apaga a própria linha (é o único pedido que escapa do somente leitura)
create or replace function public.parar_de_olhar()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid;
begin
  delete from privado.olhando o where o.usuario_id = (select auth.uid()) returning o.conta_id into v_conta;
  return v_conta;
end
$$;
revoke execute on function public.parar_de_olhar() from public, anon;
grant execute on function public.parar_de_olhar() to authenticated;

-- antes de cada pedido do PostgREST: olhando, a transação é somente leitura (passar para somente leitura vale a
-- qualquer momento da transação; o contrário, não)
create or replace function public.antes_da_requisicao()
returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'papel', '') = 'olhar'
     and coalesce(current_setting('request.path', true), '') <> '/rpc/parar_de_olhar' then
    perform set_config('transaction_read_only', 'on', true);
  end if;
end
$$;
revoke execute on function public.antes_da_requisicao() from public;
grant execute on function public.antes_da_requisicao() to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    alter role authenticator set pgrst.db_pre_request = 'public.antes_da_requisicao';
    notify pgrst, 'reload config';
  end if;
end
$$;

select privado.migracao_aplicada('20270919120000_ver_como_o_dono');
