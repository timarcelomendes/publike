import { CENTRO_GOIANIA, REGIAO } from "./config";
import { CIDADES, emLista, type Cidade } from "./constantes";

export { emLista };

/**
 * Onde o Publike funciona: as praças. Hoje é uma só (Goiânia e região). Para chegar a outra
 * cidade, ela entra aqui (com as cidades em volta, o centro e a caixa do mapa) e os bairros em
 * `bairros.ts`; no banco, a caixa da região aparece nas funções que conferem o ponto no mapa.
 * Os textos de "onde o Publike funciona" saem daqui (`ONDE_FUNCIONA`) e os de "perto de você",
 * da cidade de quem está vendo (`cidadeDaVisita`, em `servidor/cidade.ts`).
 */
export type Ponto = { lat: number; lng: number };
export type Caixa = { latMin: number; latMax: number; lngMin: number; lngMax: number };

export type Praca = {
  /** como aparece nos textos: "Goiânia e região" */
  nome: string;
  /** o nome oficial da área, para o Google: "Região Metropolitana de Goiânia" */
  nomeOficial: string;
  /** a cidade que dá nome à praça: a de quem ainda não disse onde mora */
  cidade: Cidade;
  /** sigla do estado (confere com o endereço de internet de quem visita) */
  uf: string;
  cidades: readonly Cidade[];
  /** as maiores cidades em volta (rodapé, páginas para o Google, textos de "onde funciona") */
  vizinhas: readonly Cidade[];
  centro: Ponto;
  caixa: Caixa;
};

export const PRACAS: readonly Praca[] = [
  {
    nome: "Goiânia e região",
    nomeOficial: "Região Metropolitana de Goiânia",
    cidade: "Goiânia",
    uf: "GO",
    cidades: CIDADES,
    vizinhas: ["Aparecida de Goiânia", "Senador Canedo", "Trindade", "Goianira"],
    centro: CENTRO_GOIANIA,
    caixa: REGIAO,
  },
];

/** A praça de quem ainda não disse onde mora (e a dos textos para o Google). */
export const PRACA_PADRAO = PRACAS[0];

/** Onde o Publike funciona, para os textos: "Goiânia e região" (com mais praças, "Goiânia, Anápolis e região"). */
export const ONDE_FUNCIONA = PRACAS.length === 1 ? PRACAS[0].nome : `${emLista(PRACAS.map((p) => p.cidade))} e região`;

/** As cidades que dão nome às praças: "Goiânia" (com mais praças, "Goiânia e Anápolis"). */
export const CIDADES_DAS_PRACAS = emLista(PRACAS.map((p) => p.cidade));

/** Os estados das praças, para os textos e a IA: "GO". */
export const UFS = emLista([...new Set(PRACAS.map((p) => p.uf))]);

/** "Em Goiânia e região: Aparecida de Goiânia, Senador Canedo, Trindade, Goianira e as cidades vizinhas." */
export const CIDADES_ATENDIDAS = `Em ${ONDE_FUNCIONA}: ${PRACAS.flatMap((p) => p.vizinhas).join(", ")} e as cidades vizinhas.`;

/** A caixa que cobre todas as praças (o limite do mapa). */
export const CAIXA_DO_PUBLIKE: Caixa = {
  latMin: Math.min(...PRACAS.map((p) => p.caixa.latMin)),
  latMax: Math.max(...PRACAS.map((p) => p.caixa.latMax)),
  lngMin: Math.min(...PRACAS.map((p) => p.caixa.lngMin)),
  lngMax: Math.max(...PRACAS.map((p) => p.caixa.lngMax)),
};

const chave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const POR_CHAVE = new Map(CIDADES.map((c) => [chave(c), c] as const));

/** A cidade da nossa lista com esse nome ("GOIANIA", "goiânia" → "Goiânia"); null se o Publike não atende lá. */
export function cidadeDoPublike(nome: string | null | undefined): Cidade | null {
  return nome ? (POR_CHAVE.get(chave(nome)) ?? null) : null;
}

export function pracaDaCidade(cidade: string | null | undefined): Praca | null {
  const c = cidadeDoPublike(cidade);
  return c ? (PRACAS.find((p) => p.cidades.includes(c)) ?? null) : null;
}

const naCaixa = (p: Ponto, c: Caixa) => p.lat >= c.latMin && p.lat <= c.latMax && p.lng >= c.lngMin && p.lng <= c.lngMax;

export function pracaDoPonto(p: Ponto | null | undefined): Praca | null {
  return p ? (PRACAS.find((praca) => naCaixa(p, praca.caixa)) ?? null) : null;
}

/** O ponto fica onde o Publike funciona? */
export function noPublike(p: Ponto | null | undefined): p is Ponto {
  return pracaDoPonto(p) !== null;
}

/** A cidade que dá nome a uma praça (Goiânia): nos lugares, o bairro dela aparece sem a cidade. */
export function cidadeDePraca(cidade: string | null | undefined) {
  return PRACAS.some((p) => p.cidade === cidade);
}
