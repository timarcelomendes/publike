// Google Ads: o código do Google (gtag.js) só carrega para quem tocou em "Aceitar" no aviso de cookies
// (ou ligou depois, na política de privacidade). Sem isso, nada vai para o Google.
// As conversões são os momentos que valem para a campanha. A ação no servidor marca o momento num
// cookie curto (publike_conversao, só o nome do momento, sem nada da pessoa), e o navegador avisa o
// Google e apaga o cookie (google-ads.tsx). Sem aceite, o navegador só apaga.

export const GOOGLE_ADS_ID = "AW-18511888426";

/** Momento → rótulo da conversão no Google Ads (Metas › Conversões). */
export const CONVERSOES = {
  cadastro: "9pkPCP6Q7KYdEKqAlPtE",
  curriculo: "MVLjCIGR7KYdEKqAlPtE",
  vaga: "GIADCNSW7KYdEKqAlPtE",
  candidatura: "Bp4JCNeW7KYdEKqAlPtE",
} as const;

export type Conversao = keyof typeof CONVERSOES;

export const COOKIE_CONVERSAO = "publike_conversao";

/** A escolha do aviso de cookies sobre a propaganda, guardada no navegador: "sim" ou "nao". */
export const CHAVE_PROPAGANDA = "publike_cookies_propaganda";
/** Avisa o código do Google que a escolha mudou. */
export const EVENTO_PROPAGANDA = "publike:propaganda";

export function lerConversoes(valor: string | undefined | null): Conversao[] {
  if (!valor) return [];
  return decodeURIComponent(valor)
    .split(",")
    .filter((c): c is Conversao => Object.hasOwn(CONVERSOES, c));
}
