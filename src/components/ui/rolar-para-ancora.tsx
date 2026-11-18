"use client";

import { useEffect } from "react";

/**
 * Leva até a âncora do endereço (#notificacoes) quando a parte da página chega depois, dentro de um Suspense: o Next
 * rola para a âncora ao abrir a página, mas nessa hora a parte ainda não existe (18/11/2026: o aviso do sino que leva a
 * Preferências › Notificações, onde fica o WhatsApp). Vai no fim do que chega, para rodar com as partes já na página.
 */
export function RolarParaAncora() {
  useEffect(() => {
    let id = "";
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);
  return null;
}
