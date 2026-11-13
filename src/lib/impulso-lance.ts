// O lance das campanhas do impulso no Google (claude/diagnostico-impulsos-sem-cliques.md). Desde 13/11/2026 à tarde, o
// robô cria no "Maximizar cliques", com o teto do clique das Regras como limite (`lance` em servidor/impulsos.ts), como
// a campanha geral do Publike, que funciona. De 12 a 13/11/2026 ele criou na parcela de impressões no alto da página,
// e as campanhas ficaram com 0 vistas: elas começaram a aparecer quando alguém pôs "Maximizar cliques" e as cidades à
// mão no Google Ads (a Etica RH e o Movimentador). As campanhas que ainda estão na parcela de impressões passam para o
// "Maximizar cliques" na medida seguinte. O CPC manual (posto à mão) fica como está, e o grupo sem lance (R$ 0,01)
// ganha o teto das Regras: no CPC manual, é esse o lance de cada clique.

/** O jeito do lance que o robô cria e ajusta ("Maximizar cliques"): o teto das Regras e o ajuste diário valem nele. */
export const LANCE_DO_ROBO = "TARGET_SPEND";

/** O jeito que o robô usava de 12 a 13/11/2026 (a parcela de impressões): na medida, vira o do robô. */
export const LANCE_DE_ANTES = "TARGET_IMPRESSION_SHARE";

/** A campanha está no jeito de lance do robô. */
export function lanceDoRobo(estrategia: string | null | undefined): boolean {
  return estrategia === LANCE_DO_ROBO;
}

/** A campanha ainda está no jeito de antes do robô (a parcela de impressões, com 0 vistas). */
export function lanceDeAntes(estrategia: string | null | undefined): boolean {
  return estrategia === LANCE_DE_ANTES;
}

/**
 * O Google usa o lance de cada grupo de anúncios: só no CPC manual. Nos outros jeitos ("Maximizar cliques", a parcela de
 * impressões), o lance do grupo não conta, e o robô não mexe nele.
 */
export function usaLanceDoGrupo(
  estrategia: string | null | undefined,
): boolean {
  return estrategia === "MANUAL_CPC";
}

/** O lance que o Google põe no grupo criado sem lance: R$ 0,01. */
export const LANCE_MINIMO_MICROS = 10_000;

/** O teto do clique das Regras (em reais), em micros, como o Google guarda. */
export function tetoEmMicros(teto: number): number {
  return Math.round(teto * 1_000_000);
}

/** O lance do robô no Google: "Maximizar cliques", pagando até o teto do clique por clique. */
export function lanceMaximizarCliques(teto: number) {
  return { targetSpend: { cpcBidCeilingMicros: String(tetoEmMicros(teto)) } };
}

/**
 * Os grupos sem lance (ou com o mínimo do Google), com o lance que passam a ter: o teto do clique das Regras. O grupo
 * com outro lance, posto à mão, fica como está.
 */
export function gruposSemLance<T extends { micros: number | null }>(
  grupos: T[],
  teto: number,
): (T & { novo: number })[] {
  const novo = tetoEmMicros(teto);
  return grupos
    .filter((g) => g.micros == null || g.micros <= LANCE_MINIMO_MICROS)
    .map((g) => ({ ...g, novo }));
}
