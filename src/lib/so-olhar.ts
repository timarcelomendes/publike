// "Ver como pessoa · só olhar": empresa, comércio e agência veem o Publike como quem procura trabalho,
// sem agir (curtir, salvar, conectar e escrever ficam desligados). Liga no Trocar do painel.

/** Liga o "só olhar" (vale enquanto o navegador estiver aberto). */
export const COOKIE_SO_OLHAR = "publike_so_olhar";

/** As páginas que uma pessoa vê: a home, os anúncios, os perfis e recados públicos e as listas. */
export function paginaDePessoa(caminho: string) {
  return (
    caminho === "/" ||
    /^\/(anuncio|recado|empresas|profissionais|servicos|vagas|descobrir|talentos)(\/|$)/.test(caminho) ||
    /^\/perfil\/(?!curriculo$)[^/]+$/.test(caminho)
  );
}

/** Abrir o painel, o próprio perfil ou o Publicar é voltar a agir pela conta: o "só olhar" desliga. */
export function voltaParaAConta(caminho: string) {
  return /^\/(painel|publicar)(\/|$)/.test(caminho) || caminho === "/perfil" || caminho === "/perfil/curriculo";
}

/** "a empresa", "o comércio", "a agência" (no "Voltar para ..."). */
export function nomeDaConta(tipo: string | null | undefined) {
  return tipo === "comercio" ? "o comércio" : tipo === "agencia" ? "a agência" : "a empresa";
}
