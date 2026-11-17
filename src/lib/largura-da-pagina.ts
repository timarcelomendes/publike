// O script do <head> que marca a largura do painel (components/largura-da-pagina.tsx explica as marcas do <html>).
//
// Fica fora do arquivo "use client" (17/11/2026): uma constante que o layout (servidor) importa de um módulo de cliente
// vira, no RSC, uma referência a esse módulo. No navegador, este <script> do <head> esperava o JavaScript do módulo
// chegar; o React parava no meio do <head>, recomeçava dali e se perdia: às vezes (de 5% a 25% das aberturas no teste,
// mais com o celular ocupado) dava o erro #418 no <body> e a página inteira era desenhada de novo no navegador.
// O CI confere que isso não volta (scripts/ci/constantes-de-cliente.mjs).

/** marca o html antes de pintar a primeira vez (no <head>), para o topo não pular */
// Talentos (/talentos) tem a largura do painel desde 16/11/2026: é uma tela de trabalho de quem contrata
export const SCRIPT_LARGURA = `(function(){var c=location.pathname;if(c==="/painel"||c.indexOf("/painel/")===0||c==="/talentos")document.documentElement.setAttribute("data-largura","painel")})()`;
