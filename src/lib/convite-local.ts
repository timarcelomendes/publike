// O convite da localização ("Ver primeiro o que está perto de você?") e a sugestão do bairro ("Você está no Setor
// Bueno. É onde você mora?"), no alto da home de quem entrou e de Talentos (src/components/local/).
//
// Decididos no servidor, pelos cookies (17/11/2026, "deixe a performance invejável"): antes, o navegador perguntava a
// permissão depois de abrir e o convite aparecia no meio da página, empurrando a linha do tempo para baixo (era o
// maior pulo da home de quem entrou no Admin › Velocidade: de 0,3 a 0,5 de CLS no celular). Agora ele vem no HTML,
// e o navegador só o tira (quando a permissão mudou desde a última vez), nunca o põe. Daqui o servidor e o navegador
// leem os mesmos nomes (nada de constante de arquivo "use client" no servidor).

/** "Agora não" no convite: some por 30 dias (o cookie vence sozinho). */
export const COOKIE_CONVITE_LOCAL_ADIADO = "publike_convite_local_adiado";
/** O X ou o "Não, moro em outro" na sugestão do bairro: some por 30 dias. */
export const COOKIE_BAIRRO_ADIADO = "publike_bairro_adiado";
/** A última permissão de localização que o navegador disse (granted, denied ou prompt). */
export const COOKIE_PERMISSAO_LOCAL = "publike_permissao_local";
/**
 * O bairro de onde a pessoa estava (da posição guardada ou da permissão já dada), para a próxima abertura perguntar
 * "É onde você mora?" já no HTML. Só o nome do bairro, por um dia.
 */
export const COOKIE_BAIRRO_PERTO = "publike_bairro_perto";

export const TRINTA_DIAS_S = 30 * 24 * 3600;
export const UM_DIA_S = 24 * 3600;

/** O que o servidor põe no HTML: o convite, a pergunta do bairro ou nada. */
export type InicioDoConvite = { tipo: "nada" } | { tipo: "convite" } | { tipo: "bairro"; bairro: string };

/** As permissões que o navegador pode dar (o que vale guardar). */
export type PermissaoLocal = "granted" | "denied" | "prompt";

export function lerPermissao(valor: string | undefined | null): PermissaoLocal | null {
  return valor === "granted" || valor === "denied" || valor === "prompt" ? valor : null;
}

/** O nome do bairro do cookie: só letras, números, espaço e pontuação de nome de bairro (até 80). */
export function lerBairroPerto(valor: string | undefined | null): string | null {
  if (!valor) return null;
  let nome: string;
  try {
    nome = decodeURIComponent(valor).trim();
  } catch {
    return null;
  }
  return nome && nome.length <= 80 && /^[\p{L}\p{N} .,'ºª()-]+$/u.test(nome) ? nome : null;
}
