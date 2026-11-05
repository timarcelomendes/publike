import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { MODO_DEMO } from "@/lib/config";
import { falasDaIA, limparApelido } from "@/lib/ia-nomes";
import { criarClientePublico } from "@/lib/supabase/servidor";

// O apelido da IA (claude/plano-ia-por-funcionalidade.md): o mesmo para todo mundo, guardado por horas e
// renovado na hora em que o admin salva (TAG_APELIDO_IA). Sem a migração ou com falha, null ("a IA").

export const TAG_APELIDO_IA = "apelido-ia";

export async function apelidoDaIA(): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAG_APELIDO_IA);
  if (MODO_DEMO) return null;
  try {
    const { data, error } = await criarClientePublico().rpc("config_publica");
    if (error) return null;
    return limparApelido(data?.[0]?.ia_apelido ?? null);
  } catch {
    return null;
  }
}

/** As falas da IA com o apelido de agora ("com Ipê" ou "com a IA"), para as telas do servidor e os e-mails. */
export async function falasDaIANoServidor() {
  return falasDaIA(await apelidoDaIA());
}
