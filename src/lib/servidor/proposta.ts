import "server-only";
import { lerProposta, lerPropostaDoCandidato, type Proposta, type PropostaDoCandidato } from "@/lib/proposta";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// A proposta (migração 20270110120000). null: sem a migração.

export async function propostasDaVaga(anuncioId: string): Promise<Map<string, Proposta> | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("propostas_da_vaga", { p_anuncio: anuncioId });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler as propostas: ${error.message}`);
    return null;
  }
  const mapa = new Map<string, Proposta>();
  for (const x of (data ?? []) as unknown[]) {
    const p = lerProposta(x);
    if (p) mapa.set(p.perfil_id, p);
  }
  return mapa;
}

/** A proposta para mim nesta vaga (undefined: sem a migração; null: não há). */
export async function minhaProposta(anuncioId: string): Promise<PropostaDoCandidato | null | undefined> {
  const { data, error } = await (await criarClienteServidor()).rpc("minha_proposta", { p_anuncio: anuncioId });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler a proposta: ${error.message}`);
    return undefined;
  }
  return lerPropostaDoCandidato(data);
}
