"use client";

import { useEffect, useRef } from "react";
import { marcarVisitasVistas, registrarVisita, type OndeVisita } from "@/lib/acoes/visitas";

/** Abrir o mesmo perfil de novo em 30 minutos não conta outra vez. */
const INTERVALO = 30 * 60 * 1000;

/**
 * Conta a visita para "Quem viu seu perfil" depois que a página aparece (o prefetch dos links não
 * conta). Na Caixa, a ficha pode estar escondida (celular com a lista aberta): só conta se aparece.
 */
export function RegistrarVisitaPerfil({
  perfilId,
  onde,
  anuncioId = null,
}: {
  perfilId: string;
  onde: OndeVisita;
  anuncioId?: string | null;
}) {
  const marca = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = marca.current;
    if (el && el.parentElement && !el.parentElement.checkVisibility?.()) return;
    const chave = `publike_visita:${onde}:${perfilId}:${anuncioId ?? ""}`;
    try {
      const antes = Number(sessionStorage.getItem(chave) ?? 0);
      if (Date.now() - antes < INTERVALO) return;
      sessionStorage.setItem(chave, String(Date.now()));
    } catch {}
    registrarVisita(perfilId, onde, anuncioId).catch(() => {});
  }, [perfilId, onde, anuncioId]);
  return <span ref={marca} hidden />;
}

/** Abriu "Quem viu seu perfil": as visitas deixam de ser novas. */
export function MarcarVisitasVistas() {
  useEffect(() => {
    marcarVisitasVistas().catch(() => {});
  }, []);
  return null;
}
