#!/usr/bin/env bash
# Grava src/lib/gerado/banco-esperado.json a partir de um banco novo com todas as migrações (o CI confere que o
# arquivo está em dia). Use as variáveis do psql (PGHOST, PGPORT, PGUSER, PGDATABASE). Migração 20270629110000.
set -euo pipefail
cd "$(dirname "$0")/../.."
psql -X -At -v ON_ERROR_STOP=1 -c "select privado.impressao_do_banco()::text" \
  | node scripts/banco/gravar-impressao.mjs > src/lib/gerado/banco-esperado.json
echo "src/lib/gerado/banco-esperado.json: $(grep -c '|' src/lib/gerado/banco-esperado.json) objetos"
