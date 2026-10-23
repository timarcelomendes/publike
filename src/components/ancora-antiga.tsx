"use client";

import { useEffect } from "react";

// A página de privacidade era uma só, com os cookies e as regras dentro (#cookies, #regras). Os links
// antigos (e-mails e avisos já enviados) chegam com a âncora: aqui vão para a página nova.
const NOVAS: Record<string, string> = { "#cookies": "/cookies", "#regras": "/regras" };

export function AncoraAntiga() {
  useEffect(() => {
    const destino = NOVAS[window.location.hash];
    if (destino) window.location.replace(destino);
  }, []);
  return null;
}
