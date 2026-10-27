// Tema do site: claro (o padrão), automático (segue o celular/computador) ou escuro.
// A escolha fica no aparelho (localStorage). O SCRIPT_TEMA roda no <head>, antes de pintar
// a página, e marca <html data-tema="...">: as cores do globals.css seguem essa marca.
export type Tema = "claro" | "auto" | "escuro";

export const TEMAS: Tema[] = ["claro", "auto", "escuro"];
export const CHAVE_TEMA = "publike_tema";
export const EVENTO_TEMA = "publike:tema";
/** cor da barra do navegador no celular, em cada tema: a mesma do topo do site (surface-200) */
export const COR_BARRA = { claro: "#ffffff", escuro: "#221d18" } as const;

// no escuro, também pinta a barra do celular assim que a página abre (sem esperar o botão do tema)
export const SCRIPT_TEMA = `(function(){var t;try{t=localStorage.getItem("${CHAVE_TEMA}")}catch(e){}t=t==="escuro"||t==="auto"?t:"claro";document.documentElement.dataset.tema=t;if(t==="escuro"||(t==="auto"&&matchMedia("(prefers-color-scheme: dark)").matches))document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content","${COR_BARRA.escuro}")})})})();`;
