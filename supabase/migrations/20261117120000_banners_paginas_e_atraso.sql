-- Banners: em quais páginas abrem, quanto esperam e a busca pela área de quem vê (25/10/2026).
-- Pode rodar de novo sem problema.
--
-- paginas: onde a janela pode abrir (inicio, descobrir, anuncio, painel, perfil, noticias,
--   talentos). Os que já existem ficam só na página inicial, como antes.
-- atraso_segundos: quanto espera depois de abrir a página (0 a 60; antes, 3 fixos).
-- busca_da_area: na ação "busca", usa a área de quem vê (o "o que você faz" do currículo ou o
--   primeiro cargo); sem currículo, a palavra escrita (ou as vagas novas, se não tiver palavra).

alter table public.banners add column if not exists paginas text[] not null default '{inicio}'
  check (cardinality(paginas) between 1 and 7
         and paginas <@ array['inicio', 'descobrir', 'anuncio', 'painel', 'perfil', 'noticias', 'talentos']);
alter table public.banners add column if not exists atraso_segundos smallint not null default 3
  check (atraso_segundos between 0 and 60);
alter table public.banners add column if not exists busca_da_area boolean not null default false;
