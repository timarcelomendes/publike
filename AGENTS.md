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
- Design System: tokens em `src/app/globals.css`. `like` só para curtida, `terra` só para a ação principal (um botão terra por tela), `ipe` para selos, `cerrado` para match/sucesso, `danger` só para erro e denúncia, `social-*` só nos botões de login social (mesmo padrão do botão oficial do Google, que troca entre claro e escuro em `src/components/botao-google.tsx`).
- Admin (`/admin`): só abre no computador do dono, com `npm run dev`, `PUBLIKE_ADMIN=1`, `SUPABASE_SECRET_KEY`, endereço local e o cookie `publike_admin`, que vem do link impresso no terminal (`src/instrumentation.ts`, `src/app/admin/entrar/route.ts`, `src/lib/servidor/admin-chave.ts`). Suspender/reativar também acerta o login pela API do Supabase Auth (`ban_duration`). As funções `admin_*` do banco só aceitam o papel `service_role` (menos `admin_listar_anuncios` e `admin_anuncio`, que a moderação também usa). Moderadores (tabela `moderadores`) usam `/admin` com o login deles e veem só Anúncios e Denúncias (`acessoDaEquipe()`).
- Segredos (senha do Zoho, chave da IA, chave secreta do Supabase) ficam só em variáveis de ambiente (`src/lib/servidor/ambiente.ts`), nunca no banco nem no admin. O site publicado usa `PUBLIKE_CHAVE_SERVIDOR`, que só esvazia as filas.
- E-mails e revisões da IA: os gatilhos do banco põem nas filas; `processarFilas()` (`src/lib/servidor/filas.ts`) roda em `after()` nas ações que podem gerar e-mail ou revisão.
- IA: OpenAI, pela Responses API (`src/lib/ia/openai.ts`), com saída estruturada (`text.format` json_schema, `strict`) e `store: false`. Modelos em `MODELOS_IA` (`gpt-6-luna` padrão, `gpt-6.1-sol`). `config_site.ia_modelo` pode guardar um modelo antigo: `modeloDaIA()` troca o que não está na lista pelo padrão.
