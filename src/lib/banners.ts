// Banners: um aviso em janela (popup) criado no admin, para ver vagas novas, uma busca de vagas, uma
// página do site ou compartilhar o Publike, nas páginas escolhidas (a inicial, por padrão), depois
// de alguns segundos. Um por vez, uma vez por navegador (o cookie guarda os que já apareceram).
// Banco: migrações 20261029120000_banners.sql e 20261117120000_banners_paginas_e_atraso.sql.

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
  // o visitante entra em "pessoas" ou "empresas" pela resposta de "O que você quer fazer"
  pessoas: "Quem procura trabalho ou presta serviço (conta de pessoa ou visitante que respondeu isso)",
  empresas: "Quem contrata (comércio, empresa, agência ou visitante que procura funcionário)",
} as const;
export type PublicoBanner = keyof typeof PUBLICOS_BANNER;

/** Onde o banner pode abrir. */
export const PAGINAS_BANNER = {
  inicio: "Página inicial",
  descobrir: "Listas de vagas e serviços (Descobrir)",
  anuncio: "Página de uma vaga ou serviço",
  painel: "Painel",
  perfil: "Meu perfil",
  noticias: "Notícias",
  talentos: "Talentos",
} as const;
export type PaginaBanner = keyof typeof PAGINAS_BANNER;

/** A página do banner pelo endereço; null: o banner nunca abre aqui. A inicial com busca por palavra não conta. */
export function paginaDoBanner(caminho: string, temBusca: boolean): PaginaBanner | null {
  if (caminho === "/") return temBusca ? null : "inicio";
  const dentro = (base: string) => caminho === base || caminho.startsWith(`${base}/`);
  if (dentro("/descobrir") || dentro("/vagas") || dentro("/servicos")) return "descobrir";
  if (dentro("/anuncio")) return "anuncio";
  if (dentro("/painel")) return "painel";
  if (dentro("/perfil")) return "perfil";
  if (dentro("/noticias")) return "noticias";
  if (dentro("/talentos")) return "talentos";
  return null;
}

/** Quanto o banner espera depois de abrir a página, quando o banco não diz (os antigos: 3 s). */
export const ATRASO_PADRAO = 3;

/** O banner como o site mostra. */
export type BannerNoAr = {
  id: string;
  titulo: string;
  texto: string | null;
  botao: string;
  acao: AcaoBanner;
  link: string | null;
  /** null: só uma vez; N: de novo a cada N dias, até a pessoa tocar no botão */
  repetir_dias: number | null;
  /** onde pode abrir */
  paginas: PaginaBanner[];
  /** segundos depois de abrir a página */
  atraso: number;
};

/**
 * Os banners que este navegador já viu: "id~dia~clicou" separados por vírgula (o dia contado desde
 * 1970, os 20 mais recentes). Quem tem conta também fica marcado no banco (vale em qualquer aparelho).
 */
export const COOKIE_BANNERS = "publike_banners";
const MAXIMO_VISTOS = 20;
const UUID_SIMPLES = /^[0-9a-f-]{36}$/i;

export type Visto = { dia: number; clicou: boolean };

/** O dia de hoje (contado desde 1970, em Brasília). */
export function diaDeHoje(agora: number) {
  return Math.floor((agora - 3 * 3600 * 1000) / (24 * 3600 * 1000));
}

export function lerBannersVistos(valor: string | undefined | null) {
  const vistos = new Map<string, Visto>();
  for (const parte of (valor ?? "").split(",")) {
    const [id, dia, clicou] = parte.split("~");
    if (!UUID_SIMPLES.test(id ?? "")) continue;
    // o formato antigo (só o id) conta como visto hoje, sem clique
    vistos.set(id, { dia: Number(dia) || Number.MAX_SAFE_INTEGER, clicou: clicou === "1" });
  }
  return vistos;
}

/** O cookie com o banner visto hoje (ou clicado); o mais antigo sai quando passa de 20. */
export function valorComBannerVisto(valor: string | undefined | null, id: string, dia: number, clicou: boolean) {
  const vistos = lerBannersVistos(valor);
  const antes = vistos.get(id);
  vistos.delete(id);
  vistos.set(id, { dia, clicou: clicou || Boolean(antes?.clicou) });
  return [...vistos]
    .slice(-MAXIMO_VISTOS)
    .map(([x, v]) => `${x}~${v.dia === Number.MAX_SAFE_INTEGER ? dia : v.dia}~${v.clicou ? 1 : 0}`)
    .join(",");
}

/**
 * Pode mostrar de novo? Nunca visto: sim. Visto com "só uma vez" (`repetirDias` null) ou já clicado:
 * não. Com repetição: quando passaram os dias.
 */
export function podeMostrar(repetirDias: number | null, visto: Visto | undefined, hoje: number) {
  if (!visto) return true;
  if (repetirDias === null || visto.clicou) return false;
  return hoje - visto.dia >= repetirDias;
}

/** Junta o que o navegador e a conta guardaram: o dia mais recente e se clicou em algum. */
export function juntarVistos(a: Visto | undefined, b: Visto | undefined): Visto | undefined {
  if (!a || !b) return a ?? b;
  const dias = [a.dia, b.dia].filter((d) => d !== Number.MAX_SAFE_INTEGER);
  return { dia: dias.length ? Math.max(...dias) : Number.MAX_SAFE_INTEGER, clicou: a.clicou || b.clicou };
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
