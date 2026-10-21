import "server-only";
import { cacheLife } from "next/cache";
import { MODO_DEMO } from "@/lib/config";
import { criarClientePublico } from "@/lib/supabase/servidor";

/**
 * O logo de quem publicou (a foto do perfil, que é pública) para o cartão do anúncio. Sem
 * sessão, o mesmo para todo mundo, guardado por alguns minutos. Se a leitura falhar, nada
 * fica guardado e o cartão mostra as iniciais.
 */
async function fotosGuardadas(ids: string[]): Promise<Record<string, string | null>> {
  "use cache";
  cacheLife("minutes");
  const { data, error } = await criarClientePublico().from("perfis").select("id, foto").in("id", ids);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.foto]));
}

/** As fotos (logos) de quem publicou, por id. Sem foto, ou sem leitura, fica de fora. */
export async function fotosDosAutores(ids: Iterable<string>): Promise<Record<string, string | null>> {
  // a mesma lista na mesma ordem: a mesma entrada no cache
  const unicos = [...new Set(ids)].sort();
  if (MODO_DEMO || unicos.length === 0) return {};
  try {
    return await fotosGuardadas(unicos);
  } catch (e) {
    console.error(`Publike: falha ao ler os logos: ${e instanceof Error ? e.message : String(e)}`);
    return {};
  }
}
