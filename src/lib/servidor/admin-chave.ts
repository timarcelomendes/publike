import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL, SUPABASE_URL } from "@/lib/config";
import { chaveSecretaSupabase } from "./ambiente";

// O admin só liga no computador do dono:
//   1. o site roda em modo de desenvolvimento (npm run dev);
//   2. o .env.local tem PUBLIKE_ADMIN=1 e a chave secreta do Supabase;
//   3. o endereço é local (localhost ou 127.0.0.1);
//   4. o navegador tem o cookie do admin, que só se ganha pelo link que o
//      `npm run dev` mostra no terminal (como no Jupyter). Assim, mesmo que
//      alguém alcance o servidor pela rede, não entra sem esse link.

export const COOKIE_ADMIN = "publike_admin";
export const ENDERECO_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{2,5})?$/i;

export function adminConfigurado() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.PUBLIKE_ADMIN === "1" &&
    Boolean(SUPABASE_URL) &&
    Boolean(chaveSecretaSupabase())
  );
}

/** Derivada da chave secreta: só quem tem a chave consegue calcular. */
export function chaveDoAdmin() {
  return createHmac("sha256", chaveSecretaSupabase()).update("publike-admin-v1").digest("base64url");
}

export function confereChaveDoAdmin(valor: string | null | undefined) {
  if (!valor) return false;
  const a = Buffer.from(valor);
  const b = Buffer.from(chaveDoAdmin());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function linkDeEntradaDoAdmin() {
  return `${SITE_URL}/admin/entrar?chave=${encodeURIComponent(chaveDoAdmin())}`;
}
