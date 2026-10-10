// Link de entrar por e-mail (modelos em supabase/emails/): o e-mail leva para
// /auth/callback com token_hash e type, e a entrada acontece em /auth/confirmar.

/** Tipos que o site aceita. Os modelos usam "email" (vale para entrar e para confirmar o cadastro). */
const TIPOS = new Set(["email", "magiclink", "signup"]);

/** O código do link, como o Supabase manda ("pkce_" na frente quando o pedido saiu do site). */
const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

export function linkDeEntradaValido(tokenHash: unknown, tipo: unknown): tokenHash is string {
  return typeof tokenHash === "string" && TOKEN.test(tokenHash) && typeof tipo === "string" && TIPOS.has(tipo);
}
