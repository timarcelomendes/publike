import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { LOGIN_CELULAR, MODO_DEMO } from "@/lib/config";
import { caminhoSeguro } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { acessoFila } from "./filas";

// Juntar a conta nova do WhatsApp com a conta que já existe (21/11/2026; migração 20270819120000). Logo depois de
// entrar pelo WhatsApp numa conta nova, se o número está no cadastro de outra conta com e-mail, o site guarda uma prova
// assinada (o número que a pessoa provou ter, a conta nova e para onde ela ia) por 15 minutos, só neste navegador, e
// leva a /entrar/juntar. Lá, ela entra na outra conta e confirma: o número é vinculado a essa conta e a conta nova,
// ainda vazia, é apagada. Sem a prova (outro navegador, vencida, mexida), nada se junta.

export const COOKIE_JUNTAR = "publike_juntar";
export const CAMINHO_JUNTAR = "/entrar/juntar";
const VALIDADE_SEG = 15 * 60;

export type ProvaDoWhatsapp = {
  /** a conta nova, criada pelo código do WhatsApp */
  nova: string;
  /** o número que a pessoa provou ter (o celular do login) */
  numero: string;
  /** para onde ela ia depois de entrar */
  proximo: string;
  /** a pessoa disse que a outra conta não é dela: segue com a conta nova */
  recusou?: boolean;
  /** vence (segundos desde 1970) */
  ate: number;
};

function segredo() {
  return (process.env.SUPABASE_SMS_HOOK_SECRET ?? "").trim();
}

function assinatura(corpo: string) {
  return createHmac("sha256", segredo()).update(`juntar|${corpo}`).digest("base64url");
}

/** O valor do cookie: o corpo em base64url, um ponto e a HMAC. Sem o segredo, null. */
export function assinarProva(prova: ProvaDoWhatsapp): string | null {
  if (!segredo()) return null;
  const corpo = Buffer.from(JSON.stringify(prova)).toString("base64url");
  return `${corpo}.${assinatura(corpo)}`;
}

/** A prova, se a assinatura bate e ainda vale. */
export function lerProva(valor: string | undefined, agoraSeg = Math.floor(Date.now() / 1000)): ProvaDoWhatsapp | null {
  if (!valor || !segredo()) return null;
  const [corpo, assinado, ...resto] = valor.split(".");
  if (!corpo || !assinado || resto.length) return null;
  const esperada = Buffer.from(assinatura(corpo));
  const recebida = Buffer.from(assinado);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  try {
    const p = JSON.parse(Buffer.from(corpo, "base64url").toString()) as ProvaDoWhatsapp;
    if (typeof p.nova !== "string" || typeof p.numero !== "string" || typeof p.ate !== "number") return null;
    if (p.ate < agoraSeg) return null;
    return { ...p, proximo: caminhoSeguro(p.proximo, "/") };
  } catch {
    return null;
  }
}

async function gravarProva(prova: ProvaDoWhatsapp) {
  const valor = assinarProva(prova);
  if (!valor) return false;
  (await cookies()).set(COOKIE_JUNTAR, valor, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(0, prova.ate - Math.floor(Date.now() / 1000)),
  });
  return true;
}

/** A prova deste navegador (ou null). */
export async function provaDoNavegador() {
  return lerProva((await cookies()).get(COOKIE_JUNTAR)?.value);
}

export async function apagarProva() {
  (await cookies()).delete(COOKIE_JUNTAR);
}

/** A pessoa disse que a outra conta não é dela: segue com a conta nova sem perguntar de novo (até a prova vencer). */
export async function recusarJuntar(prova: ProvaDoWhatsapp) {
  await gravarProva({ ...prova, recusou: true });
}

/** As contas (e-mails escondidos) que podem receber o número da conta nova da sessão, ou null. */
export async function contasParaJuntar(usuarioId: string) {
  const acesso = acessoFila();
  if (!acesso) return null;
  const { data, error } = await acesso.cliente.rpc("servidor_whatsapp_juntar_info", {
    p_chave: acesso.chave,
    p_usuario: usuarioId,
  });
  const r = (error ? null : data) as { pode?: boolean; numero?: string; contas?: string[] } | null;
  return r?.pode && r.numero && r.contas?.length ? { numero: r.numero, contas: r.contas } : null;
}

/**
 * Depois de entrar (irDepoisDoLogin e /auth/continuar): se a pessoa acabou de criar uma conta pelo WhatsApp com um
 * número que está no cadastro de outra conta, grava a prova e devolve /entrar/juntar. Senão, null (segue normal).
 */
export async function destinoParaJuntar(proximo: string): Promise<string | null> {
  if (MODO_DEMO || !LOGIN_CELULAR || !segredo()) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  // só a conta que nasceu pelo celular, sem e-mail
  if (!u?.phone || u.email) return null;
  const ja = await provaDoNavegador();
  if (ja?.nova === u.id && ja.recusou) return null;
  const info = await contasParaJuntar(u.id);
  if (!info) return null;
  const ok = await gravarProva({
    nova: u.id,
    numero: info.numero,
    proximo: caminhoSeguro(proximo, "/"),
    ate: Math.floor(Date.now() / 1000) + VALIDADE_SEG,
  });
  return ok ? CAMINHO_JUNTAR : null;
}
