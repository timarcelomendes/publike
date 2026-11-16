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
      bairro: p.lugar.bairro ?? "",
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
