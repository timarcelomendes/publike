// Link de entrar por e-mail (modelos em supabase/emails/): o e-mail leva para
// /auth/callback com token_hash e type, e a entrada acontece em /auth/confirmar.

/** Tipos que o site aceita. Os modelos usam "email" (vale para entrar e para confirmar o cadastro). */
const TIPOS = new Set(["email", "magiclink", "signup", "email_change"]);

/** O código do link, como o Supabase manda ("pkce_" na frente quando o pedido saiu do site). */
const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

export function linkDeEntradaValido(tokenHash: unknown, tipo: unknown): tokenHash is string {
  return typeof tokenHash === "string" && TOKEN.test(tokenHash) && typeof tipo === "string" && TIPOS.has(tipo);
}

/**
 * "Este navegador pediu um link de entrar há pouco" (vale 1 hora). Com ele, o link entra
 * sozinho. Sem ele (o link foi aberto em outro aparelho, ou alguém mandou o link da conta
 * dele), a página pergunta antes de entrar: ninguém cai na conta de outra pessoa sem perceber.
 */
export const COOKIE_PEDIU_LINK = "publike_pediu_link";
