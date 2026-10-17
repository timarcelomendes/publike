import { CENTRO_GOIANIA, REGIAO } from "./config";
import { REGIMES, SLUGS_CATEGORIAS, type Categoria } from "./constantes";
import { raioDoTempo, TEMPOS } from "./deslocamento";
import { primeiro } from "./formato";
import type { Regime, TipoAnuncio } from "./tipos";

export const RAIOS = [5, 10, 25, 50] as const;
export const RAIO_PADRAO = 25;

export type Origem = "centro" | "gps" | "mapa";
/** "combina": do que mais combina com o currículo (só para quem tem currículo; sem ele, vale "perto") */
export type Ordem = "perto" | "recentes" | "combina";

/** Quando a pessoa pode trabalhar: o filtro de turno das vagas. */
export const TURNOS = [
  { valor: "manha", nome: "De manhã", curto: "de manhã" },
  { valor: "tarde", nome: "À tarde", curto: "à tarde" },
  { valor: "noite", nome: "À noite", curto: "à noite" },
  { valor: "fim_de_semana", nome: "Fim de semana", curto: "no fim de semana" },
] as const;
export type Turno = (typeof TURNOS)[number]["valor"];

export type Filtros = {
  q: string;
  tipo: TipoAnuncio | null;
  categoria: Categoria | null;
  regime: Regime | null;
  /** só vagas: de manhã, à tarde, à noite ou no fim de semana */
  turno: Turno | null;
  raio: number;
  /** "Até X min de ônibus": quando há, vale no lugar do raio */
  tempo: number | null;
  ordem: Ordem;
  lat: number;
  lng: number;
  origem: Origem;
  /** "Só os meus": só os anúncios de quem está logado */
  meus: boolean;
  /** a pessoa escolheu "Tudo" (vale mesmo se o que ela procura abre em Vagas ou Serviços) */
  tudo?: boolean;
};

export const FILTROS_PADRAO: Filtros = {
  q: "",
  tipo: null,
  categoria: null,
  regime: null,
  turno: null,
  raio: RAIO_PADRAO,
  tempo: null,
  ordem: "perto",
  lat: CENTRO_GOIANIA.lat,
  lng: CENTRO_GOIANIA.lng,
  origem: "centro",
  meus: false,
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
  const turno = primeiro(sp.turno);
  const ordem = primeiro(sp.ordem);
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
    // só em Vagas (sem tipo na URL, a intenção ainda pode abrir em Vagas: aplicarIntencao confere)
    turno: (tipo === "vaga" || !tipo) && TURNOS.some((t) => t.valor === turno) ? (turno as Turno) : null,
    raio: raio && (RAIOS as readonly number[]).includes(raio) ? raio : RAIO_PADRAO,
    tempo: tempo && (TEMPOS as readonly number[]).includes(tempo) ? tempo : null,
    ordem: ordem === "recentes" || ordem === "combina" ? ordem : "perto",
    lat: temPonto ? Math.round(lat * 10000) / 10000 : CENTRO_GOIANIA.lat,
    lng: temPonto ? Math.round(lng * 10000) / 10000 : CENTRO_GOIANIA.lng,
    origem: temPonto ? (origem === "gps" ? "gps" : "mapa") : "centro",
    meus: primeiro(sp.meus) === "1",
    tudo: tipo === "tudo",
  };
}

/**
 * Sem tipo na URL, a busca abre na aba do que a pessoa disse que quer
 * (Procuro trabalho → Vagas; Quero contratar um serviço → Serviços).
 */
export function aplicarIntencao(f: Filtros, tipoPadrao: TipoAnuncio | null): Filtros {
  const tipo = f.tipo || f.tudo || !tipoPadrao ? f.tipo : tipoPadrao;
  return { ...f, tipo, regime: tipo === "servico" ? null : f.regime, turno: tipo === "vaga" ? f.turno : null };
}

/** Monta a URL só com o que difere do padrão: "/?tipo=vaga&raio=10". */
export function hrefFiltros(atual: Filtros, mudancas: Partial<Filtros> = {}) {
  const f = { ...atual, ...mudancas };
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.tipo) p.set("tipo", f.tipo);
  else if (f.tudo) p.set("tipo", "tudo");
  if (f.categoria) p.set("categoria", f.categoria);
  if (f.regime && f.tipo !== "servico") p.set("regime", f.regime);
  if (f.turno && f.tipo === "vaga") p.set("turno", f.turno);
  if (f.tempo) p.set("tempo", String(f.tempo));
  else if (f.raio !== RAIO_PADRAO) p.set("raio", String(f.raio));
  if (f.ordem !== "perto") p.set("ordem", f.ordem);
  if (f.meus) p.set("meus", "1");
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
