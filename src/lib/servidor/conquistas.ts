import "server-only";
import { MODO_DEMO } from "@/lib/config";
import type { Conquista, ConquistaParaConfirmar, ConquistaPendente } from "@/lib/conquistas";
import { raioDaBusca, type Filtros } from "@/lib/filtros";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// A leitura das conquistas (só pelas funções do banco). Sem a migração 20270322120000, tudo volta vazio e o feed
// funciona como antes.

function semMigracao(error: { code?: string; message: string }, oque: string) {
  if (error.code !== "PGRST202") console.error(`Publike: falha ao ler ${oque}:`, error.message);
}

/** As conquistas mostradas perto do ponto da busca (no raio de hoje), das empresas seguidas e a da própria pessoa. */
export async function conquistasDaLinha(filtros: Filtros): Promise<Conquista[]> {
  if (MODO_DEMO) return [];
  try {
    const { data, error } = await (await criarClienteServidor()).rpc("conquistas_perto", {
      p_lat: filtros.lat,
      p_lng: filtros.lng,
      p_raio_km: raioDaBusca(filtros),
      p_limite: 30,
    });
    if (error) {
      semMigracao(error, "as conquistas");
      return [];
    }
    return data ?? [];
  } catch {
    return [];
  }
}

/** As perguntas abertas da pessoa ("Deu certo?" e "Mostrar no Publike?"). */
export async function conquistasPendentes(): Promise<ConquistaPendente[]> {
  if (MODO_DEMO) return [];
  try {
    const { data, error } = await (await criarClienteServidor()).rpc("minhas_conquistas_pendentes");
    if (error) {
      semMigracao(error, "as perguntas das conquistas");
      return [];
    }
    return data ?? [];
  } catch {
    return [];
  }
}

/** Quem disse que começou numa vaga da conta (todas, ou só a de `anuncioId`). */
export async function conquistasParaConfirmar(anuncioId?: string): Promise<ConquistaParaConfirmar[]> {
  if (MODO_DEMO) return [];
  try {
    const { data, error } = await (await criarClienteServidor()).rpc("conquistas_para_confirmar", {
      p_anuncio: anuncioId ?? null,
    });
    if (error) {
      semMigracao(error, "as conquistas para confirmar");
      return [];
    }
    return data ?? [];
  } catch {
    return [];
  }
}
