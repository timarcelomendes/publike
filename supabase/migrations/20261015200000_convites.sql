-- =====================================================================
-- Convites às empresas (admin)
--
-- Lista de empresas que estão anunciando vagas em outros lugares, para a
-- equipe pedir permissão e publicar as vagas no Publike. O admin importa a
-- lista de um arquivo (modelo em Admin > Convites), manda o convite pelo
-- WhatsApp ou e-mail, marca a situação e, quando a empresa autoriza, cria a
-- conta já ligada ao convite.
--
-- Só o admin (service_role) lê e escreve. Rode depois de
-- 20261015190000_boas_vindas_prestador.sql. Pode rodar de novo.
-- =====================================================================

create table if not exists public.convites (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  tipo text not null default 'empresa' check (tipo in ('empresa', 'agencia')),
  vagas text[] not null default '{}' check (cardinality(vagas) <= 20),
  whatsapp text[] not null default '{}' check (cardinality(whatsapp) <= 5),
  telefones text[] not null default '{}' check (cardinality(telefones) <= 5),
  email text check (email is null or char_length(email) <= 200),
  observacao text check (observacao is null or char_length(observacao) <= 500),
  status text not null default 'a_enviar'
    check (status in ('a_enviar', 'enviada', 'autorizou', 'recusou', 'sem_contato')),
  nota text check (nota is null or char_length(nota) <= 500),
  enviada_em timestamptz,
  -- a conta criada quando a empresa autorizou
  usuario_id uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- o mesmo nome não entra duas vezes (a importação pula os repetidos)
create unique index if not exists convites_nome_idx on public.convites (lower(btrim(nome)));
create index if not exists convites_status_idx on public.convites (status, criado_em);

alter table public.convites enable row level security;
revoke all on public.convites from anon, authenticated;
grant select, insert, update, delete on public.convites to service_role;

create or replace function privado.convites_atualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end
$$;

drop trigger if exists convites_atualizado on public.convites;
create trigger convites_atualizado
  before update on public.convites
  for each row execute function privado.convites_atualizado();

notify pgrst, 'reload schema';
