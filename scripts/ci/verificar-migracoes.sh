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
echo "migrações conferidas: $(ls supabase/migrations/*.sql | wc -l)"
