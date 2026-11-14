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
// de entrar no ar e contar quem chegou pelo anúncio. O pacote de candidatos (claude/plano-nova-venda-do-impulso.md,
// migração 20270519120000): parar e usar o saldo. As compras pagas ficam em acoes/assinatura.ts (comprarImpulso e
// comprarPacote).

type Resultado = { ok: true } | { ok: false; erro: string };

/** O cookie de quem chegou pelo anúncio (7 dias): "código.visitante", sem nada da pessoa. */
const COOKIE_IMPULSO = "publike_impulso";
const CODIGO = /^[a-z0-9]{6,20}$/;
const VISITANTE = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Impulsionar sem pagar: com os dias de crédito (de um impulso interrompido ou da verba que o Google não usou,
 * migração 20270518120000) ou o primeiro grátis.
 */
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

/**
 * A visita que chegou pelo impulso (a página da vaga ou o cartão do quadro, no navegador): conta uma por dia e guarda o
 * cookie. A origem diz por onde: o anúncio no Google, o link da vaga embaixo do anúncio geral ou o quadro do Publike.
 */
export async function contarVisitaDoImpulso(
  codigo: string,
  anuncio: string,
  visitante: string,
  origem: "google" | "link" | "quadro" = "google",
): Promise<void> {
  if (MODO_DEMO || !CODIGO.test(codigo) || !UUID.test(anuncio) || !VISITANTE.test(visitante)) return;
  if (origem !== "google" && origem !== "link" && origem !== "quadro") return;
  const supabase = await criarClienteServidor();
  let { data, error } = await supabase.rpc("contar_visita_do_impulso", {
    p_codigo: codigo,
    p_anuncio: anuncio,
    p_visitante: visitante,
    p_origem: origem,
  });
  // antes da migração 20270519120000: sem a origem
  if (error?.code === "PGRST202")
    ({ data, error } = await supabase.rpc("contar_visita_do_impulso", {
      p_codigo: codigo,
      p_anuncio: anuncio,
      p_visitante: visitante,
    }));
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

/**
 * Depois de curtir: se este navegador chegou pelo impulso desta vaga nos últimos 7 dias, a curtida conta no impulso. O
 * banco acha o impulso pela vaga e pelo navegador (migração 20270519120000): quem abriu duas vagas do quadro antes de
 * curtir a primeira também conta. No pacote de candidatos, a curtida que completa o pacote o termina.
 */
export async function contarCurtidaDoImpulso(anuncio: string): Promise<void> {
  const valor = (await cookies()).get(COOKIE_IMPULSO)?.value ?? "";
  const [codigo, visitante] = valor.split(".");
  if (!codigo || !visitante || !CODIGO.test(codigo) || !VISITANTE.test(visitante) || !UUID.test(anuncio)) return;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("contar_curtida_do_impulso", { p_visitante: visitante, p_anuncio: anuncio });
  // antes da migração 20270519120000: pelo código guardado
  if (error?.code === "PGRST202")
    await supabase.rpc("contar_curtida_do_impulso", { p_codigo: codigo, p_visitante: visitante, p_anuncio: anuncio });
}

/** Parar o pacote de candidatos no ar: o que não chegou vira saldo (no presente do Publike, ele só para). */
export async function pararPacote(id: string): Promise<{ ok: true; saldo: number } | { ok: false; erro: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  if (usuario.papel === "recrutador") return { ok: false, erro: "Só quem administra a conta pode parar o pacote." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("parar_pacote", { p_impulso: id });
  if (error) return { ok: false, erro: "Não deu para parar agora. Tente de novo em instantes." };
  const r = (data ?? {}) as { ok?: boolean; erro?: string; saldo?: number };
  if (!r.ok) return { ok: false, erro: r.erro ?? "Não deu para parar agora." };
  refresh();
  return { ok: true, saldo: Number(r.saldo ?? 0) };
}

/** Usar o saldo de candidatos numa vaga: o pacote começa na hora, no quadro das vagas impulsionadas. */
export async function usarSaldoDeCandidatos(anuncio: string, candidatos: number): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncio) || !Number.isInteger(candidatos) || candidatos < 1 || candidatos > 100)
    return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  if (usuario.papel === "recrutador") return { ok: false, erro: "Só quem administra a conta pode usar o saldo." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("usar_saldo_de_candidatos", {
    p_anuncio: anuncio,
    p_candidatos: candidatos,
  });
  if (error) return { ok: false, erro: "Não deu para usar o saldo agora. Tente de novo em instantes." };
  const r = (data ?? {}) as { ok?: boolean; erro?: string };
  if (!r.ok) return { ok: false, erro: r.erro ?? "Não deu para usar o saldo agora." };
  // a verba da campanha geral sobe com o pacote novo
  after(() => cuidarDosImpulsos().catch(() => {}));
  refresh();
  return { ok: true };
}
