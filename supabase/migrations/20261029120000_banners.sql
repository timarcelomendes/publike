-- Banners da página inicial (22/10/2026). Pode rodar de novo sem problema.
--
-- O admin cria um aviso em janela (popup) na página inicial: ver as vagas novas, uma busca de
-- vagas, uma página do site ou compartilhar o Publike. Aparece um por vez (o mais novo ligado
-- para aquele público), uma vez por navegador (o navegador guarda quais já viu), depois das
-- boas-vindas e do aviso de cookies.
-- Os números (quantas vezes apareceu, quantos tocaram no botão e quantos fecharam) ficam
-- somados por dia, sem guardar quem.
--
-- Rode depois de 20261028120000_convites_no_sino.sql.

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(btrim(titulo)) between 3 and 80),
  texto text check (texto is null or char_length(texto) <= 240),
  botao text not null check (char_length(btrim(botao)) between 2 and 30),
  -- novas: vagas novas; busca: uma busca de vagas; link: uma página do site; compartilhar: o Publike
  acao text not null check (acao in ('novas', 'busca', 'link', 'compartilhar')),
  -- só caminho do próprio site ("/..."), nunca outro endereço
  link text check (link is null or (link ~ '^/([^/\\].*)?$' and char_length(link) <= 300)),
  publico text not null default 'todos' check (publico in ('todos', 'visitantes', 'pessoas', 'empresas')),
  ativo boolean not null default false,
  inicio timestamptz,
  fim timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (acao = 'compartilhar' or link is not null),
  check (fim is null or inicio is null or fim > inicio)
);
create index if not exists banners_no_ar_idx on public.banners (criado_em desc) where ativo;
comment on table public.banners is
  'Avisos em janela na página inicial, criados no admin. O site lê só os ligados dentro das datas.';

alter table public.banners enable row level security;
revoke all on public.banners from anon, authenticated;
grant select on public.banners to anon, authenticated;
grant select, insert, update, delete on public.banners to service_role;

drop policy if exists banners_no_ar on public.banners;
create policy banners_no_ar on public.banners
  for select to anon, authenticated
  using (ativo and (inicio is null or inicio <= now()) and (fim is null or fim > now()));

create or replace function privado.banners_atualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end
$$;

drop trigger if exists banners_atualizado on public.banners;
create trigger banners_atualizado
  before update on public.banners
  for each row execute function privado.banners_atualizado();

-- Os números de cada banner, por dia (horário de Brasília).
create table if not exists public.banner_numeros (
  banner_id uuid not null references public.banners (id) on delete cascade,
  dia date not null,
  vistos integer not null default 0,
  cliques integer not null default 0,
  fechados integer not null default 0,
  primary key (banner_id, dia)
);
alter table public.banner_numeros enable row level security;
revoke all on public.banner_numeros from anon, authenticated;
grant select, insert, update, delete on public.banner_numeros to service_role;

-- O site conta: apareceu (visto), tocou no botão (clique) ou fechou. Só banner ligado.
create or replace function public.contar_banner(p_banner uuid, p_evento text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_evento not in ('visto', 'clique', 'fechou') then
    return;
  end if;
  if not exists (select 1 from public.banners b where b.id = p_banner and b.ativo) then
    return;
  end if;
  insert into public.banner_numeros as n (banner_id, dia, vistos, cliques, fechados)
  values (
    p_banner,
    (now() at time zone 'America/Sao_Paulo')::date,
    (p_evento = 'visto')::int,
    (p_evento = 'clique')::int,
    (p_evento = 'fechou')::int
  )
  on conflict (banner_id, dia) do update
    set vistos = n.vistos + excluded.vistos,
        cliques = n.cliques + excluded.cliques,
        fechados = n.fechados + excluded.fechados;
end
$$;
revoke execute on function public.contar_banner(uuid, text) from public;
grant execute on function public.contar_banner(uuid, text) to anon, authenticated;
