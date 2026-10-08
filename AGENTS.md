<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Publike: notas do projeto

- Código, nomes e textos em português do Brasil. Voz da marca: direta e calorosa, verbos nos botões ("Publicar vaga", "Curtir").
- Next.js 16 com **Cache Components** ligado: qualquer leitura de cookies, `params`, `searchParams` ou do banco fica dentro de um `<Suspense>`; horário da requisição só com `agoraDaRequisicao()` (`src/lib/tempo.ts`) dentro dessas partes.
- O proxy (antigo middleware) fica em `src/proxy.ts`.
- Banco: `supabase/migrations/`. Segurança no banco (RLS + permissões por coluna); as ações em `src/lib/acoes/` sempre conferem o login de novo.
- Tipos do banco em `src/lib/supabase/tipos-banco.ts` (formato do `supabase gen types`).
- Sem as variáveis do Supabase o site roda em modo demonstração com os dados de `src/lib/demo.ts`.
- Design System: tokens em `src/app/globals.css`. `like` só para curtida, `terra` só para a ação principal (um botão terra por tela), `ipe` para selos, `cerrado` para match/sucesso, `danger` só para erro e denúncia.
