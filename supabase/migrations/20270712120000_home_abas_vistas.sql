-- A linha do tempo abre sempre em Vagas e avisa o que chegou nas outras abas (17/11/2026, Marcelo: "voltar ao padrao
-- de abrir vagas como padrao ao acessar e o usuário muda se quiser ver outra aba da linha do tempo, adicione uma
-- indicador de mensagens novas em posts ou servicos"). Pode rodar de novo.
--
--   * Em `preferencias` (só a própria pessoa lê e escreve): a última vez que ela abriu as abas Serviços e Posts. O que
--     chegou depois (até 7 dias) é o número da aba e o aviso embaixo das abas ("3 posts novos", com os rostos de quem
--     postou). Quem nunca abriu conta os últimos 7 dias.
--   * A `home_aba` (a última aba escolhida, que abria a linha) deixa de ser lida e escrita; fica, sem uso.

alter table public.preferencias add column if not exists home_viu_servicos_em timestamptz;
alter table public.preferencias add column if not exists home_viu_posts_em timestamptz;

comment on column public.preferencias.home_viu_servicos_em is
  'A última vez que a pessoa abriu a aba Serviços da linha do tempo (o que chegou depois é novidade).';
comment on column public.preferencias.home_viu_posts_em is
  'A última vez que a pessoa abriu a aba Posts da linha do tempo (o que chegou depois é novidade).';

-- a pessoa escreve só nas colunas dela (como já era com as outras da home)
grant insert (home_viu_servicos_em, home_viu_posts_em), update (home_viu_servicos_em, home_viu_posts_em)
  on public.preferencias to authenticated;

notify pgrst, 'reload schema';
