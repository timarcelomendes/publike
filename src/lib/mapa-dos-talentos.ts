// O mapa dos talentos (migrações 20270630120000 e 20270702120000): os tipos e as contas que valem no servidor e no
// navegador. Cada pessoa fica no centro do bairro que escreveu no perfil (nunca a casa); o mapa junta por bairro.

import { distanciaKm } from "./descobrir";

export type Ponto = { lat: number; lng: number };

/** Uma pessoa no painel do bairro: o nome curto, o que faz e, no "Para a sua vaga", o quanto combina. */
export type PessoaNoMapa = { id: string; nome: string; titulo: string | null; nota?: number | null };

export type BairroNoMapa = {
  chave: string;
  cidade: string;
  bairro: string;
  lat: number;
  lng: number;
  pessoas: number;
  talentos: PessoaNoMapa[];
};

export type VagaNoMapa = { id: string; titulo: string; lat: number; lng: number };

export type MapaDosTalentos = {
  bairros: BairroNoMapa[];
  /** sem bairro no perfil, ou com um bairro que o mapa não achou */
  semLugar: number;
  vagas: VagaNoMapa[];
};

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

/**
 * O nome do bairro como o mapa mostra: quem escreveu tudo em minúsculas ("jardim goias") ganha as maiúsculas ("Jardim
 * Goias"); o resto fica como a pessoa escreveu.
 */
export function nomeDoBairro(nome: string) {
  if (nome !== nome.toLowerCase()) return nome;
  return nome
    .split(" ")
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Quantos nomes cada bairro mostra no painel (o resto vira "e mais N"). */
export const NOMES_POR_BAIRRO = 12;

/**
 * Junta uma lista de pessoas (com o lugar de cada uma, quando tem) por bairro, na ordem da lista (no "Para a sua vaga",
 * quem mais combina primeiro). Quem não tem lugar conta em `semLugar`.
 */
export function montarMapa(
  pessoas: (PessoaNoMapa & { lugar: (Ponto & { cidade: string; bairro: string | null }) | null })[],
  vagas: VagaNoMapa[],
): MapaDosTalentos {
  const porBairro = new Map<string, BairroNoMapa>();
  let semLugar = 0;
  for (const p of pessoas) {
    if (!p.lugar) {
      semLugar++;
      continue;
    }
    const chave = `${p.lugar.lat}|${p.lugar.lng}`;
    const b = porBairro.get(chave) ?? {
      chave,
      cidade: p.lugar.cidade,
      bairro: nomeDoBairro(p.lugar.bairro ?? ""),
      lat: p.lugar.lat,
      lng: p.lugar.lng,
      pessoas: 0,
      talentos: [],
    };
    b.pessoas++;
    if (b.talentos.length < NOMES_POR_BAIRRO) b.talentos.push({ id: p.id, nome: p.nome, titulo: p.titulo, nota: p.nota });
    porBairro.set(chave, b);
  }
  return { bairros: [...porBairro.values()].sort((a, b) => b.pessoas - a.pessoas), semLugar, vagas };
}

/**
 * A distância aproximada (do centro do bairro): "≈ 800 m", "≈ 3 km". Perto demais para medir pelo bairro, "pertinho";
 * null sem os dois pontos.
 */
export function distanciaAproximada(de: Ponto | null | undefined, ate: Ponto | null | undefined): string | null {
  if (!de || !ate) return null;
  const km = distanciaKm(de.lat, de.lng, ate.lat, ate.lng);
  if (km < 0.6) return "pertinho";
  if (km < 1) return `≈ ${Math.round((km * 1000) / 100) * 100} m`;
  return `≈ ${km < 10 ? km.toFixed(0) : Math.round(km)} km`;
}

/**
 * A distância de um talento no texto do cartão (16/11/2026, "a distância aproximada do talento x empresa / vaga"): até
 * a vaga mais perto (quem tem vaga no ar), senão até o lugar de quem vê (a localização do aparelho, o CEP de casa ou
 * o centro do bairro do perfil). Sem o bairro do talento no mapa, diz isso; sem lugar nenhum de quem vê, null.
 */
export function distanciaDoTalento(
  lugar: Ponto | null | undefined,
  vagas: VagaNoMapa[],
  daqui: Ponto | null,
): string | null {
  if (!vagas.length && !daqui) return null;
  if (!lugar) return "sem bairro no perfil para medir a distância";
  if (vagas.length) {
    const perto = vagas.reduce((a, b) =>
      (a.lat - lugar.lat) ** 2 + (a.lng - lugar.lng) ** 2 <= (b.lat - lugar.lat) ** 2 + (b.lng - lugar.lng) ** 2 ? a : b,
    );
    const d = distanciaAproximada(lugar, perto);
    return d && `${d} ${vagas.length === 1 ? "da sua vaga" : `da vaga “${perto.titulo}”`}`;
  }
  const d = distanciaAproximada(lugar, daqui);
  return d && `${d} de você`;
}
