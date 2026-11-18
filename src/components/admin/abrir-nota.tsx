"use client";

import { useEffect } from "react";

/**
 * A Documentação técnica: o link para uma nota (#nota-...) abre a nota fechada e leva até ela, ao abrir a página e ao
 * tocar num link da própria página ("Mudou por último", o índice das seções).
 */
export function AbrirNotaDoEndereco() {
  useEffect(() => {
    const abrir = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const alvo = id ? document.getElementById(id) : null;
      if (alvo instanceof HTMLDetailsElement) alvo.open = true;
      alvo?.scrollIntoView({ block: "start" });
    };
    abrir();
    window.addEventListener("hashchange", abrir);
    return () => window.removeEventListener("hashchange", abrir);
  }, []);
  return null;
}
