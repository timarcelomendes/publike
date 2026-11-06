import "server-only";
import { createSign } from "node:crypto";
import { SITE_URL } from "@/lib/config";
import { acessoFila } from "./filas";

// Avisar o Google das vagas (06/11/2026; migração 20270222120000_google_vagas.sql): pela Indexing API, a vaga que
// entra no ar é avisada na hora (URL_UPDATED) e a que sai, também (URL_DELETED). Sem isso, o Google passava a cada
// duas semanas e muitas vagas venciam antes de aparecer no Google Vagas. Precisa de uma conta de serviço do Google
// Cloud com a Indexing API ligada, adicionada como proprietária do publike.org no Search Console, e da chave dela
// (o .json, inteiro ou em base64) em GOOGLE_INDEXING_CREDENCIAL, na Vercel. Sem ela, nada acontece.

type Credencial = { client_email: string; private_key: string };

function credencial(): Credencial | null {
  const bruto = (process.env.GOOGLE_INDEXING_CREDENCIAL || "").trim();
  if (!bruto) return null;
  try {
    const json = bruto.startsWith("{") ? bruto : Buffer.from(bruto, "base64").toString("utf8");
    const c = JSON.parse(json) as Partial<Credencial>;
    if (typeof c.client_email !== "string" || typeof c.private_key !== "string") return null;
    return { client_email: c.client_email, private_key: c.private_key.replace(/\\n/g, "\n") };
  } catch {
    console.warn("Publike: GOOGLE_INDEXING_CREDENCIAL não é o .json da conta de serviço.");
    return null;
  }
}

/** Se o aviso ao Google está configurado (para o admin). */
export function googleVagasConfigurado() {
  return Boolean(credencial());
}

let token: { valor: string; ate: number } | null = null;

/** O acesso da conta de serviço (a assinatura JWT do Google, sem biblioteca), guardado até perto de vencer. */
async function acessoDoGoogle(c: Credencial): Promise<string> {
  if (token && token.ate > Date.now() + 60_000) return token.valor;
  const agora = Math.floor(Date.now() / 1000);
  const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const corpo = `${parte({ alg: "RS256", typ: "JWT" })}.${parte({
    iss: c.client_email,
    scope: "https://www.googleapis.com/auth/indexing",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600,
  })}`;
  const assinatura = createSign("RSA-SHA256").update(corpo).sign(c.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${corpo}.${assinatura}`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !j.access_token)
    throw new Error(`o Google recusou a conta de serviço (${r.status} ${j.error ?? ""})`.trim());
  token = { valor: j.access_token, ate: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return token.valor;
}

/**
 * A rotina das filas: avisa o Google das vagas que entraram ou saíram do ar (e das editadas), até `limite` por
 * rodada e 180 por dia (a cota do Google é 200). Só no endereço de verdade (https), com a credencial.
 */
export async function avisarGoogleDasVagas(limite = 10): Promise<{ avisadas: number; motivo?: string }> {
  const c = credencial();
  if (!c || !SITE_URL.startsWith("https://")) return { avisadas: 0 };
  const acesso = acessoFila();
  if (!acesso) return { avisadas: 0 };
  const { data, error } = await acesso.cliente.rpc("servidor_vagas_para_o_google", {
    p_chave: acesso.chave,
    p_limite: limite,
  });
  if (error) {
    // sem a migração 20270222 no banco: espera
    if (error.code === "PGRST202") return { avisadas: 0 };
    return { avisadas: 0, motivo: `Não deu para ler as vagas para avisar o Google: ${error.message}` };
  }
  let avisadas = 0;
  try {
    for (const v of data ?? []) {
      const r = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
        method: "POST",
        headers: { authorization: `Bearer ${await acessoDoGoogle(c)}`, "content-type": "application/json" },
        body: JSON.stringify({
          url: `${SITE_URL}/anuncio/${v.anuncio_id}`,
          type: v.no_ar ? "URL_UPDATED" : "URL_DELETED",
        }),
        signal: AbortSignal.timeout(10_000),
      });
      // a cota do dia acabou: o resto fica para amanhã
      if (r.status === 429) break;
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
        return {
          avisadas,
          motivo: `O Google recusou o aviso da vaga (${r.status}): ${j.error?.message ?? "sem detalhe"}. A conta de serviço é proprietária do publike.org no Search Console?`,
        };
      }
      await acesso.cliente.rpc("servidor_vaga_avisada_ao_google", {
        p_chave: acesso.chave,
        p_anuncio: v.anuncio_id,
        p_no_ar: v.no_ar,
      });
      avisadas++;
    }
  } catch (e) {
    return { avisadas, motivo: `Aviso das vagas ao Google: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { avisadas };
}
