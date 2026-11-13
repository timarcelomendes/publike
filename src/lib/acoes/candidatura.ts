"use server";

import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

/**
 * O toque em "Candidatar no site da empresa" (migração 20270513120000): conta para quem publicou e, para quem tem
 * conta, a vaga fica em Minhas curtidas ("Fui para o site"). O banco não conta quem publicou nem a mesma pessoa de
 * novo em 30 minutos. Nunca atrapalha a ida ao site: sem a migração ou com erro, nada acontece.
 */
export async function registrarIdaAoSite(anuncioId: string): Promise<void> {
  if (MODO_DEMO || !UUID.test(anuncioId)) return;
  try {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("registrar_ida_ao_site", { p_anuncio: anuncioId });
    if (error && error.code !== "PGRST202")
      console.error(`Publike: não deu para contar a ida ao site da vaga ${anuncioId}: ${error.message}`);
  } catch (e) {
    console.error("Publike: não deu para contar a ida ao site:", e);
  }
}
