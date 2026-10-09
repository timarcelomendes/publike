// Tempo de deslocamento estimado entre a casa de quem procura e o trabalho.
//
// É uma conta pela distância em linha reta, sem serviço pago de rotas: as ruas
// fazem o caminho ficar ~35% mais longo e cada jeito de ir tem uma velocidade
// média de Goiânia, com o tempo de espera e de chegada.
//   a pé ......... 4,5 km/h
//   bicicleta .... 13 km/h
//   moto ......... 28 km/h + 3 min
//   carro ........ 24 km/h + 5 min (trânsito e estacionar)
//   ônibus ....... 14 km/h + 12 min (ir até o ponto, esperar e descer)
// Serve para comparar vagas ("esta é mais perto"), não para marcar horário.

export type JeitoDeIr = "pe" | "bicicleta" | "moto" | "carro" | "onibus";

const FATOR_RUAS = 1.35;

const JEITOS: Record<JeitoDeIr, { kmh: number; extra: number; nome: string }> = {
  pe: { kmh: 4.5, extra: 0, nome: "a pé" },
  bicicleta: { kmh: 13, extra: 0, nome: "de bicicleta" },
  moto: { kmh: 28, extra: 3, nome: "de moto" },
  carro: { kmh: 24, extra: 5, nome: "de carro" },
  onibus: { kmh: 14, extra: 12, nome: "de ônibus" },
};

/** Minutos estimados para ir, arredondados de 5 em 5 (no mínimo 5). */
export function minutosAte(km: number, jeito: JeitoDeIr) {
  const j = JEITOS[jeito];
  const minutos = j.extra + ((km * FATOR_RUAS) / j.kmh) * 60;
  return Math.max(5, Math.round(minutos / 5) * 5);
}

/** "~25 min", "~1 h 10 min" */
export function formatarMinutos(min: number) {
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `~${h} h ${resto} min` : `~${h} h`;
}

/**
 * O jeito mais simples de dizer o tempo: até 1,5 km, a pé; senão, de ônibus
 * (a maioria de quem procura emprego vai de ônibus).
 */
export function deslocamentoCurto(km: number | null | undefined) {
  if (km == null) return null;
  if (km <= 1.5) return `${formatarMinutos(minutosAte(km, "pe"))} a pé`;
  return `${formatarMinutos(minutosAte(km, "onibus"))} de ônibus`;
}

/** Todos os jeitos, para a página da vaga. A pé só até 3 km. */
export function deslocamentos(km: number) {
  const jeitos: JeitoDeIr[] = km <= 3 ? ["pe", "onibus", "moto", "carro"] : ["onibus", "bicicleta", "moto", "carro"];
  return jeitos.map((j) => ({ jeito: j, nome: JEITOS[j].nome, minutos: minutosAte(km, j) }));
}

/** Os tempos do filtro "Até X de ônibus". */
export const TEMPOS = [20, 30, 45, 60] as const;
export type Tempo = (typeof TEMPOS)[number];

/** Distância em linha reta que dá para fazer de ônibus em `min` minutos. */
export function raioDoTempo(min: number) {
  const j = JEITOS.onibus;
  const km = (((min - j.extra) / 60) * j.kmh) / FATOR_RUAS;
  return Math.max(1, Math.round(km * 10) / 10);
}

export function nomeDoTempo(min: number) {
  return min >= 60 ? `Até 1 h de ônibus` : `Até ${min} min de ônibus`;
}
