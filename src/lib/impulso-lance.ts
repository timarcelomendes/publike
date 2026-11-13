// O lance das campanhas do impulso no Google (claude/diagnostico-impulsos-sem-cliques.md, 13/11/2026). O robô só mexe
// no lance de quem está no jeito dele, a parcela de impressões no alto da página (`lance` em servidor/impulsos.ts):
// quem foi mudado à mão no Google Ads ("Maximizar cliques", CPC manual) fica como está. Antes, a medida de 2 em 2 horas
// trocava "Maximizar cliques" de volta para a parcela de impressões, e o teto das Regras ia para qualquer campanha.
// E a campanha posta no CPC manual não fica com o lance mínimo do Google (R$ 0,01) nos grupos: o robô cria o grupo sem
// lance (na parcela de impressões, ele não conta), e no CPC manual é esse o lance de cada clique.

/** O jeito do lance que o robô cria e ajusta: o teto das Regras e o ajuste diário só valem nele. */
export const LANCE_DO_ROBO = "TARGET_IMPRESSION_SHARE";

/** A campanha está no jeito de lance do robô (e não num que alguém pôs à mão no Google Ads). */
export function lanceDoRobo(estrategia: string | null | undefined): boolean {
  return estrategia === LANCE_DO_ROBO;
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
