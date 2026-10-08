import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./tipos-banco";
import { SUPABASE_CHAVE, SUPABASE_URL } from "@/lib/config";

/** Cliente do Supabase com a sessão de quem está navegando (cookies). */
export async function criarClienteServidor() {
  // O cliente confere o horário de validade da sessão. Com Cache Components,
  // isso só pode rodar numa requisição de verdade, nunca num pré-render.
  await connection();
  const loja = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, {
    cookies: {
      getAll() {
        return loja.getAll();
      },
      setAll(lista) {
        try {
          for (const { name, value, options } of lista) loja.set(name, value, options);
        } catch {
          // Chamado de um Server Component, que não pode gravar cookies.
          // Tudo bem: o proxy (src/proxy.ts) renova a sessão a cada visita.
        }
      },
    },
  });
}

/** Cliente sem sessão, só para dados públicos (sitemap, por exemplo). */
export function criarClientePublico() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
