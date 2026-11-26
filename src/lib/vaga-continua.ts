// A vaga ainda está aberta? (25/11/2026, migração 20271003120000; Marcelo, com a Organiza Inventory: 28 dias no ar e
// 38 curtidas, "Vagas antigas e com várias curtidas, ter uma maneira de questionar a empresa, se a vaga ainda está
// disponível"). O estado vem do banco (`confirmacao_das_vagas`); aqui ficam os textos, sem nada do servidor (o cartão,
// a página da vaga e os testes usam).
//
// - confirmada: quem publicou confirmou (ou renovou) nos últimos 7 dias;
// - aguardando: o Publike perguntou há menos de 3 dias;
// - sem_resposta: perguntou há 3 dias ou mais e ninguém respondeu (a vaga desce na lista);
// - pode_perguntar: no ar há 14 dias ou mais desde a última confirmação (o botão "Ainda está aberta?").

import { tempoRelativo } from "./formato";

export type EstadoDaContinua = "confirmada" | "aguardando" | "sem_resposta" | "pode_perguntar";

export type SituacaoContinua = {
  estado: EstadoDaContinua | null;
  confirmadaEm: string | null;
  /** quem vê perguntou e ainda não teve a resposta */
  pedi: boolean;
};

/** No cartão, o botão só na vaga com 10 curtidas ou mais (o "Ainda está aberta?" em toda vaga antiga lotaria a lista). */
export const CURTIDAS_PARA_O_CARTAO = 10;

const ESTADOS: EstadoDaContinua[] = ["confirmada", "aguardando", "sem_resposta", "pode_perguntar"];

/** A linha de `confirmacao_das_vagas`. */
export function situacaoDoBanco(r: { estado: string | null; confirmada_em: string | null; pedi: boolean | null }): SituacaoContinua {
  return {
    estado: ESTADOS.includes(r.estado as EstadoDaContinua) ? (r.estado as EstadoDaContinua) : null,
    confirmadaEm: r.confirmada_em,
    pedi: Boolean(r.pedi),
  };
}

export type LinhaDaContinua =
  | { tipo: "confirmada" | "aguardando" | "sem_resposta" | "perguntou"; texto: string }
  | { tipo: "perguntar"; texto: string; botao: string };

/**
 * O que mostrar (null: nada). `cartao`: no cartão da lista, o botão só com 10 curtidas ou mais e sem o "perguntar de
 * novo" (fica na página da vaga).
 */
export function linhaDaContinua(
  s: SituacaoContinua | null | undefined,
  agora: number,
  { cartao = false, curtidas = null }: { cartao?: boolean; curtidas?: number | null } = {},
): LinhaDaContinua | null {
  if (!s?.estado) return null;
  if (s.estado === "confirmada")
    return {
      tipo: "confirmada",
      texto: s.confirmadaEm ? `Confirmada aberta ${tempoRelativo(s.confirmadaEm, agora)}` : "Confirmada aberta",
    };
  if (s.pedi) return { tipo: "perguntou", texto: "Você perguntou se continua aberta. Avisamos quando a empresa responder." };
  if (s.estado === "aguardando") return { tipo: "aguardando", texto: "Perguntamos à empresa se continua aberta" };
  if (s.estado === "sem_resposta") {
    if (cartao) return { tipo: "sem_resposta", texto: "A empresa não confirmou se continua aberta" };
    return {
      tipo: "perguntar",
      texto: "A empresa não confirmou se continua aberta.",
      botao: "Perguntar de novo",
    };
  }
  // pode_perguntar
  if (cartao && (curtidas ?? 0) < CURTIDAS_PARA_O_CARTAO) return null;
  return { tipo: "perguntar", texto: "", botao: "Ainda está aberta?" };
}

/** A vaga perguntada e sem resposta desce na linha do tempo (src/lib/relevancia.ts). */
export const semResposta = (s: SituacaoContinua | null | undefined) => s?.estado === "sem_resposta";
