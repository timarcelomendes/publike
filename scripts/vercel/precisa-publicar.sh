#!/bin/bash
# O "Ignored Build Step" da Vercel (vercel.json, ignoreCommand): sai com 0 para NÃO publicar e com 1 para publicar.
# Cada publicação monta o site inteiro e custa minutos de máquina (27/11/2026: 80 horas e US$ 16,94 no mês, cerca de
# 500 publicações). Não publica quando, desde a última publicação, só mudou o que não vai para o site: as migrações e
# as funções do Supabase (aplicadas no banco à parte), os documentos (.md), os scripts de teste e de banco e o CI.
# Na dúvida (sem a publicação anterior, git sem histórico), publica.

antes="${VERCEL_GIT_PREVIOUS_SHA:-}"
agora="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
[ -z "$antes" ] && { echo "Sem a publicação anterior: publica."; exit 1; }

# a Vercel clona raso: busca a publicação anterior se ela não veio
if ! git cat-file -e "$antes^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=200 origin "$agora" 2>/dev/null || true
  git cat-file -e "$antes^{commit}" 2>/dev/null || { echo "Não achei $antes: publica."; exit 1; }
fi

# os dois scripts que rodam no build (package.json: predev e prebuild) contam como site
if ! git diff --quiet "$antes" "$agora" -- scripts/copiar-worker-mapa.mjs scripts/conferir-dependencias.mjs; then
  echo "Mudou um script do build: publica."; exit 1
fi
if git diff --quiet "$antes" "$agora" -- . \
  ':(exclude)supabase' ':(exclude)scripts' ':(exclude).github' ':(exclude)*.md'; then
  echo "Só mudou o que não vai para o site (migração, documento, script, CI): não publica."
  git diff --name-only "$antes" "$agora" | head -20
  exit 0
fi
echo "Mudou o site: publica."
exit 1
