"use server";

import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Os números do publicar em passos (migração 20261216120000): soma 1 no passo que abriu. Só a contagem do dia,
// sem saber quem foi. Sem a migração (ou com o banco fora), não faz nada: é só número.

export async function registrarPassoPublicar(passo: number): Promise<void> {
  if (MODO_DEMO || !Number.isInteger(passo) || passo < 1 || passo > 6) return;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("registrar_passo_publicar", { p_passo: passo });
  if (error && error.code !== "PGRST202")
    console.error(`Publike: falha ao contar o passo do publicar: ${error.message}`);
}
