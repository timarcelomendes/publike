"use server";

import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// O cadastro de empresas (migração 20261209120000_empresas_catalogo.sql): o currículo sugere o nome enquanto a
// pessoa escreve "Empresa ou lugar". O banco só sugere para quem entrou, e só as empresas com conta no
// Publike ou os nomes que estão em 3 currículos ou mais.

export async function sugerirEmpresas(texto: string): Promise<{ ok: true; nomes: string[] } | { ok: false }> {
  const busca = typeof texto === "string" ? texto.trim().slice(0, 80) : "";
  if (MODO_DEMO || busca.length < 2) return { ok: true, nomes: [] };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("empresas_sugeridas", { p_texto: busca });
  // sem a migração (ou sem conta), o campo segue sem sugestão
  if (error) {
    if (error.code !== "PGRST202") console.warn(`Publike: sem sugestão de empresas: ${error.message}`);
    return { ok: false };
  }
  return { ok: true, nomes: [...new Set((data ?? []).map((e) => e.nome))] };
}
