-- =====================================================================
-- Notícias sobre trabalho em Goiânia e região
--
-- A IA procura notícias na internet (feirões e mutirões de emprego, cursos
-- gratuitos, concursos, salário mínimo, FGTS, seguro-desemprego…) e escreve
-- um resumo curto com a fonte. Nada vai para o site sozinho: cada notícia
-- fica como rascunho até o admin aprovar (publicar agora ou agendar).
--
-- O site lê só as aprovadas cujo horário de publicação já chegou.
-- Rode depois de 20261015200000_convites.sql. Pode rodar de novo.
-- =====================================================================

create table if not exists public.noticias (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 90),
  titulo text not null check (char_length(btrim(titulo)) between 10 and 140),
  resumo text not null check (char_length(btrim(resumo)) between 20 and 300),
  corpo text not null check (char_length(btrim(corpo)) between 50 and 3000),
  -- "O que isso muda para você": uma frase prática para quem lê
  pratico text check (pratico is null or char_length(pratico) <= 400),
  tema text not null default 'mercado'
    check (tema in ('vagas', 'cursos', 'direitos', 'concursos', 'mercado', 'eventos')),
  cidade text check (cidade is null or char_length(cidade) <= 60),
  fonte_nome text not null check (char_length(fonte_nome) <= 120),
  fonte_url text not null check (fonte_url ~ '^https://' and char_length(fonte_url) <= 600),
  fonte_data date,
  status text not null default 'rascunho' check (status in ('rascunho', 'aprovada', 'descartada')),
  -- aprovada: aparece no site a partir deste horário (agora ou agendado)
  publicar_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (status <> 'aprovada' or publicar_em is not null)
);

-- a mesma matéria não entra duas vezes
create unique index if not exists noticias_fonte_idx on public.noticias (lower(fonte_url));
create index if not exists noticias_publicadas_idx on public.noticias (publicar_em desc) where status = 'aprovada';
create index if not exists noticias_status_idx on public.noticias (status, criado_em desc);

alter table public.noticias enable row level security;
revoke all on public.noticias from anon, authenticated;
grant select on public.noticias to anon, authenticated;
grant select, insert, update, delete on public.noticias to service_role;

drop policy if exists noticias_publicadas on public.noticias;
create policy noticias_publicadas on public.noticias
  for select to anon, authenticated
  using (status = 'aprovada' and publicar_em <= now());

create or replace function privado.noticias_atualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end
$$;

drop trigger if exists noticias_atualizado on public.noticias;
create trigger noticias_atualizado
  before update on public.noticias
  for each row execute function privado.noticias_atualizado();

-- Opção no admin (desligada até o admin ligar) e o registro da última busca.
alter table public.config_site add column if not exists ia_noticias boolean not null default false;
alter table public.config_site add column if not exists noticias_ultima_busca timestamptz;
alter table public.config_site add column if not exists noticias_ultimo_erro text;

-- O servidor do site (com a chave do servidor) lê o que precisa para a busca…
create or replace function public.servidor_noticias_contexto(p_chave text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg public.config_site;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from public.config_site limit 1;
  return jsonb_build_object(
    'ligada', coalesce(cfg.ia_noticias, false),
    'modelo', cfg.ia_modelo,
    'ultima_busca', cfg.noticias_ultima_busca,
    -- o que já está na lista (para a IA não trazer de novo)
    'recentes', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', n.titulo, 'fonte_url', n.fonte_url) order by n.criado_em desc)
        from (select titulo, fonte_url, criado_em from public.noticias
               where criado_em > now() - interval '45 days' order by criado_em desc limit 80) n
    ), '[]'::jsonb)
  );
end
$$;

-- …e guarda os rascunhos que a IA escreveu (os repetidos ficam de fora).
create or replace function public.servidor_salvar_noticias(p_chave text, p_itens jsonb, p_erro text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  novos integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  for item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) limit 10 loop
    begin
      insert into public.noticias (slug, titulo, resumo, corpo, pratico, tema, cidade, fonte_nome, fonte_url, fonte_data)
      values (
        item ->> 'slug', btrim(item ->> 'titulo'), btrim(item ->> 'resumo'), btrim(item ->> 'corpo'),
        nullif(btrim(item ->> 'pratico'), ''), coalesce(item ->> 'tema', 'mercado'), nullif(btrim(item ->> 'cidade'), ''),
        btrim(item ->> 'fonte_nome'), btrim(item ->> 'fonte_url'), nullif(item ->> 'fonte_data', '')::date
      )
      on conflict do nothing;
      if found then
        novos := novos + 1;
      end if;
    exception when others then
      raise warning 'Publike: notícia não entrou (%).', sqlerrm;
    end;
  end loop;
  update public.config_site
     set noticias_ultima_busca = now(), noticias_ultimo_erro = left(p_erro, 400)
   where true;
  return novos;
end
$$;

revoke execute on function public.servidor_noticias_contexto(text), public.servidor_salvar_noticias(text, jsonb, text)
  from public;
grant execute on function public.servidor_noticias_contexto(text), public.servidor_salvar_noticias(text, jsonb, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
