import "server-only";
import { cacheLife } from "next/cache";
import { MODO_DEMO } from "@/lib/config";
import { criarClientePublico } from "@/lib/supabase/servidor";

/** O limite de chamadas por dia da API pública: o grátis e o dos planos que liberam tudo. */
export type LimitesDaApi = { gratis: number; plano: number };

/**
 * Os limites da API (privado.config_api, migração 20270713120000_api_publica.sql), para a documentação e os planos.
 * Guardados por uma hora; sem o banco (ou sem a migração), null, e o texto sai sem o número.
 */
export async function limitesDaApi(): Promise<LimitesDaApi | null> {
  "use cache";
  cacheLife("hours");
  if (MODO_DEMO) return null;
  try {
    const { data, error } = await criarClientePublico().rpc("limites_da_api");
    if (error || !data || typeof data !== "object") return null;
    const d = data as { limite_gratis?: unknown; limite_plano?: unknown };
    return typeof d.limite_gratis === "number" && typeof d.limite_plano === "number"
      ? { gratis: d.limite_gratis, plano: d.limite_plano }
      : null;
  } catch {
    return null;
  }
}
