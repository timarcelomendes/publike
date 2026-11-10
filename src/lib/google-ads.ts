// Google Ads: o código do Google (gtag.js) só carrega para quem tocou em "Aceitar" no aviso de cookies
// (ou ligou depois, na página Cookies). Sem isso, nada vai para o Google.
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

/**
 * As páginas abertas por um link com segredo (claude/plano-seguranca.md, item 6): o pedaço depois de /acesso/,
 * /cliente/, /convite/… é a chave de quem recebeu o link (entrar na conta, ver currículos, aceitar um convite).
 */
export const ROTAS_COM_SEGREDO = /^\/(acesso|cliente|candidatura|convite|equipe|finalistas|indicacao|relatorio)\/[^/?#]+/;

/** Do endereço, só o que a campanha precisa saber de onde a pessoa veio. */
const PARAMETROS_DA_CAMPANHA = new Set([
  "gclid",
  "gbraid",
  "wbraid",
  "gad_source",
  "gad_campaignid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
]);

/**
 * O endereço que pode ir para o Google: sem o segredo dos links (/convite/:token) e, das buscas (?), só os
 * parâmetros da campanha. Endereço de outro site ou inválido: só a origem.
 */
export function enderecoParaOGoogle(endereco: string, origem: string): string {
  let url: URL;
  try {
    url = new URL(endereco, origem);
  } catch {
    return origem;
  }
  if (url.origin !== new URL(origem).origin) return url.origin;
  const caminho = url.pathname.replace(ROTAS_COM_SEGREDO, (_tudo, rota: string) => `/${rota}/:token`);
  const busca = new URLSearchParams();
  for (const [chave, valor] of url.searchParams) if (PARAMETROS_DA_CAMPANHA.has(chave)) busca.append(chave, valor);
  const q = busca.toString();
  return `${url.origin}${caminho}${q ? `?${q}` : ""}`;
}
