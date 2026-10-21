import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { raioDaBusca, type Filtros } from "@/lib/filtros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Database } from "@/lib/supabase/tipos-banco";

// A leitura dos recados (só pelas funções do banco). Sem a migração dos recados, tudo volta vazio
// e a home funciona como antes.

type Linha = Database["public"]["Functions"]["recados_do_perfil"]["Returns"][number];

/** Um recado como as telas usam. */
export type Recado = Linha & {
  /** só na linha do tempo: quem escreveu é alguém que a pessoa segue */
  seguindo?: boolean;
};

const QUANTOS_NA_LINHA = 60;

/** Os recados da linha do tempo: perto do ponto da busca (no raio de hoje), de quem a pessoa segue e os dela. */
export async function recadosDaLinha(filtros: Filtros): Promise<Recado[]> {
  if (MODO_DEMO) return [];
  try {
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("linha_recados", {
      p_lat: filtros.lat,
      p_lng: filtros.lng,
      p_raio_km: raioDaBusca(filtros),
      p_limite: QUANTOS_NA_LINHA,
    });
    if (error) {
      if (error.code !== "PGRST202") console.error("Publike: falha ao ler os recados:", error.message);
      return [];
    }
    return data ?? [];
  } catch {
    return [];
  }
}

/** Os recados de um perfil (no ar; para a dona, também os em revisão). */
export async function recadosDoPerfil(perfilId: string): Promise<Recado[]> {
  if (MODO_DEMO) return [];
  try {
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("recados_do_perfil", { p_perfil: perfilId, p_limite: 30 });
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

/** Um recado só (a página do recado). */
export async function umRecado(id: string): Promise<Recado | null> {
  if (MODO_DEMO) return null;
  try {
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("recado", { p_id: id }).maybeSingle();
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}
