// O aviso de cookies e as boas-vindas da primeira visita: as chaves do aparelho e o script do <head> (17/11/2026).
// Fica fora dos componentes ("use client") para o layout, que roda no servidor, ler o texto do script.

export const CHAVE_AVISO_COOKIES = "publike_aviso_cookies";
export const VERSAO_AVISO_COOKIES = "1";
export const CHAVE_BOAS_VINDAS = "publike_boas_vindas";
export const VERSAO_BOAS_VINDAS = "1";
/** "Agora não" nas perguntas da primeira visita da home (sessionStorage: volta na próxima visita). */
export const CHAVE_PERGUNTA_ADIADA = "publike_onde_mora_depois";

// Páginas onde a pessoa já sabe o que veio fazer (ou que são da equipe): sem as boas-vindas. As listas de vagas
// (/vagas/goiania/alimentacao) e as páginas para empresas (/empresas/fim-da-6x1) são a entrada dos anúncios
// do Google: a página aparece sem nada por cima.
export const SEM_BOAS_VINDAS =
  /^\/(admin|auth|avisos|entrar|perfil|painel|publicar|anuncio\/|email|versao|vagas\/|empresas)/;

/**
 * O aviso de cookies já vem no HTML do servidor (montado só depois do JavaScript, ele era o "maior conteúdo" da página
 * de vaga no celular e atrasava o LCP em quase 1 s). Este script roda no <head>, antes de pintar, e marca no <html>
 * quem não deve vê-lo agora: quem já escolheu (data-ck-visto) e quem ainda vai ver as boas-vindas da primeira visita
 * (data-bv-pendente). O globals.css esconde o aviso com essas marcas; depois do React, o componente decide.
 * A pergunta da primeira visita da home ("O que você quer fazer no Publike?") também vem no HTML (montada só depois do
 * JavaScript, era o LCP da home no celular): quem já tocou em "Agora não" nesta visita fica com data-intencao-adiada.
 */
export const SCRIPT_AVISO_COOKIES = `(function(){var d=document.documentElement;try{if(localStorage.getItem("${CHAVE_AVISO_COOKIES}")==="${VERSAO_AVISO_COOKIES}")d.setAttribute("data-ck-visto","");if(!${SEM_BOAS_VINDAS.toString()}.test(location.pathname)&&localStorage.getItem("${CHAVE_BOAS_VINDAS}")!=="${VERSAO_BOAS_VINDAS}")d.setAttribute("data-bv-pendente","");if(sessionStorage.getItem("${CHAVE_PERGUNTA_ADIADA}")==="1")d.setAttribute("data-intencao-adiada","")}catch(e){}})();`;
