import { CENTRO_GOIANIA, REGIAO } from "./config";
import { REGIMES, SLUGS_CATEGORIAS, type Categoria } from "./constantes";
import { raioDoTempo, TEMPOS } from "./deslocamento";
import { primeiro } from "./formato";
import type { Regime, TipoAnuncio } from "./tipos";

export const RAIOS = [5, 10, 25, 50] as const;
export const RAIO_PADRAO = 25;

export type Origem = "centro" | "gps" | "mapa";
export type Ordem = "perto" | "recentes";

export type Filtros = {
  q: string;
  tipo: TipoAnuncio | null;
  categoria: Categoria | null;
  regime: Regime | null;
  raio: number;
  /** "Até X min de ônibus": quando há, vale no lugar do raio */
  tempo: number | null;
  ordem: Ordem;
  lat: number;
  lng: number;
  origem: Origem;
};

export const FILTROS_PADRAO: Filtros = {
  q: "",
  tipo: null,
  categoria: null,
  regime: null,
  raio: RAIO_PADRAO,
  tempo: null,
  ordem: "perto",
  lat: CENTRO_GOIANIA.lat,
  lng: CENTRO_GOIANIA.lng,
  origem: "centro",
};

type Parametros = Record<string, string | string[] | undefined>;

function numero(valor: string | undefined) {
  if (!valor) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Lê os filtros da URL, ignorando qualquer valor fora do esperado. */
export function lerFiltros(sp: Parametros): Filtros {
  const q = (primeiro(sp.q) ?? "").trim().slice(0, 80);
  const tipo = primeiro(sp.tipo);
  const cat = primeiro(sp.categoria);
  const regime = primeiro(sp.regime);
  const raio = numero(primeiro(sp.raio));
  const tempo = numero(primeiro(sp.tempo));
  const lat = numero(primeiro(sp.lat));
  const lng = numero(primeiro(sp.lng));
  const temPonto =
    lat !== null &&
    lng !== null &&
    lat >= REGIAO.latMin &&
    lat <= REGIAO.latMax &&
    lng >= REGIAO.lngMin &&
    lng <= REGIAO.lngMax;
  const origem = primeiro(sp.origem);

  return {
    q,
    tipo: tipo === "vaga" || tipo === "servico" ? tipo : null,
    categoria: cat && (SLUGS_CATEGORIAS as string[]).includes(cat) ? (cat as Categoria) : null,
    regime: regime && regime in REGIMES && tipo !== "servico" ? (regime as Regime) : null,
    raio: raio && (RAIOS as readonly number[]).includes(raio) ? raio : RAIO_PADRAO,
    tempo: tempo && (TEMPOS as readonly number[]).includes(tempo) ? tempo : null,
    ordem: primeiro(sp.ordem) === "recentes" ? "recentes" : "perto",
    lat: temPonto ? Math.round(lat * 10000) / 10000 : CENTRO_GOIANIA.lat,
    lng: temPonto ? Math.round(lng * 10000) / 10000 : CENTRO_GOIANIA.lng,
    origem: temPonto ? (origem === "gps" ? "gps" : "mapa") : "centro",
  };
}

/** Monta a URL só com o que difere do padrão: "/?tipo=vaga&raio=10". */
export function hrefFiltros(atual: Filtros, mudancas: Partial<Filtros> = {}) {
  const f = { ...atual, ...mudancas };
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.tipo) p.set("tipo", f.tipo);
  if (f.categoria) p.set("categoria", f.categoria);
  if (f.regime && f.tipo !== "servico") p.set("regime", f.regime);
  if (f.tempo) p.set("tempo", String(f.tempo));
  else if (f.raio !== RAIO_PADRAO) p.set("raio", String(f.raio));
  if (f.ordem !== "perto") p.set("ordem", f.ordem);
  if (f.origem !== "centro") {
    p.set("lat", String(f.lat));
    p.set("lng", String(f.lng));
    p.set("origem", f.origem);
  }
  const s = p.toString();
  return s ? `/?${s}` : "/";
}

export function descreverOrigem(origem: Origem) {
  if (origem === "gps") return "de você";
  if (origem === "mapa") return "da área escolhida no mapa";
  return "do centro de Goiânia";
}

/** Até onde buscar, em km: o raio escolhido ou o que dá para fazer de ônibus no tempo escolhido. */
export function raioDaBusca(f: Filtros) {
  return f.tempo ? raioDoTempo(f.tempo) : f.raio;
}
