-- Fotos do Pixabay: o Pixabay não deixa usar o link da foto deles no site, então o Publike guarda
-- uma cópia aqui e serve em /noticias/foto/<id>.jpg (com cache longo: o banco quase não é lido).

create table if not exists public.fotos_noticias (
  id text primary key check (id ~ '^[a-z]+-[0-9]{1,20}$'),
  tipo text not null check (tipo in ('image/jpeg', 'image/png', 'image/webp')),
  dados bytea not null check (octet_length(dados) between 100 and 3000000),
  criado_em timestamptz not null default now()
);
-- só pelas funções abaixo
alter table public.fotos_noticias enable row level security;
revoke all on public.fotos_noticias from anon, authenticated;

-- a foto da notícia pode ser a cópia guardada aqui (endereço do próprio site)
alter table public.noticias drop constraint if exists noticias_foto_url_check;
alter table public.noticias
  add constraint noticias_foto_url_check
  check ((foto_url ~ '^https://' or foto_url ~ '^/noticias/foto/[a-z]+-[0-9]{1,20}\.(jpg|png|webp)$') and char_length(foto_url) <= 600);

create or replace function public.servidor_guardar_foto_noticia(p_chave text, p_id text, p_tipo text, p_dados text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  insert into public.fotos_noticias (id, tipo, dados)
  values (p_id, p_tipo, decode(p_dados, 'base64'))
  on conflict (id) do nothing;
end
$$;
revoke execute on function public.servidor_guardar_foto_noticia(text, text, text, text) from public;
grant execute on function public.servidor_guardar_foto_noticia(text, text, text, text) to anon, authenticated, service_role;

-- para a página /noticias/foto/<id>: qualquer um vê (são as fotos das notícias)
create or replace function public.foto_noticia(p_id text)
returns table (tipo text, dados text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.tipo, encode(f.dados, 'base64') from public.fotos_noticias f where f.id = p_id;
$$;
revoke execute on function public.foto_noticia(text) from public;
grant execute on function public.foto_noticia(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
