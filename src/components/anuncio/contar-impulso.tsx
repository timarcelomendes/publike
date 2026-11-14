"use client";

import { useEffect } from "react";
import { contarVisitaDoImpulso } from "@/lib/acoes/impulso";
import { CAMPANHA_DO_IMPULSO, PARAMETRO_DO_DESTAQUE } from "@/lib/impulso";

const CODIGO = /^[a-z0-9]{6,20}$/;

/** O código aleatório deste navegador (sem nada da pessoa), o mesmo em todas as visitas. */
export function visitanteDoNavegador(): string {
  try {
    const salvo = localStorage.getItem("publike_visitante") ?? "";
    if (/^[A-Za-z0-9_-]{16,64}$/.test(salvo)) return salvo;
    const novo = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem("publike_visitante", novo);
    return novo;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

/**
 * A visita que veio do quadro "Vagas impulsionadas na região" (migração 20270519120000), antes de curtir direto do
 * cartão: a curtida que vem logo depois conta para quem impulsionou. Nunca falha (sem rede, a curtida segue sem contar).
 */
export async function contarVisitaDoQuadro(codigo: string, anuncioId: string): Promise<void> {
  if (!CODIGO.test(codigo)) return;
  await contarVisitaDoImpulso(codigo, anuncioId, visitanteDoNavegador(), "quadro").catch(() => {});
}

/**
 * Quem chegou pelo impulso (claude/plano-impulsionar-vaga.md e claude/plano-nova-venda-do-impulso.md): o anúncio no
 * Google traz utm_campaign=impulso e o código no utm_content (o link da vaga embaixo do anúncio geral, também
 * utm_term=sitelink); o cartão do quadro do Publike traz ?destaque=<código>. Conta a visita para o relatório de quem
 * impulsionou (uma por dia, com um código aleatório do navegador, sem nada da pessoa) e guarda o cookie que liga a
 * curtida ao impulso. O ?destaque sai do endereço depois de contar, para o link copiado não contar de novo.
 */
export function ContarImpulso({ anuncioId }: { anuncioId: string }) {
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const doQuadro = (p.get(PARAMETRO_DO_DESTAQUE) ?? "").toLowerCase();
    const doGoogle = p.get("utm_campaign") === CAMPANHA_DO_IMPULSO ? (p.get("utm_content") ?? "").toLowerCase() : "";
    const codigo = CODIGO.test(doQuadro) ? doQuadro : doGoogle;
    if (!CODIGO.test(codigo)) return;
    const origem = codigo === doQuadro ? "quadro" : p.get("utm_term") === "sitelink" ? "link" : "google";
    contarVisitaDoImpulso(codigo, anuncioId, visitanteDoNavegador(), origem).catch(() => {});
    if (origem === "quadro") {
      const url = new URL(window.location.href);
      url.searchParams.delete(PARAMETRO_DO_DESTAQUE);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }, [anuncioId]);
  return null;
}
