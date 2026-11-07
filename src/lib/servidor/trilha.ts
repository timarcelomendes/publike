import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Passo } from "@/lib/trilha";

/** Os passos de cada candidato da vaga (migração 20270228120000). null: sem a migração. */
export async function trilhaDaVaga(anuncioId: string): Promise<Map<string, Passo[]> | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("trilha_da_vaga", { p_anuncio: anuncioId });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler a trilha da vaga: ${error.message}`);
    return null;
  }
  const passos = new Map<string, Passo[]>();
  for (const p of data ?? []) passos.set(p.perfil_id, [...(passos.get(p.perfil_id) ?? []), { o_que: p.o_que, em: p.em }]);
  return passos;
}
