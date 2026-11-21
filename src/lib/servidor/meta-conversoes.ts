import "server-only";
import { acessoFila } from "./filas";
import { configMeta } from "./whatsapp";

// A vaga publicada volta para a Meta (migração 20270824120000): a API de Conversões para mensagens, com o clique do
// anúncio de clique para o WhatsApp (`ctwa_clid`). Assim a campanha de empresas aprende qual clique publicou vaga, e não
// só quem mandou mensagem.
//
// O conjunto de dados da conta do WhatsApp Business vem do banco (o botão "Ligar as conversões" de Admin › WhatsApp ›
// Ligação, migração 20270825120000). Na Vercel, opcionais (só o usuário põe):
//   META_DATASET_ID           outro conjunto de dados, no lugar do guardado no banco
//   META_CONVERSOES_TOKEN     o token com acesso ao conjunto de dados; sem ele, vale o WHATSAPP_TOKEN
// Sem conjunto de dados, nada sai e nada dá erro.

const env = (nome: string) => (process.env[nome] || "").trim();

/** O evento que a Meta conhece para "virou cliente" numa conversa: a vaga publicada. */
const EVENTO = "LeadSubmitted";

function configConversoes(datasetDoBanco: string | null) {
  const meta = configMeta();
  const dataset = env("META_DATASET_ID") || datasetDoBanco || "";
  if (!meta || !meta.wabaId || !/^\d{5,30}$/.test(dataset)) return null;
  return { dataset, wabaId: meta.wabaId, token: env("META_CONVERSOES_TOKEN") || meta.token, base: meta.base };
}

/** Para o Admin: o que está na Vercel (só sim ou não). */
export function situacaoConversoes() {
  return {
    dataset: /^\d{5,30}$/.test(env("META_DATASET_ID")),
    tokenProprio: Boolean(env("META_CONVERSOES_TOKEN")),
  };
}

/**
 * Depois de publicar uma vaga: se a conta chegou por um anúncio de clique para o WhatsApp nos últimos 7 dias, avisa a
 * Meta (uma vez por clique). Não lança: falha fica anotada no banco e no log.
 */
export async function avisarMetaDaVaga(anuncioId: string) {
  const acesso = acessoFila();
  if (!acesso || !configMeta()?.wabaId) return;
  const { cliente, chave } = acesso;
  const guardado = env("META_DATASET_ID")
    ? null
    : await cliente.rpc("servidor_meta_dataset", { p_chave: chave }).then(({ data }) => (data as string | null) ?? null);
  const cfg = configConversoes(guardado);
  if (!cfg) return;
  const { data, error } = await cliente.rpc("servidor_meta_conversao_da_vaga", { p_chave: chave, p_anuncio: anuncioId });
  if (error) {
    // sem a migração: fica como antes
    if (error.code !== "PGRST202") console.error("Publike: a conversão da Meta não foi conferida:", error.message);
    return;
  }
  const clique = (data as { clique?: string } | null)?.clique;
  if (!clique) return;
  let resultado = "ok";
  try {
    const r = await fetch(`${cfg.base}/${cfg.dataset}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({
        data: [
          {
            event_name: EVENTO,
            event_time: Math.floor(Date.now() / 1000),
            event_id: `vaga-${anuncioId}`,
            action_source: "business_messaging",
            messaging_channel: "whatsapp",
            user_data: { whatsapp_business_account_id: cfg.wabaId, ctwa_clid: clique },
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      const corpo = (await r.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
      resultado = `HTTP ${r.status}${corpo?.error?.code ? ` (${corpo.error.code})` : ""}: ${corpo?.error?.message ?? ""}`
        .trim()
        .slice(0, 300);
    }
  } catch (e) {
    resultado = (e instanceof Error ? e.message : String(e)).slice(0, 300);
  }
  if (resultado !== "ok") console.error("Publike: a Meta recusou a conversão da vaga:", resultado);
  const { error: erroResultado } = await cliente.rpc("servidor_meta_conversao_resultado", {
    p_chave: chave,
    p_clique: clique,
    p_resultado: resultado,
  });
  if (erroResultado) console.error("Publike: o resultado da conversão não ficou guardado:", erroResultado.message);
}
