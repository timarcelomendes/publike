-- =====================================================================
-- Mais tipos de contratação nas vagas
--
-- Além de CLT, temporário, diária, freelance, estágio, PJ/MEI e outro, a
-- vaga pode ser: Jovem Aprendiz, Trainee, Intermitente, Por produtividade /
-- comissão e Autônomo (RPA). Os nomes que aparecem na tela ficam em
-- src/lib/constantes.ts (REGIMES); aqui o banco só confere o valor.
--
-- Rode ANTES de publicar o código novo (senão a vaga com tipo novo é
-- recusada). Rode depois de 20261015210000_noticias.sql. Pode rodar de novo.
-- =====================================================================

alter table public.anuncios drop constraint if exists anuncios_regime_check;
alter table public.anuncios add constraint anuncios_regime_check check (
  regime in (
    'clt', 'aprendiz', 'estagio', 'trainee', 'temporario', 'intermitente',
    'diaria', 'freelance', 'produtividade', 'autonomo', 'pj', 'outro'
  )
);
