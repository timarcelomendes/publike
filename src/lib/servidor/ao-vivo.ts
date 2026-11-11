import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { dailyConfigurado } from "./daily";

// As entrevistas ao vivo pelo Publike do mês da conta (migração 20270420120000): o limite vem do plano (10, 20 ou 30;
// 3 nos dias grátis) e o banco recusa a que passar dele. Sem a migração: null, e a ficha segue como antes.

export type AoVivoDoMes = { usadas: number; limite: number };

export async function aoVivoDoMes(): Promise<AoVivoDoMes | null> {
  try {
    const { data, error } = await (await criarClienteServidor()).rpc("minhas_entrevistas_ao_vivo");
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
    const d = data as { usadas?: unknown; limite?: unknown };
    return typeof d.usadas === "number" && typeof d.limite === "number" ? { usadas: d.usadas, limite: d.limite } : null;
  } catch {
    return null;
  }
}

/** A opção "pelo Publike" aparece: a chamada configurada e ainda sobra entrevista no mês (sem o número, como antes). */
export function aoVivoAberto(m: AoVivoDoMes | null) {
  return dailyConfigurado() && (!m || m.usadas < m.limite);
}
