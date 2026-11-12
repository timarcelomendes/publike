"use client";

import { useEffect } from "react";
import { contarVisitaDoImpulso } from "@/lib/acoes/impulso";
import { CAMPANHA_DO_IMPULSO } from "@/lib/impulso";

/**
 * Quem chegou pelo anúncio do impulso (claude/plano-impulsionar-vaga.md): o endereço traz utm_campaign=impulso e o
 * código do anúncio. Conta a visita para o relatório de quem pagou (uma por dia, com um código aleatório do navegador,
 * sem nada da pessoa) e guarda o cookie que liga a curtida ao anúncio.
 */
export function ContarImpulso({ anuncioId }: { anuncioId: string }) {
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("utm_campaign") !== CAMPANHA_DO_IMPULSO) return;
    const codigo = (p.get("utm_content") ?? "").toLowerCase();
    if (!/^[a-z0-9]{6,20}$/.test(codigo)) return;
    let visitante = "";
    try {
      visitante = localStorage.getItem("publike_visitante") ?? "";
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(visitante)) {
        visitante = crypto.randomUUID().replace(/-/g, "");
        localStorage.setItem("publike_visitante", visitante);
      }
    } catch {
      visitante = crypto.randomUUID().replace(/-/g, "");
    }
    contarVisitaDoImpulso(codigo, anuncioId, visitante).catch(() => {});
  }, [anuncioId]);
  return null;
}
