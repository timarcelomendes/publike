import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./tipos-banco";
import { COOKIES_DA_SESSAO, SUPABASE_CHAVE, SUPABASE_URL } from "@/lib/config";

/** Cliente do Supabase para componentes que rodam no navegador. */
export function criarClienteNavegador() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, { cookieOptions: COOKIES_DA_SESSAO });
}
