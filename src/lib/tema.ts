// Tema do site: claro (o padrão), automático (segue o celular/computador) ou escuro.
// A escolha fica no aparelho (localStorage). O SCRIPT_TEMA roda no <head>, antes de pintar
// a página, e marca <html data-tema="...">: as cores do globals.css seguem essa marca.
export type Tema = "claro" | "auto" | "escuro";

export const TEMAS: Tema[] = ["claro", "auto", "escuro"];
export const CHAVE_TEMA = "publike_tema";
export const EVENTO_TEMA = "publike:tema";
/** cor da barra do navegador no celular, em cada tema */
export const COR_BARRA = { claro: "#fbf7ef", escuro: "#17130f" } as const;

export const SCRIPT_TEMA = `(function(){var t;try{t=localStorage.getItem("${CHAVE_TEMA}")}catch(e){}document.documentElement.dataset.tema=t==="escuro"||t==="auto"?t:"claro"})();`;
