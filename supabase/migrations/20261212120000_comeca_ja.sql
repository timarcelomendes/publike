-- "Começa já": a vaga precisa de alguém para começar logo. Quem publica marca no formulário; a vaga
-- ganha a etiqueta no cartão e na página, e quem procura filtra por ela ("Começo: Começa já").
-- Só vaga (serviço não tem começo). O site funciona sem esta migração: sem a coluna, a etiqueta e o
-- filtro só não aparecem, e a vaga salva sem ela.

alter table public.anuncios add column if not exists comeca_ja boolean not null default false;

alter table public.anuncios drop constraint if exists anuncios_comeca_ja_so_vaga;
alter table public.anuncios add constraint anuncios_comeca_ja_so_vaga check (not comeca_ja or tipo = 'vaga');

grant insert (comeca_ja), update (comeca_ja) on public.anuncios to authenticated;
