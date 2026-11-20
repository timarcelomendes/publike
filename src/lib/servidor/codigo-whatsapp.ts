import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { acessoFila } from "./filas";
import { configMeta, enviarTexto } from "./whatsapp";

// O código de entrar pelo WhatsApp (20/11/2026; migração 20270817120000). O Supabase Auth, com o login por celular
// ligado, gera o código e chama o gancho "Send SMS" (Authentication › Hooks, HTTPS, com o segredo em
// SUPABASE_SMS_HOOK_SECRET); este arquivo confere a assinatura (Standard Webhooks) e manda o código pela conversa do
// Publike. Só na janela de 24 horas da Meta: fora dela, devolve o erro com o que fazer (mandar um "oi" antes).

/** A mensagem com o código (o código nunca fica guardado: a conversa registra só a marca). */
export function textoDoCodigo(codigo: string) {
  return `Seu código para entrar no Publike: *${codigo}*\n\nDigite no site para continuar. Não passe este código para ninguém: o Publike nunca pede ele por mensagem.`;
}
export const MARCA_DO_CODIGO = "[Código de acesso enviado]";
export const FORA_DA_JANELA =
  "Para receber o código no WhatsApp, mande antes um oi para o Publike no (62) 98477-1907 e peça o código de novo.";

/**
 * Standard Webhooks: "webhook-signature" traz uma ou mais "v1,<base64>", a HMAC-SHA256 de "<id>.<timestamp>.<corpo>"
 * com o segredo (o que vem depois de "v1,whsec_", em base64). Aceita até 5 minutos de diferença no relógio.
 */
export function assinaturaDoGanchoValida(
  segredo: string,
  cab: { id: string | null; timestamp: string | null; assinatura: string | null },
  corpo: string,
  agoraSeg = Math.floor(Date.now() / 1000),
) {
  const chave = segredo.trim().replace(/^v1,/, "").replace(/^whsec_/, "");
  if (!chave || !cab.id || !cab.timestamp || !cab.assinatura) return false;
  const ts = Number(cab.timestamp);
  if (!Number.isFinite(ts) || Math.abs(agoraSeg - ts) > 300) return false;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(chave, "base64");
  } catch {
    return false;
  }
  if (!bytes.length) return false;
  const esperada = createHmac("sha256", bytes).update(`${cab.id}.${cab.timestamp}.${corpo}`).digest();
  return cab.assinatura.split(" ").some((parte) => {
    const [versao, valor] = parte.split(",");
    if (versao !== "v1" || !valor) return false;
    const recebida = Buffer.from(valor, "base64");
    return recebida.length === esperada.length && timingSafeEqual(recebida, esperada);
  });
}

export type ResultadoDoCodigo = { ok: true } | { ok: false; status: number; mensagem: string };

/** Manda o código pelo WhatsApp do Publike para o celular do pedido. */
export async function mandarCodigoPeloWhatsapp(telefone: string, codigo: string): Promise<ResultadoDoCodigo> {
  if (!/^\d{4,10}$/.test(codigo)) return { ok: false, status: 400, mensagem: "Código inválido." };
  const acesso = acessoFila();
  const cfg = configMeta();
  if (!acesso || !cfg) return { ok: false, status: 503, mensagem: "O WhatsApp do Publike não está ligado." };
  const { cliente: banco, chave } = acesso;
  const { data, error } = await banco.rpc("servidor_whatsapp_codigo", { p_chave: chave, p_numero: telefone });
  if (error) return { ok: false, status: 503, mensagem: "Não deu para conferir a conversa agora." };
  const c = data as unknown as { conversa: string | null; numero: string | null; na_janela: boolean };
  if (!c.conversa || !c.numero || !c.na_janela) return { ok: false, status: 400, mensagem: FORA_DA_JANELA };
  const r = await enviarTexto(cfg, c.numero, textoDoCodigo(codigo));
  if (!r.ok) {
    console.error("Publike: o código de acesso não saiu pelo WhatsApp:", r.erro);
    return { ok: false, status: 502, mensagem: "O WhatsApp não mandou o código agora. Tente de novo em instantes." };
  }
  await banco.rpc("servidor_whatsapp_conversa_saida", {
    p_chave: chave,
    p_conversa: c.conversa,
    p_texto: MARCA_DO_CODIGO,
    p_wamid: r.wamid,
  });
  return { ok: true };
}
