"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

// A largura do topo, do "Voltar" e do rodapé vem do endereço (11/11/2026): no painel, 96rem (a largura dele); no
// Início, 80rem; no resto, a do site. Antes vinha de body:has(...) olhando a página, mas o Next guarda a página de
// onde se saiu escondida na árvore, e o topo ficava com a largura da página anterior. Fica em html[data-largura].

function largura(caminho: string) {
  if (caminho === "/painel" || caminho.startsWith("/painel/")) return "painel";
  if (caminho === "/") return "larga";
  return null;
}

/** marca o html antes de pintar a primeira vez (no <head>), para o topo não pular */
export const SCRIPT_LARGURA = `(function(){var c=location.pathname;var l=c==="/painel"||c.indexOf("/painel/")===0?"painel":c==="/"?"larga":"";if(l)document.documentElement.setAttribute("data-largura",l)})()`;

export function LarguraDaPagina() {
  const caminho = usePathname();
  useLayoutEffect(() => {
    const l = largura(caminho);
    if (l) document.documentElement.setAttribute("data-largura", l);
    else document.documentElement.removeAttribute("data-largura");
  }, [caminho]);
  return null;
}
