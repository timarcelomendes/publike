import "server-only";
import { createHash } from "node:crypto";
import { SITE_URL } from "@/lib/config";
import { chaveDoServidor, chaveSecretaSupabase } from "./ambiente";
import { acessoFila } from "./filas";

// IndexNow (migração 20270426120000): o aviso na hora para o Bing (que também alimenta a busca do ChatGPT, do
// DuckDuckGo e do Copilot), o Yandex, o Naver e o Seznam de que um anúncio entrou no ar, mudou ou saiu. Um aviso só
// vale para todos eles. A chave é tirada da chave do servidor (nada para configurar) e fica pública em /indexnow.txt,
// como o protocolo pede: ela só prova que o aviso veio do dono do site.

/** A chave do IndexNow (32 letras e números), a mesma enquanto a chave do servidor não mudar; null sem ela. */
export function chaveIndexNow(): string | null {
  const base = chaveDoServidor() || chaveSecretaSupabase();
  if (!base) return null;
  return createHash("sha256").update(`publike-indexnow:${base}`).digest("hex").slice(0, 32);
}

/** Manda uma lista de endereços do site (até 10.000) de uma vez. */
export async function avisarIndexNow(urls: string[]): Promise<{ ok: boolean; status?: number }> {
  const chave = chaveIndexNow();
  if (!chave || !urls.length || !SITE_URL.startsWith("https://")) return { ok: false };
  const host = new URL(SITE_URL).host;
  const r = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key: chave, keyLocation: `${SITE_URL}/indexnow.txt`, urlList: urls.slice(0, 10_000) }),
    signal: AbortSignal.timeout(10_000),
  });
  // 200: aceito; 202: aceito, a chave ainda vai ser conferida
  return { ok: r.status === 200 || r.status === 202, status: r.status };
}

/**
 * A rotina das filas: os anúncios (vagas e serviços) que entraram no ar, saíram ou foram editados desde o último aviso,
 * num aviso só. Só no endereço de verdade (https).
 */
export async function avisarIndexNowDosAnuncios(limite = 500): Promise<{ avisados: number; motivo?: string }> {
  if (!chaveIndexNow() || !SITE_URL.startsWith("https://")) return { avisados: 0 };
  const acesso = acessoFila();
  if (!acesso) return { avisados: 0 };
  const { data, error } = await acesso.cliente.rpc("servidor_anuncios_para_indexnow", {
    p_chave: acesso.chave,
    p_limite: limite,
  });
  if (error) {
    // sem a migração 20270426 no banco: espera
    if (error.code === "PGRST202") return { avisados: 0 };
    return { avisados: 0, motivo: `Não deu para ler os anúncios para o IndexNow: ${error.message}` };
  }
  const itens = data ?? [];
  if (!itens.length) return { avisados: 0 };
  try {
    const r = await avisarIndexNow(itens.map((v) => `${SITE_URL}/anuncio/${v.anuncio_id}`));
    // 429 (muitos avisos): o resto vai na próxima rodada, sem alarme
    if (r.status === 429) return { avisados: 0 };
    if (!r.ok) return { avisados: 0, motivo: `O IndexNow recusou o aviso dos anúncios (código ${r.status}).` };
  } catch (e) {
    return { avisados: 0, motivo: `IndexNow: ${e instanceof Error ? e.message : String(e)}` };
  }
  await acesso.cliente.rpc("servidor_anuncios_avisados_ao_indexnow", {
    p_chave: acesso.chave,
    p_itens: itens.map((v) => ({ anuncio: v.anuncio_id, no_ar: v.no_ar })),
  });
  return { avisados: itens.length };
}
