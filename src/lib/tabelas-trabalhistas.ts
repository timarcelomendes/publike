// As tabelas trabalhistas do ano (claude/plano-calculadora-rescisao.md): INSS, IR, salário mínimo e salário-família.
// Usadas pela calculadora de rescisão (e, depois, pelo salário líquido e pelas férias e 13º). Mudam todo janeiro:
// atualizar VIGENCIA e os valores juntos (a tarefa agendada de 15/01 confere).

export const ANO_DAS_TABELAS = 2026;
export const VIGENCIA_TABELAS = "01/01/2026";

/** Salário mínimo nacional (base da insalubridade). */
export const SALARIO_MINIMO_NACIONAL = 1621;

/** INSS do empregado e da doméstica (Portaria Interministerial MPS/MF nº 13, de 09/01/2026): faixa a faixa. */
export const FAIXAS_INSS: readonly { ate: number; aliquota: number }[] = [
  { ate: 1621.0, aliquota: 0.075 },
  { ate: 2902.84, aliquota: 0.09 },
  { ate: 4354.27, aliquota: 0.12 },
  { ate: 8475.55, aliquota: 0.14 },
];
export const TETO_INSS = 8475.55;

/** IR mensal (tabela de maio/2025, Lei 15.191/2025): base até `ate`, alíquota e parcela a deduzir. */
export const FAIXAS_IR: readonly { ate: number; aliquota: number; deduzir: number }[] = [
  { ate: 2428.8, aliquota: 0, deduzir: 0 },
  { ate: 2826.65, aliquota: 0.075, deduzir: 182.16 },
  { ate: 3751.05, aliquota: 0.15, deduzir: 394.16 },
  { ate: 4664.68, aliquota: 0.225, deduzir: 675.49 },
  { ate: Infinity, aliquota: 0.275, deduzir: 908.73 },
];
export const DEDUCAO_DEPENDENTE_IR = 189.59;
export const DESCONTO_SIMPLIFICADO_IR = 607.2;

/** Redutor do IR a partir de 2026 (Lei 15.270/2025), pelo rendimento bruto tributável do mês. */
export const REDUTOR_IR = { ateIsento: 5000, maximoIsento: 312.89, ate: 7350, fixo: 978.62, fator: 0.133145 } as const;

/** Salário-família 2026: cota por filho de até 14 anos, para quem ganha até o limite. */
export const SALARIO_FAMILIA = { cota: 67.54, ate: 1980.38 } as const;

/** Arredonda para centavos (meio para cima, sem o erro do ponto flutuante). */
export function centavos(v: number) {
  // toFixed(4) antes de arredondar: 121,575 × 100 dá 12157,4999… no ponto flutuante
  return Math.round(Number((v * 100).toFixed(4))) / 100;
}

/** O INSS faixa por faixa, até o teto (soma as faixas e arredonda uma vez, em centavos). */
export function calcularInss(base: number) {
  let anterior = 0;
  let total = 0;
  const b = Math.min(Math.max(base, 0), TETO_INSS);
  for (const f of FAIXAS_INSS) {
    if (b <= anterior) break;
    total += (Math.min(b, f.ate) - anterior) * f.aliquota;
    anterior = f.ate;
  }
  return centavos(total);
}

/** O imposto pela tabela, sobre a base já com as deduções. */
export function impostoPelaTabela(base: number) {
  const f = FAIXAS_IR.find((x) => base <= x.ate) ?? FAIXAS_IR[FAIXAS_IR.length - 1];
  return Math.max(0, centavos(base * f.aliquota - f.deduzir));
}

/** O redutor de 2026: depende do rendimento bruto tributável e nunca passa do imposto. */
export function redutorIr(rendimentoBruto: number, imposto: number) {
  let r = 0;
  if (rendimentoBruto <= REDUTOR_IR.ateIsento) r = REDUTOR_IR.maximoIsento;
  else if (rendimentoBruto <= REDUTOR_IR.ate) r = REDUTOR_IR.fixo - REDUTOR_IR.fator * rendimentoBruto;
  return centavos(Math.min(Math.max(r, 0), imposto));
}

export type CalculoIr = { base: number; imposto: number; redutor: number; devido: number; simplificado: boolean };

/**
 * O IR de um rendimento: a base com as deduções legais (INSS, dependentes, pensão) ou, no mensal, com o desconto
 * simplificado, o que for melhor; a tabela; e o redutor de 2026. `exclusivo`: o 13º (sem o desconto simplificado).
 */
export function calcularIr(
  rendimento: number,
  d: { inss: number; dependentes: number; pensao: number; exclusivo?: boolean },
): CalculoIr {
  if (rendimento <= 0) return { base: 0, imposto: 0, redutor: 0, devido: 0, simplificado: false };
  const legais = d.inss + d.dependentes * DEDUCAO_DEPENDENTE_IR + d.pensao;
  const simplificado = !d.exclusivo && DESCONTO_SIMPLIFICADO_IR > legais;
  const base = centavos(Math.max(0, rendimento - (simplificado ? DESCONTO_SIMPLIFICADO_IR : legais)));
  const imposto = impostoPelaTabela(base);
  const redutor = redutorIr(rendimento, imposto);
  return { base, imposto, redutor, devido: centavos(imposto - redutor), simplificado };
}
