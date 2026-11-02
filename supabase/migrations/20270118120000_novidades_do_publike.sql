-- Novidades do Publike: o cartão "Do Publike" e a página /novidades (02/11/2026; claude/plano-novidades-do-publike.md).
-- Pode rodar de novo sem problema.
--
-- formato: 'janela' (a de sempre, por cima da página, nas páginas e depois da espera escolhidas) ou
--   'cartao' (uma faixa "Do Publike" no meio da lista da página inicial, para quem não tem conta, e
--   da linha do tempo, para quem tem). O cartão não usa as páginas nem a espera: aparece no meio da
--   lista e conta como visto quando fica metade na tela por 1 segundo. O resto vale para os dois: o
--   público, o "Só para", a imagem, o botão, as datas e o "só uma vez" ou "de novo a cada N dias".
--   Os banners que já existem ficam como janela.
-- em_novidades: o banner também fica na página /novidades, inclusive depois que sair do ar (o fim
--   passou). Desligar o banner (ativo) tira de lá também. A página lê só por novidades_do_publike():
--   a regra banners_no_ar continua mostrando só o que está no ar (bannersDaVisita confia nela).
-- Sem esta migração, o site trata todos como janela e /novidades fica vazia.
--
-- Rode depois de 20270117120000_pagina_de_vagas.sql.

alter table public.banners add column if not exists formato text not null default 'janela';
alter table public.banners drop constraint if exists banners_formato_check;
alter table public.banners add constraint banners_formato_check check (formato in ('janela', 'cartao'));

alter table public.banners add column if not exists em_novidades boolean not null default false;

-- As novidades do Publike, da mais nova para a mais antiga (as 50 últimas): ligadas, já começadas e
-- marcadas "Também em Novidades". O dia é o começo (ou a criação, sem começo marcado).
create or replace function public.novidades_do_publike()
returns table (
  id uuid, titulo text, texto text, botao text, acao text, link text, imagem text, quando timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.titulo, b.texto, b.botao, b.acao, b.link, b.imagem, coalesce(b.inicio, b.criado_em)
    from public.banners b
   where b.ativo and b.em_novidades and (b.inicio is null or b.inicio <= now())
   order by coalesce(b.inicio, b.criado_em) desc
   limit 50
$$;

revoke execute on function public.novidades_do_publike() from public;
grant execute on function public.novidades_do_publike() to anon, authenticated;
