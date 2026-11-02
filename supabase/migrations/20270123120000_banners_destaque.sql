-- O destaque no alto da inicial (02/11/2026, pedido do Marcelo): um terceiro formato de banner, 'destaque'. Aparece
-- na faixa do alto da página inicial de quem ainda não tem conta, só no computador, girando com as 3 vagas novas
-- (começa por elas e troca a cada 8 segundos). Cada visitante vê até 4 destaques: os mais novos do público dele.
-- Não usa as páginas, a espera, o "Só para" nem o "só uma vez" (é vitrine: fica no ar dentro das datas). Os números
-- (viu e clicou) entram em banner_numeros como os outros, pela contar_banner de sempre.
-- Pode rodar de novo. Rode depois de 20270122120000_novidades.sql.

alter table public.banners drop constraint if exists banners_formato_check;
alter table public.banners add constraint banners_formato_check
  check (formato in ('janela', 'cartao', 'destaque'));
