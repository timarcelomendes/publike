// As regras do seguro-desemprego para a ferramenta "Tenho direito?" (claude/plano-seguro-desemprego.md).
// Lei 7.998/1990, Lei 13.134/2015 e Resolução Codefat 957/2022. A tabela muda todo janeiro, pelo INPC: atualizar
// VIGENCIA, SALARIO_MINIMO e FAIXAS juntos.

export const VIGENCIA = "11/01/2026";
export const ANO_DA_TABELA = 2026;
export const SALARIO_MINIMO = 1621;

/** A tabela de 2026: até a 1ª faixa, 80% da média; até a 2ª, o fixo mais 50% do que passar; acima, o teto. */
export const FAIXAS = { ate: 2222.17, fixo: 1777.74, segunda: 3703.99, teto: 2518.65 } as const;

export type Saida = "sem_justa_causa" | "rescisao_indireta" | "pediu" | "justa_causa" | "acordo" | "fim_contrato";
export type Pedido = 1 | 2 | 3;

export type Respostas = {
  saida: Saida;
  domestico: boolean;
  /** 1: nunca pediu; 2: já pediu uma vez; 3: duas vezes ou mais */
  pedido: Pedido;
  /** já pediu e recebeu nos últimos 16 meses */
  recebeuRecente: boolean;
  /** cumpriu o tempo mínimo na janela do pedido (ver JANELA) */
  cumpriuJanela: boolean;
  /** meses com carteira nos últimos 36 (para as parcelas) */
  meses36: number;
  /** média dos 3 últimos salários, em reais (0: não informou) */
  media: number;
};

/** A pergunta do tempo mínimo, conforme o pedido (e o doméstico). */
export function janela(pedido: Pedido, domestico: boolean) {
  if (domestico) return { minimo: 15, texto: "Trabalhou com carteira pelo menos 15 meses nos últimos 24?" };
  if (pedido === 1) return { minimo: 12, texto: "Trabalhou com carteira pelo menos 12 meses nos últimos 18?" };
  if (pedido === 2) return { minimo: 9, texto: "Trabalhou com carteira pelo menos 9 meses nos últimos 12?" };
  return { minimo: 6, texto: "Trabalhou com carteira os 6 meses seguidos antes da demissão?" };
}

const NAO_DA: Record<Exclude<Saida, "sem_justa_causa" | "rescisao_indireta">, string> = {
  pediu: "Quem pede demissão não tem direito ao seguro-desemprego.",
  justa_causa: "Quem é demitido por justa causa não tem direito ao seguro-desemprego.",
  acordo:
    "No acordo entre empresa e empregado (o artigo 484-A da CLT), a pessoa saca parte do FGTS, mas não tem direito ao seguro-desemprego.",
  fim_contrato:
    "O fim do contrato de experiência ou do temporário, no prazo combinado, não dá direito ao seguro-desemprego. Se a empresa encerrou antes do prazo, sem justa causa, aí pode dar: confira no gov.br.",
};

/** O valor da parcela pela média dos 3 últimos salários (nunca abaixo do mínimo). */
export function valorDaParcela(media: number) {
  let v: number;
  if (media <= FAIXAS.ate) v = media * 0.8;
  else if (media <= FAIXAS.segunda) v = FAIXAS.fixo + (media - FAIXAS.ate) * 0.5;
  else v = FAIXAS.teto;
  return Math.round(Math.max(v, SALARIO_MINIMO) * 100) / 100;
}

/** Quantas parcelas, pelo pedido e pelos meses com carteira nos últimos 36. */
export function parcelas(pedido: Pedido, meses: number) {
  if (meses >= 24) return 5;
  if (meses >= 12) return 4;
  if (pedido === 2 && meses >= 9) return 3;
  if (pedido === 3 && meses >= 6) return 3;
  return 0;
}

export type Resultado =
  { direito: false; motivo: string } | { direito: true; parcelas: number; valor: number | null; prazoDias: number };

export function calcular(r: Respostas): Resultado {
  if (r.saida !== "sem_justa_causa" && r.saida !== "rescisao_indireta")
    return { direito: false, motivo: NAO_DA[r.saida] };
  if (r.pedido > 1 && r.recebeuRecente) {
    return {
      direito: false,
      motivo:
        "Entre um seguro e outro é preciso esperar 16 meses, contados da demissão que deu o seguro anterior. Depois disso, dá para pedir de novo.",
    };
  }
  const j = janela(r.pedido, r.domestico);
  if (!r.cumpriuJanela) {
    return {
      direito: false,
      motivo: r.domestico
        ? "Para o empregado doméstico, a lei pede pelo menos 15 meses de carteira nos últimos 24 antes da demissão."
        : r.pedido === 3
          ? "A partir do 3º pedido, a lei pede carteira assinada em cada um dos 6 meses antes da demissão."
          : `No ${r.pedido}º pedido, a lei pede pelo menos ${j.minimo} meses de carteira ${r.pedido === 1 ? "nos últimos 18" : "nos últimos 12"} antes da demissão.`,
    };
  }
  if (r.domestico) return { direito: true, parcelas: 3, valor: SALARIO_MINIMO, prazoDias: 90 };
  // quem cumpriu a janela tem pelo menos o mínimo dela nos 36 meses
  const n = parcelas(r.pedido, Math.max(r.meses36, j.minimo));
  return { direito: true, parcelas: n, valor: r.media > 0 ? valorDaParcela(r.media) : null, prazoDias: 120 };
}

/** O prazo para pedir: do 7º ao último dia, contados da demissão ("2026-11-02" → datas). */
export function prazoParaPedir(demissao: string, ate: number) {
  const [a, m, d] = demissao.split("-").map(Number);
  if (!a || !m || !d) return null;
  const dia = (n: number) => new Date(Date.UTC(a, m - 1, d + n));
  return { de: dia(7), ate: dia(ate) };
}
