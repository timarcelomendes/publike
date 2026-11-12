// Tempo de deslocamento estimado entre a casa de quem procura e o trabalho.
//
// É uma conta pela distância em linha reta, sem serviço pago de rotas, em duas partes:
// - os primeiros 10 km (em linha reta) são dentro da cidade: as ruas fazem o caminho ficar ~35% mais
//   longo e cada jeito de ir tem uma velocidade média de Goiânia, com o tempo de espera e de chegada;
// - o que passa de 10 km vai pelos eixos, pelas marginais e pela rodovia (o ônibus de outra cidade):
//   bem mais rápido por km. Com uma conta só, de cidade, Goiânia → Anápolis (59 km em linha reta) dava
//   ~5 h 55 de ônibus; o Google Maps dá de 2 h 40 a 3 h 10, e esta conta dá ~2 h 55 (12/11/2026).
//                  na cidade (nas ruas)                              depois dos 10 km (em linha reta)
//   a pé ......... 4,5 km/h                                          igual
//   bicicleta .... 13 km/h                                           18 km/h
//   moto ......... 28 km/h + 3 min                                   70 km/h
//   carro ........ 24 km/h + 5 min (trânsito e estacionar)           70 km/h
//   ônibus ....... 14 km/h + 12 min (ir até o ponto, esperar e descer)  28 km/h (com as baldeações)
// Serve para comparar vagas ("esta é mais perto"), não para marcar horário.

export type JeitoDeIr = "pe" | "bicicleta" | "moto" | "carro" | "onibus";

const FATOR_RUAS = 1.35;
/** Até quantos km (em linha reta) a conta é de dentro da cidade; o resto vai pela rodovia. */
const NA_CIDADE_KM = 10;

/** `kmh`: na cidade, nas ruas; `longe`: depois dos 10 km, em linha reta. */
const JEITOS: Record<JeitoDeIr, { kmh: number; extra: number; longe: number; nome: string }> = {
  pe: { kmh: 4.5, extra: 0, longe: 4.5 / FATOR_RUAS, nome: "a pé" },
  bicicleta: { kmh: 13, extra: 0, longe: 18, nome: "de bicicleta" },
  moto: { kmh: 28, extra: 3, longe: 70, nome: "de moto" },
  carro: { kmh: 24, extra: 5, longe: 70, nome: "de carro" },
  onibus: { kmh: 14, extra: 12, longe: 28, nome: "de ônibus" },
};

/** Os minutos sem arredondar: os primeiros 10 km pelas ruas da cidade, o resto pela rodovia. */
function minutosNaConta(km: number, jeito: JeitoDeIr) {
  const j = JEITOS[jeito];
  const naCidade = Math.min(km, NA_CIDADE_KM);
  const longe = Math.max(0, km - NA_CIDADE_KM);
  return j.extra + ((naCidade * FATOR_RUAS) / j.kmh) * 60 + (longe / j.longe) * 60;
}

/** Minutos estimados para ir, arredondados de 5 em 5 (no mínimo 5). */
export function minutosAte(km: number, jeito: JeitoDeIr) {
  return Math.max(5, Math.round(minutosNaConta(km, jeito) / 5) * 5);
}

/** "~25 min", "~1 h 10 min" */
export function formatarMinutos(min: number) {
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `~${h} h ${resto} min` : `~${h} h`;
}

/**
 * O jeito mais provável de ir e quanto leva: até 1,5 km, a pé; senão, de ônibus (a maioria de quem procura
 * emprego vai de ônibus). `texto`: "~25 min de ônibus".
 */
export function deslocamentoProvavel(km: number) {
  const jeito: JeitoDeIr = km <= 1.5 ? "pe" : "onibus";
  const minutos = minutosAte(km, jeito);
  return { jeito, minutos, texto: `${formatarMinutos(minutos)} ${JEITOS[jeito].nome}` };
}

/** O jeito mais simples de dizer o tempo ("~25 min de ônibus", "~10 min a pé"). */
export function deslocamentoCurto(km: number | null | undefined) {
  if (km == null) return null;
  return deslocamentoProvavel(km).texto;
}

/** Todos os jeitos, para a página da vaga. A pé só até 3 km. */
export function deslocamentos(km: number) {
  const jeitos: JeitoDeIr[] = km <= 3 ? ["pe", "onibus", "moto", "carro"] : ["onibus", "bicicleta", "moto", "carro"];
  return jeitos.map((j) => ({ jeito: j, nome: JEITOS[j].nome, minutos: minutosAte(km, j) }));
}

/** Os tempos do filtro "Até X de ônibus". */
export const TEMPOS = [20, 30, 45, 60] as const;
export type Tempo = (typeof TEMPOS)[number];

/** Distância em linha reta que dá para fazer de ônibus em `min` minutos (a conta de `minutosAte` ao contrário). */
export function raioDoTempo(min: number) {
  const j = JEITOS.onibus;
  const ateOFimDaCidade = minutosNaConta(NA_CIDADE_KM, "onibus");
  const km =
    min <= ateOFimDaCidade
      ? (((min - j.extra) / 60) * j.kmh) / FATOR_RUAS
      : NA_CIDADE_KM + ((min - ateOFimDaCidade) / 60) * j.longe;
  return Math.max(1, Math.round(km * 10) / 10);
}

export function nomeDoTempo(min: number) {
  return min >= 60 ? `Até 1 h de ônibus` : `Até ${min} min de ônibus`;
}
