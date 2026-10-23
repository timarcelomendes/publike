"use client";

import { useEffect } from "react";
import { contarAbertura } from "@/lib/acoes/aberturas";

/** Abrir o mesmo anúncio de novo na mesma aba, em 30 minutos, não chama o servidor outra vez. */
const INTERVALO = 30 * 60 * 1000;

/** Conta a abertura do anúncio para "Mais relevantes", depois que a página aparece (o prefetch não conta). */
export function ContarAbertura({ anuncioId }: { anuncioId: string }) {
  useEffect(() => {
    const chave = `publike_abertura:${anuncioId}`;
    try {
      if (Date.now() - Number(sessionStorage.getItem(chave) ?? 0) < INTERVALO) return;
      sessionStorage.setItem(chave, String(Date.now()));
    } catch {}
    contarAbertura(anuncioId).catch(() => {});
  }, [anuncioId]);
  return null;
}
