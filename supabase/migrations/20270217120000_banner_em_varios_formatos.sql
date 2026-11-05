-- O banner em vários formatos (05/11/2026, pedido do Marcelo; claude/plano-banner-em-varios-formatos.md): o mesmo
-- banner pode ser janela, cartão no meio da lista, destaque no alto da inicial e o formato novo, 'topo' (o cartão
-- "Do Publike" como primeiro item da linha do tempo de quem tem conta), um ou mais de uma vez. A lista fica em
-- `formatos`; o `formato` antigo continua, com o primeiro da lista, para o site que está no ar até o código novo
-- subir. Os banners que já existem ganham a lista com o formato que têm (nada muda para eles). O "visto" continua
-- um só por banner (quem viu em um formato não vê de novo no outro, conforme o "só uma vez" ou "a cada N dias").
-- Pode rodar de novo. Rode depois de 20270216120000_ultimo_acesso_em_todo_o_admin.sql.

alter table public.banners drop constraint if exists banners_formato_check;
alter table public.banners add constraint banners_formato_check
  check (formato in ('janela', 'cartao', 'destaque', 'topo'));

alter table public.banners add column if not exists formatos text[];
update public.banners set formatos = array[coalesce(formato, 'janela')]
  where formatos is null or cardinality(formatos) = 0;
-- sem padrão e podendo ficar vazia: o banner criado pelo site de antes (só com o `formato`) vale pelo `formato`
alter table public.banners alter column formatos drop default;
alter table public.banners alter column formatos drop not null;

alter table public.banners drop constraint if exists banners_formatos_check;
alter table public.banners add constraint banners_formatos_check
  check (formatos is null or cardinality(formatos) >= 1 and formatos <@ array['janela', 'cartao', 'destaque', 'topo']::text[]);

comment on column public.banners.formatos is
  'Onde o banner aparece (um ou mais; vazia, vale o formato): janela, cartao (meio da lista e da linha do tempo), destaque (alto da inicial, computador, sem conta) e topo (primeiro item da linha do tempo, com conta).';

notify pgrst, 'reload schema';
