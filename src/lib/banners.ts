// Banners da página inicial: um aviso em janela (popup) criado no admin, para ver vagas novas, uma
// busca de vagas, uma página do site ou compartilhar o Publike. Um por vez, uma vez por navegador
// (o cookie guarda os que já apareceram). Banco: migração 20261029120000_banners.sql.

export const ACOES_BANNER = {
  novas: "Ver as vagas novas",
  busca: "Ver uma busca de vagas",
  link: "Abrir uma página do site",
  compartilhar: "Compartilhar o Publike",
} as const;
export type AcaoBanner = keyof typeof ACOES_BANNER;

export const PUBLICOS_BANNER = {
  todos: "Todo mundo",
  visitantes: "Quem ainda não tem conta",
  pessoas: "Quem procura trabalho ou presta serviço (conta de pessoa)",
  empresas: "Quem contrata (comércio, empresa e agência)",
} as const;
export type PublicoBanner = keyof typeof PUBLICOS_BANNER;

/** O banner como o site mostra. */
export type BannerNoAr = {
  id: string;
  titulo: string;
  texto: string | null;
  botao: string;
  acao: AcaoBanner;
  link: string | null;
};

/** Os banners que este navegador já viu (ids separados por vírgula; os 20 mais recentes). */
export const COOKIE_BANNERS = "publike_banners";
const MAXIMO_VISTOS = 20;
const UUID_SIMPLES = /^[0-9a-f-]{36}$/i;

export function lerBannersVistos(valor: string | undefined | null) {
  return new Set((valor ?? "").split(",").filter((id) => UUID_SIMPLES.test(id)));
}

/** O cookie com mais um banner visto (o mais antigo sai quando passa de 20). */
export function valorComBannerVisto(valor: string | undefined | null, id: string) {
  const ids = [...lerBannersVistos(valor)].filter((x) => x !== id);
  return [...ids, id].slice(-MAXIMO_VISTOS).join(",");
}

/** As vagas novas (a lista "Novas" da página inicial). */
export const LINK_VAGAS_NOVAS = "/?tipo=vaga&ordem=recentes";

/** Uma busca de vagas pela palavra ("garçom"). */
export function linkDaBusca(palavra: string) {
  return `/?${new URLSearchParams({ tipo: "vaga", q: palavra.trim() })}`;
}

/** A palavra de uma busca salva no banner (para editar). */
export function palavraDoLink(link: string | null) {
  if (!link) return "";
  try {
    return new URL(link, "https://publike.local").searchParams.get("q") ?? "";
  } catch {
    return "";
  }
}

/** Só caminho do próprio site ("/vagas/goiania"), nunca outro endereço ("//", "/\\" ou "https://"). */
export function caminhoDoSite(valor: string) {
  const v = valor.trim();
  return /^\/([^/\\].*)?$/.test(v) && v.length <= 300 && !/\s/.test(v) ? v : null;
}

/** O link que vai para quem recebe o compartilhamento (conta como campanha "compartilhar:banner"). */
export const LINK_COMPARTILHAR = "/?utm_source=compartilhar&utm_campaign=banner";
