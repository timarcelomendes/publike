"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

// A largura do topo, do "Voltar" e do rodapé (11/11/2026). Antes vinha de body:has(...) olhando a página, mas o Next
// guarda escondida a página de onde se saiu (e o topo ficava com a largura dela) e o Safari não aceitou o :has com
// :not que tentou contornar isso. Agora o <html> é marcado:
// - data-largura="painel": pelo endereço (/painel e o que vem embaixo), no <head> (SCRIPT_LARGURA, em
//   lib/largura-da-pagina.ts: fora deste arquivo de cliente) e a cada troca de endereço;
// - data-pagina-larga: pela página larga que está na tela (o Início de quem entrou na conta), com MarcarPaginaLarga.

export function LarguraDaPagina() {
  const caminho = usePathname();
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-hidratado", "");
    if (caminho === "/painel" || caminho.startsWith("/painel/") || caminho === "/talentos") {
      document.documentElement.setAttribute("data-largura", "painel");
    } else document.documentElement.removeAttribute("data-largura");
  }, [caminho]);
  return null;
}

/**
 * Dentro da página larga: marca o html enquanto ela está na tela (o efeito sai quando o Next a esconde). Antes de o
 * React chegar, o topo usa o body:has([data-pagina-larga]) (html sem data-hidratado): no HTML do servidor só há a
 * página da vez. Sem <script> aqui: o React reclama de script desenhado num componente.
 */
export function MarcarPaginaLarga() {
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-pagina-larga", "");
    return () => document.documentElement.removeAttribute("data-pagina-larga");
  }, []);
  return null;
}
