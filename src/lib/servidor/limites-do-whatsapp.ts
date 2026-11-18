import "server-only";
import { cacheLife } from "next/cache";
import { MODO_DEMO } from "@/lib/config";
import { criarClientePublico } from "@/lib/supabase/servidor";

/** Os avisos pelo WhatsApp por mês de cada conta de quem contrata: no grátis e com plano. */
export type LimitesDoWhatsapp = { gratis: number; plano: number };

/**
 * Os limites do mês do WhatsApp (privado.config_whatsapp, migração 20270714120000), para os planos e a página Para
 * empresas. Guardados por uma hora. Com o envio desligado para todos (Admin › WhatsApp), sem o banco ou sem a
 * migração, null: as páginas não falam do WhatsApp.
 */
export async function limitesDoWhatsapp(): Promise<LimitesDoWhatsapp | null> {
  "use cache";
  cacheLife("hours");
  if (MODO_DEMO) return null;
  try {
    const { data, error } = await criarClientePublico().rpc("limites_do_whatsapp");
    if (error || !data || typeof data !== "object") return null;
    const d = data as { ligado?: unknown; limite_gratis?: unknown; limite_plano?: unknown };
    return d.ligado === true && typeof d.limite_gratis === "number" && typeof d.limite_plano === "number"
      ? { gratis: d.limite_gratis, plano: d.limite_plano }
      : null;
  } catch {
    return null;
  }
}
