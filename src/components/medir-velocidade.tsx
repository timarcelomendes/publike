"use client";

import { useParams, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { chaveDaPagina } from "@/lib/tempo-na-pagina";

// A velocidade de verdade de quem abre o site (migração 20270709120000; src/lib/velocidade-cliente.ts): mede a página
// aberta (a primeira, que é a que o Google conta) e manda para Admin › Velocidade, sem saber quem. A biblioteca só
// baixa depois de a página terminar de carregar, quando o navegador está à toa: ela não pesa na conta que mede.

export function MedirVelocidade() {
  const caminho = usePathname();
  const params = useParams();
  // a página do primeiro carregamento (as trocas de página dentro do site não contam: o Google também não conta)
  const primeira = useRef(chaveDaPagina(caminho, params));

  useEffect(() => {
    const pagina = primeira.current;
    if (!pagina) return;
    let cancelado = false;
    const comecar = () => {
      if (cancelado) return;
      void import("@/lib/velocidade-cliente").then((m) => m.medirVelocidade(pagina)).catch(() => {});
    };
    const depoisDoLoad = () => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(comecar, { timeout: 4000 });
      else setTimeout(comecar, 1500);
    };
    if (document.readyState === "complete") depoisDoLoad();
    else window.addEventListener("load", depoisDoLoad, { once: true });
    return () => {
      cancelado = true;
      window.removeEventListener("load", depoisDoLoad);
    };
  }, []);

  return null;
}
