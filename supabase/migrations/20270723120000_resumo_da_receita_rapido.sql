-- O resumo da Base da Receita (Admin › Base da Receita) rápido de novo (18/11/2026). Com 571 mil linhas (504 MB), três
-- contas do `admin_empresas_receita` liam a tabela inteira (na praça, com ponto no mapa e por cidade: 4 a 5 s cada) e o
-- total passou dos 8 s do banco, e a tela dizia "falta a migração". Os índices parciais abaixo deixam as três contas no
-- índice (só o que entra na conta, sem abrir a linha).

create index if not exists empresas_receita_na_praca_cidade_idx
  on privado.empresas_receita (cidade)
  where situacao = 'ativa' and na_praca and not mei;

create index if not exists empresas_receita_com_ponto_idx
  on privado.empresas_receita (cnpj)
  where situacao = 'ativa' and not mei and local is not null;

analyze privado.empresas_receita;

select privado.migracao_aplicada('20270723120000_resumo_da_receita_rapido');
