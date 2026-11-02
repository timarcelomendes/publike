"use client";

import { useEffect } from "react";
import { COOKIE_NOVIDADES } from "@/lib/novidades";

/** Abriu /novidades: guarda o dia da mais nova, para o ponto do menu da conta sumir (por um ano). */
export function MarcarNovidadesVistas({ quando }: { quando: string | null }) {
  useEffect(() => {
    if (!quando) return;
    document.cookie = `${COOKIE_NOVIDADES}=${encodeURIComponent(quando)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [quando]);
  return null;
}
