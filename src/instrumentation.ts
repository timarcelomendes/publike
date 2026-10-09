// Quando o servidor começa: com o admin ligado (npm run dev + PUBLIKE_ADMIN=1),
// mostra no terminal o link que abre o admin neste computador.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { adminConfigurado, linkDeEntradaDoAdmin } = await import("./lib/servidor/admin-chave");
  if (!adminConfigurado()) return;
  const global = globalThis as { __publikeLinkAdmin?: boolean };
  if (global.__publikeLinkAdmin) return;
  global.__publikeLinkAdmin = true;
  console.log(`\n  Admin do Publike (abra neste computador):\n  ${linkDeEntradaDoAdmin()}\n`);
}
