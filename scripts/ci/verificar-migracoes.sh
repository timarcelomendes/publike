#!/usr/bin/env bash
# Confere as migrações num banco novo, como no Supabase: o que o Supabase traz pronto
# (banco-supabase.sql), o esquema auth criado pelo próprio Auth do Supabase ("auth migrate") e
# depois todas as migrações de supabase/migrations, em ordem. Para no primeiro erro.
# No fim, chama as funções que o site usa a cada visita, para pegar erro que só aparece rodando.
#
# Precisa: psql (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE) e o binário do Auth em $AUTH_BIN.
set -euo pipefail
cd "$(dirname "$0")/../.."
# só os avisos que importam (os "não existe, pulando" das migrações ficam de fora)
export PGOPTIONS="-c client_min_messages=warning"

psql -X -q -v ON_ERROR_STOP=1 -f scripts/ci/banco-supabase.sql

# o esquema auth (users, identities, sessions...) do jeito que o Supabase cria
# (search_path=auth: as migrações do Auth criam os tipos e as tabelas sem dizer o esquema)
DATABASE_URL="postgres://${PGUSER}:${PGPASSWORD:-}@${PGHOST}:${PGPORT}/${PGDATABASE}?sslmode=disable&search_path=auth" \
  GOTRUE_DB_DRIVER=postgres GOTRUE_DB_NAMESPACE=auth API_EXTERNAL_URL=http://localhost:9999 \
  GOTRUE_DB_MIGRATIONS_PATH="$(dirname "$AUTH_BIN")/migrations" \
  GOTRUE_SITE_URL=http://localhost:3000 GOTRUE_JWT_SECRET=segredo-so-para-conferir-as-migracoes-123456 \
  "$AUTH_BIN" migrate
psql -X -q -v ON_ERROR_STOP=1 -c "grant execute on all functions in schema auth to anon, authenticated, service_role;"

for arquivo in supabase/migrations/*.sql; do
  echo "→ $(basename "$arquivo")"
  psql -X -q -v ON_ERROR_STOP=1 -f "$arquivo" > /dev/null
done

# as funções da busca, como o site chama (sem conta e com texto)
psql -X -q -v ON_ERROR_STOP=1 > /dev/null <<'SQL'
set role anon;
select count(*) from public.buscar_anuncios(-16.6806, -49.2563, 25, null, null, null, 'mecânico', 'perto', 60);
select count(*) from public.buscar_anuncios(-16.6806, -49.2563, 25, 'vaga', null, null, null, 'recentes', 60);
select count(*) from public.curtidas_das_vagas(array[]::uuid[]);
reset role;
SQL
# as funções do servidor nunca STABLE nem IMMUTABLE: a conferência da chave (privado.exigir_servidor) grava, e o
# PostgREST roda essas numa transação só de leitura, até no POST (migração 20270510120000)
ruins=$(psql -X -At -v ON_ERROR_STOP=1 -c "select string_agg(p.proname, ', ' order by p.proname) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.provolatile in ('s', 'i') and p.prosrc ilike '%exigir_servidor%'")
if [ -n "$ruins" ]; then
  echo "::error title=Função do servidor STABLE::$ruins chama privado.exigir_servidor (que grava) e está STABLE ou IMMUTABLE: pelo PostgREST, ela sempre dá erro. Tire o stable."
  exit 1
fi
echo "migrações conferidas: $(ls supabase/migrations/*.sql | wc -l)"
