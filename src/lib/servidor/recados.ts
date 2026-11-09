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
  /** o modelo do post ("procuro", "contratando"...; migração 20270323120000; sem ela, "livre") */
  modelo?: string;
};

/** Junta o modelo de cada post (uma leitura a mais; sem a migração, tudo fica "livre"). */
async function comModelos<T extends { id: string }>(recados: T[]): Promise<(T & { modelo: string })[]> {
  if (!recados.length) return [];
  try {
    const { data, error } = await (await criarClienteServidor()).rpc("modelos_dos_recados", {
      p_ids: recados.map((r) => r.id),
    });
    const modelos = new Map((error ? [] : (data ?? [])).map((m) => [m.id, m.modelo]));
    return recados.map((r) => ({ ...r, modelo: modelos.get(r.id) ?? "livre" }));
  } catch {
    return recados.map((r) => ({ ...r, modelo: "livre" }));
  }
}

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
    return comModelos(data ?? []);
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
    return comModelos(data ?? []);
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
    if (error || !data) return null;
    return (await comModelos([data]))[0] ?? null;
  } catch {
    return null;
  }
}
