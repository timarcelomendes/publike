"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

// A largura do topo, do "Voltar" e do rodapé (11/11/2026). Antes vinha de body:has(...) olhando a página, mas o Next
// guarda escondida a página de onde se saiu (e o topo ficava com a largura dela) e o Safari não aceitou o :has com
// :not que tentou contornar isso. Agora o <html> é marcado:
// - data-largura="painel": pelo endereço (/painel e o que vem embaixo), no <head> e a cada troca de endereço;
// - data-pagina-larga: pela página larga que está na tela (o Início de quem entrou na conta), com MarcarPaginaLarga.

/** marca o html antes de pintar a primeira vez (no <head>), para o topo não pular */
export const SCRIPT_LARGURA = `(function(){var c=location.pathname;if(c==="/painel"||c.indexOf("/painel/")===0)document.documentElement.setAttribute("data-largura","painel")})()`;

export function LarguraDaPagina() {
  const caminho = usePathname();
  useLayoutEffect(() => {
    if (caminho === "/painel" || caminho.startsWith("/painel/")) {
      document.documentElement.setAttribute("data-largura", "painel");
    } else document.documentElement.removeAttribute("data-largura");
  }, [caminho]);
  return null;
}

/**
 * Dentro da página larga: marca o html enquanto ela está na tela (o efeito sai quando o Next a esconde). O script
 * marca já no HTML do servidor, antes de o React chegar.
 */
export function MarcarPaginaLarga() {
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-pagina-larga", "");
    return () => document.documentElement.removeAttribute("data-pagina-larga");
  }, []);
  return (
    <script
      dangerouslySetInnerHTML={{ __html: `document.documentElement.setAttribute("data-pagina-larga","")` }}
    />
  );
}
