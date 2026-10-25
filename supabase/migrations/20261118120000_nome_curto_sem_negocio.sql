-- O nome curto não leva o nome do negócio (25/10/2026). Pode rodar de novo sem problema.
--
-- Quem escreve o negócio junto do nome ("Thiago B. Silva - Cuidados e Serviços de Enfermagem",
-- "Ana Souza | Manicure") aparecia em Talentos e em Conexões com a inicial tirada do negócio.
-- Agora o nome é cortado no primeiro " - ", " – ", " — " ou " | " antes de encurtar. O mesmo
-- corte está em nomeNaLista (src/lib/servidor/contas-perto.ts).

create or replace function privado.nome_curto(p_nome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select p[1] || coalesce(
           ' ' || upper(left((select x from unnest(p[2:]) with ordinality as t(x, n)
                               where lower(x) not in ('da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del')
                               order by n limit 1), 1)) || '.',
           '')
    from (select regexp_split_to_array(
                   btrim(coalesce(nullif(btrim(regexp_replace(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'),
                                                              ' [-|–—] .*$', '')), ''),
                                  btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')))),
                   ' ') as p) as nome
$$;
revoke execute on function privado.nome_curto(text) from public;
