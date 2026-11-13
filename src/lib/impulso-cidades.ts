// As cidades do impulso no Google (13/11/2026, claude/diagnostico-impulsos-sem-cliques.md). O anúncio aparece na
// cidade da vaga e nas cidades vizinhas que o raio do Admin alcança, como na campanha geral do Publike ("Quem procura
// emprego (vagas) - Goiânia"), que usa cidades e funciona. Antes, o robô punha só um raio em volta da vaga, e as
// campanhas dele ficavam com 0 vistas; as primeiras vistas vieram quando as cidades entraram (na Etica RH e no
// Movimentador, à mão, junto com o "Maximizar cliques"). O robô leva isto ao Google em servidor/impulsos.ts.

import { CIDADES, type Cidade } from "./constantes";
import { cidadeDoPublike, type Ponto } from "./pracas";
import { pontosDaCidade } from "./regioes";

/**
 * Quanto o centro da cidade vizinha pode ficar além do raio (km): a cidade começa antes do centro dela (em volta de
 * Goiânia, as cidades têm uns 10 km do centro até a divisa; em Goiânia, conta o centro da região mais perto).
 */
export const ALEM_DO_RAIO = 10;

/** A distância em linha reta, em km (perto assim, a Terra é plana o bastante). */
export function distanciaEmKm(a: Ponto, b: Ponto) {
  const norte = (b.lat - a.lat) * 111.32;
  const leste = (b.lng - a.lng) * 111.32 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(norte, leste);
}

/** A distância até a cidade: até o ponto mais perto dela (o centro ou, em Goiânia, o centro de uma região). */
export function distanciaDaCidade(p: Ponto, cidade: Cidade) {
  return Math.min(...pontosDaCidade(cidade).map((c) => distanciaEmKm(p, c)));
}

/**
 * As cidades do anúncio: a da vaga, sempre, e as do Publike até o raio mais `ALEM_DO_RAIO` km do ponto da vaga
 * (`distanciaDaCidade`), da mais perto para a mais longe. Sem o ponto, só a cidade da vaga.
 */
export function cidadesDoLugar(l: (Ponto & { raio: number }) | null, cidade?: string | null): Cidade[] {
  const daVaga = cidadeDoPublike(cidade);
  const perto = l
    ? CIDADES.map((c) => ({ c, km: distanciaDaCidade(l, c) }))
        .filter((x) => x.km <= l.raio + ALEM_DO_RAIO)
        .sort((a, b) => a.km - b.km)
        .map((x) => x.c)
    : [];
  return [...new Set([...(daVaga ? [daVaga] : []), ...perto])];
}

/** Uma linha da consulta dos lugares do Google (`geo_target_constant`). */
export type LugarDoGoogle = {
  resourceName?: string;
  name?: string;
  canonicalName?: string;
  targetType?: string;
  status?: string;
};

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Cada cidade do Publike e o lugar dela no Google ("geoTargetConstants/1001655"): o mesmo nome (com ou sem acento), do
 * tipo cidade (ou município), em Goiás. Com dois, fica a cidade ativa.
 */
export function cidadesNoGoogle(linhas: LugarDoGoogle[]): Map<Cidade, string> {
  const melhor = new Map<Cidade, { lugar: string; nota: number }>();
  for (const l of linhas) {
    if (!l.resourceName || !l.name) continue;
    const tipo = (l.targetType ?? "").toLowerCase();
    if (tipo !== "city" && tipo !== "municipality") continue;
    if (!semAcento(l.canonicalName ?? "").includes("goias")) continue;
    const c = cidadeDoPublike(l.name);
    if (!c) continue;
    const nota = (tipo === "city" ? 2 : 0) + (l.status === "ENABLED" ? 1 : 0);
    if ((melhor.get(c)?.nota ?? -1) < nota) melhor.set(c, { lugar: l.resourceName, nota });
  }
  return new Map([...melhor].map(([c, x]) => [c, x.lugar]));
}
