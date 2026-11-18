-- =====================================================================
-- Convites com as vagas no site da empresa (18/11/2026; claude/plano-quem-contrata-nos-convites.md)
--
-- A lista "Quem contrata em Goiânia" (empresas com vaga aberta na Gupy) entra em Admin › Convites, e o
-- convite ganha a escolha da mensagem. Duas colunas:
-- - link_vagas: a página de vagas da empresa (https://empresa.gupy.io, ou outro site). A mensagem
--   "Vagas da Gupy" fala dela, e o "Publicar as vagas da Gupy por ela" abre o "Puxar do link da Gupy"
--   com ela;
-- - mensagem: a mensagem escolhida no cartão do convite (publike, site ou retomar). Vazia, vale a
--   sugerida pela situação e pelo link (mensagemDoConvite em src/lib/convites.ts); mudar a situação
--   esvazia a escolha.
--
-- Só o admin (service_role) lê e escreve, como o resto da tabela. Rode depois de
-- 20270723120000_resumo_da_receita_rapido.sql. Pode rodar de novo.
-- =====================================================================

alter table public.convites
  add column if not exists link_vagas text
    check (link_vagas is null or (char_length(link_vagas) <= 300 and link_vagas ~ '^https?://\S+$')),
  add column if not exists mensagem text
    check (mensagem is null or mensagem in ('publike', 'site', 'retomar'));

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270724120000_convites_vagas_no_site');
