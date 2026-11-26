import "server-only";
import { MODO_DEMO } from "@/lib/config";
import type { Conquista, ConquistaParaConfirmar, ConquistaPendente, PerguntaDeResposta } from "@/lib/conquistas";
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

/** "A empresa te respondeu?" (migração 20270526120000): as perguntas abertas da pessoa. Sem a migração, nada. */
export async function perguntasDeResposta(): Promise<PerguntaDeResposta[]> {
  if (MODO_DEMO) return [];
  try {
    const { data, error } = await (await criarClienteServidor()).rpc("minhas_perguntas_de_resposta");
    if (error) {
      semMigracao(error, "as perguntas de resposta");
      return [];
    }
    return data ?? [];
  } catch {
    return [];
  }
}

/**
 * "Quem você contratou?" (migração 20271006120000): as perguntas que o Publike fez à conta e esperam a resposta, com o
 * código do link (o cartão do painel abre a mesma página do e-mail). Sem a migração, nada.
 */
export async function minhasPerguntasQuemContratou(): Promise<
  { anuncio_id: string; titulo: string; token: string; aceitos: number; contato_direto: boolean; perguntada_em: string }[]
> {
  if (MODO_DEMO) return [];
  try {
    const { data, error } = await (await criarClienteServidor()).rpc("minhas_perguntas_quem_contratou");
    if (error) {
      semMigracao(error, "as perguntas de quem foi contratado");
      return [];
    }
    return (data ?? []).filter((x) => /^[0-9a-f]{64}$/.test(x.token));
  } catch {
    return [];
  }
}
