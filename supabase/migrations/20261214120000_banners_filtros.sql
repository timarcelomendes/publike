-- Banners para quem (29/10/2026). Pode rodar de novo sem problema.
--
-- Além do público (todos, visitantes, pessoas, empresas), o banner pode ir só para:
--   - tipos de conta (pessoa, comércio, empresa, agência);
--   - áreas (a do currículo de quem procura; as das vagas de quem contrata);
--   - quem tem currículo, ou quem ainda não tem;
--   - cidades (a da conta);
--   - contas novas (criadas há até N dias);
--   - contas escolhidas uma a uma (tabela banners_contas: cada conta lê só a própria linha, então
--     ninguém de fora vê para quem o banner é).
-- Com qualquer um desses, o banner é só para quem tem conta (do visitante não se sabe). Vazio: vale todo mundo.
--
-- Rode depois de 20261213120000_banners_imagem.sql.

alter table public.banners add column if not exists tipos_conta text[] not null default '{}'
  check (tipos_conta <@ array['pessoa', 'comercio', 'empresa', 'agencia']);
alter table public.banners add column if not exists categorias text[] not null default '{}'
  check (cardinality(categorias) <= 20);
alter table public.banners add column if not exists curriculo text
  check (curriculo is null or curriculo in ('com', 'sem'));
alter table public.banners add column if not exists cidades text[] not null default '{}'
  check (cardinality(cidades) <= 30);
alter table public.banners add column if not exists conta_ate_dias integer
  check (conta_ate_dias is null or conta_ate_dias between 1 and 365);
-- true: só as contas de banners_contas
alter table public.banners add column if not exists so_contas boolean not null default false;

create table if not exists public.banners_contas (
  banner_id uuid not null references public.banners (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  primary key (banner_id, perfil_id)
);
comment on table public.banners_contas is
  'As contas escolhidas de um banner (Admin › Banners). Cada conta lê só a própria linha.';
alter table public.banners_contas enable row level security;
revoke all on public.banners_contas from anon, authenticated;
grant select on public.banners_contas to authenticated;
grant select, insert, update, delete on public.banners_contas to service_role;
drop policy if exists banners_contas_minha on public.banners_contas;
create policy banners_contas_minha on public.banners_contas
  for select to authenticated
  using (perfil_id = (select auth.uid()));
