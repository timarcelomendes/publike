-- Quem contrata perto sem esperar no centro (16/11/2026): no centro de Goiânia há 66 mil empresas ativas a até 2 km, e
-- para contar (a chamada da home, quantos_contratam) ou listar (o mapa, lugares_da_rota) as que costumam contratar uma
-- função o banco lia todas elas: de 1,3 a 2 s por função, perto do limite de 3 s de quem visita sem conta. Um índice
-- pelo ramo e pelo lugar juntos lê só as do ramo que ficam perto (umas 2 mil para "vendedor"): milissegundos.
-- O btree_gist deixa o ramo (um texto) entrar no mesmo índice do lugar. Pode rodar de novo.

create extension if not exists btree_gist with schema extensions;

create index if not exists empresas_receita_ramo_local_idx
  on privado.empresas_receita using gist (cnae, local)
  where situacao = 'ativa' and not mei;

analyze privado.empresas_receita;
