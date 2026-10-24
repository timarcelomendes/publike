"use server";

import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/** Abriu "Mensagens da equipe": as mensagens e os avisos delas no sino ficam lidos. */
export async function lerMensagensDaEquipe(): Promise<void> {
  if (MODO_DEMO) return;
  const supabase = await criarClienteServidor();
  await supabase.rpc("ler_mensagens_equipe");
}
