"use server";

import { MODO_DEMO } from "@/lib/config";
import { CHAVE_DICA } from "@/lib/dicas";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// As dicas de novidade (src/lib/dicas.ts). Sem conta ou sem a migração 20270317120000, devolve null: o balão usa o
// que ficou guardado no aparelho.

/** As dicas que a pessoa já viu, ou null (sem conta ou sem a migração). */
export async function dicasJaVistas(): Promise<string[] | null> {
  if (MODO_DEMO) return null;
  try {
    const supabase = await criarClienteServidor();
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims?.claims?.sub) return null;
    const { data, error } = await supabase.rpc("minhas_dicas_vistas");
    if (error) return null;
    return Array.isArray(data) ? data.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return null;
  }
}

/** A dica apareceu (ou a pessoa usou a novidade). Nunca falha para quem chamou. */
export async function marcarDica(chave: string, usou = false): Promise<void> {
  if (MODO_DEMO || !CHAVE_DICA.test(chave)) return;
  try {
    const supabase = await criarClienteServidor();
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims?.claims?.sub) return;
    await supabase.rpc("marcar_dica_vista", { p_chave: chave, p_usou: usou });
  } catch {
    // a dica não pode atrapalhar
  }
}
