-- Banners com imagem (29/10/2026). Pode rodar de novo sem problema.
--
-- O admin pode pôr uma imagem no alto da janela do banner (Admin › Banners). A imagem é ajustada no
-- servidor (até 1200 px de largura, WebP) e fica no Storage, na pasta pública "banners". Só o admin
-- envia: sem regras de RLS para anon e authenticated, só a chave secreta grava aqui. Sem esta migração,
-- os banners seguem só com texto.
--
-- Rode depois de 20261212120000_comeca_ja.sql.

alter table public.banners add column if not exists imagem text
  check (imagem is null or (char_length(imagem) <= 500 and imagem ~ '^https?://[^[:space:]"''<>\\]+$'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banners', 'banners', true, 1048576, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
