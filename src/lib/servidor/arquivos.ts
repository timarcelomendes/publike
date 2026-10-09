import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Pastas de cada pessoa no Storage: avatars/<id>/ (foto de perfil) e
// trabalhos/<id>/ (fotos dos serviços).

type ComStorage = Pick<SupabaseClient, "storage">;

export const PASTAS_DA_PESSOA = ["avatars", "trabalhos"] as const;

/**
 * Apaga tudo o que a pessoa guardou no Storage. Vem antes de excluir a conta:
 * o Supabase não apaga uma conta que ainda tem arquivos. Devolve false se falhar.
 */
export async function apagarArquivosDaPessoa(cliente: ComStorage, usuarioId: string) {
  for (const balde of PASTAS_DA_PESSOA) {
    for (let lote = 0; lote < 20; lote++) {
      const { data: arquivos, error: erroLista } = await cliente.storage.from(balde).list(usuarioId, { limit: 100 });
      if (erroLista) return false;
      if (!arquivos?.length) break;
      const { error } = await cliente.storage.from(balde).remove(arquivos.map((a) => `${usuarioId}/${a.name}`));
      if (error) return false;
    }
  }
  return true;
}

/** Tira do Storage as fotos de trabalho que nenhum serviço usa mais. */
export async function limparFotosDeTrabalho(cliente: ComStorage, usuarioId: string, emUso: readonly string[]) {
  const usadas = new Set(emUso.map((c) => c.split("/")[1]));
  const { data: arquivos } = await cliente.storage.from("trabalhos").list(usuarioId, { limit: 200 });
  const sobras = (arquivos ?? []).filter((a) => !usadas.has(a.name)).map((a) => `${usuarioId}/${a.name}`);
  if (sobras.length) await cliente.storage.from("trabalhos").remove(sobras);
}
