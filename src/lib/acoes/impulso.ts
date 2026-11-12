"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { cuidarDosImpulsos } from "@/lib/servidor/impulsos";
import { acessoPagamentos } from "@/lib/servidor/pagamentos";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// O impulso da vaga (claude/plano-impulsionar-vaga.md): impulsionar com o crédito ou o primeiro grátis, cancelar antes
// de entrar no ar e contar quem chegou pelo anúncio. A compra paga fica em acoes/assinatura.ts (comprarImpulso).

type Resultado = { ok: true } | { ok: false; erro: string };

/** O cookie de quem chegou pelo anúncio (7 dias): "código.visitante", sem nada da pessoa. */
const COOKIE_IMPULSO = "publike_impulso";
const CODIGO = /^[a-z0-9]{6,20}$/;
const VISITANTE = /^[A-Za-z0-9_-]{16,64}$/;

/** Impulsionar sem pagar: com os dias de crédito (de um impulso interrompido) ou o primeiro grátis. */
export async function impulsionarSemPagar(anuncio: string, jeito: "credito" | "cortesia"): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncio) || (jeito !== "credito" && jeito !== "cortesia")) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  if (usuario.papel === "recrutador") return { ok: false, erro: "Só quem administra a conta pode impulsionar." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("impulsionar_sem_pagar", { p_anuncio: anuncio, p_jeito: jeito });
  if (error) return { ok: false, erro: "Não deu para impulsionar agora. Tente de novo em instantes." };
  const r = (data ?? {}) as { ok?: boolean; erro?: string };
  if (!r.ok) return { ok: false, erro: r.erro ?? "Não deu para impulsionar agora." };
  // o robô cria o anúncio no Google já
  after(() => cuidarDosImpulsos());
  refresh();
  return { ok: true };
}

/** Desistir antes de o anúncio entrar no ar: a compra volta pelo estorno; o crédito volta como crédito. */
export async function cancelarImpulso(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  if (usuario.papel === "recrutador") return { ok: false, erro: "Só quem administra a conta pode cancelar." };
  try {
    const a = acessoPagamentos();
    const { data, error } = await a.cliente.rpc("servidor_impulso_cancelar", {
      p_chave: a.chave,
      p_conta: usuario.id,
      p_id: id,
    });
    if (error) throw new Error(error.message);
    const r = (data ?? {}) as { ok?: boolean; erro?: string };
    if (!r.ok) return { ok: false, erro: r.erro ?? "Não deu para cancelar agora." };
    // tira do Google e pede o estorno já
    after(() => cuidarDosImpulsos());
    refresh();
    return { ok: true };
  } catch (e) {
    console.error("Publike: falha ao cancelar o impulso:", e instanceof Error ? e.message : e);
    return { ok: false, erro: "Não deu para cancelar agora. Tente de novo em instantes." };
  }
}

/** A visita que chegou pelo anúncio (a página da vaga, no navegador): conta uma por dia e guarda o cookie. */
export async function contarVisitaDoImpulso(codigo: string, anuncio: string, visitante: string): Promise<void> {
  if (MODO_DEMO || !CODIGO.test(codigo) || !UUID.test(anuncio) || !VISITANTE.test(visitante)) return;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("contar_visita_do_impulso", {
    p_codigo: codigo,
    p_anuncio: anuncio,
    p_visitante: visitante,
  });
  if (data === true || data === false) {
    (await cookies()).set(COOKIE_IMPULSO, `${codigo}.${visitante}`, {
      maxAge: 7 * 24 * 60 * 60,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
}

/** Depois de curtir: se a pessoa chegou pelo anúncio desta vaga nos últimos 7 dias, a curtida conta no impulso. */
export async function contarCurtidaDoImpulso(anuncio: string): Promise<void> {
  const valor = (await cookies()).get(COOKIE_IMPULSO)?.value ?? "";
  const [codigo, visitante] = valor.split(".");
  if (!codigo || !visitante || !CODIGO.test(codigo) || !VISITANTE.test(visitante) || !UUID.test(anuncio)) return;
  const supabase = await criarClienteServidor();
  await supabase.rpc("contar_curtida_do_impulso", { p_codigo: codigo, p_visitante: visitante, p_anuncio: anuncio });
}
