// "‹ Voltar para …" (src/components/voltar.tsx): a trilha das telas desta aba e o script do <head> que guarda o lugar
// do botão antes de pintar (17/11/2026, "deixe a performance invejável"). O botão só aparece depois do React (ele lê a
// trilha no sessionStorage) e empurrava a página 52 px para baixo em toda abertura com tela anterior (ao recarregar,
// por exemplo): o pulo que o Admin › Velocidade mostrou no painel. Fica fora do componente ("use client") para o
// layout, que roda no servidor, ler o texto do script.

/** A trilha das telas desta aba (sessionStorage). */
export const CHAVE_TRILHA = "publike_trilha";

/**
 * Marca o <html> com `data-tem-voltar` quando o botão vai aparecer (a mesma conta do componente: a tela anterior
 * depois de registrar esta) e com `data-tem-voltar="painel"` quando vai aparecer só o "‹ Painel" do celular. O
 * globals.css guarda a altura do botão no lugar dele.
 */
export const SCRIPT_VOLTAR = `(function(){try{var c=location.pathname;if(c==="/")return;var t=JSON.parse(sessionStorage.getItem("${CHAVE_TRILHA}")||"[]");if(!Array.isArray(t))return;var n=t.length,u=t[n-1],p=t[n-2],a=u&&u.caminho===c?t[n-2]:p&&p.caminho===c?t[n-3]:t[n-1];if(a)document.documentElement.setAttribute("data-tem-voltar","");else if(c.indexOf("/painel/")===0)document.documentElement.setAttribute("data-tem-voltar","painel")}catch(e){}})();`;
