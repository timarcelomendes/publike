// Copiloto e Testes Publike: recursos pagos, com 15 dias grátis para experimentar (decisão do usuário,
// 29/10/2026; migração 20261215120000). O banco confere de novo quem pode o quê.

export const DIAS_GRATIS = 15;

export type RecursoPago = "copiloto" | "testes";

export type EstadoRecurso = {
  liberado: boolean;
  /** até quando vai o acesso; null: sem prazo (liberado pelo Publike) */
  ate: string | null;
  experimentou: boolean;
  fim_experimento: string | null;
  quer_continuar: boolean;
  pode_experimentar: boolean;
};

export type RecursosPagos = Record<RecursoPago, EstadoRecurso>;

export const NOME_RECURSO: Record<RecursoPago, string> = { copiloto: "Copiloto", testes: "Testes Publike" };

export function ehRecursoPago(x: unknown): x is RecursoPago {
  return x === "copiloto" || x === "testes";
}

function lerEstado(x: unknown): EstadoRecurso | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    liberado: o.liberado === true,
    ate: texto(o.ate),
    experimentou: o.experimentou === true,
    fim_experimento: texto(o.fim_experimento),
    quer_continuar: o.quer_continuar === true,
    pode_experimentar: o.pode_experimentar === true,
  };
}

/** O jsonb de `recursos_pagos()`; o que vier torto, null (a página segue como antes). */
export function lerRecursos(data: unknown): RecursosPagos | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const copiloto = lerEstado(o.copiloto);
  const testes = lerEstado(o.testes);
  return copiloto && testes ? { copiloto, testes } : null;
}

/** Quantos dias faltam (arredonda para cima: no último dia, "falta 1 dia"). */
export function diasRestantes(ate: string, agora: number): number {
  return Math.max(1, Math.ceil((new Date(ate).getTime() - agora) / 86_400_000));
}

export function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
}

/**
 * A marca do recurso pelo estado da conta (claude/plano-painel-simples.md, parte 3): "15 dias grátis" antes de
 * experimentar, "faltam N dias" durante o teste e nada depois de liberado. `curto`: a pílula do menu e das
 * abas; `longo`: o selo do alto das páginas (no teste, a faixa dos dias já diz). Sem o estado (antes da
 * migração), a marca de sempre.
 */
export function marcaDoRecurso(
  estado: EstadoRecurso | null | undefined,
  agora: number,
): { curto: string | null; longo: string | null } {
  if (!estado) return { curto: "15 dias grátis", longo: "Recurso pago · 15 dias grátis" };
  if (estado.liberado) {
    if (!estado.ate) return { curto: null, longo: null };
    const n = diasRestantes(estado.ate, agora);
    return { curto: n === 1 ? "falta 1 dia" : `faltam ${n} dias`, longo: null };
  }
  if (estado.pode_experimentar) return { curto: "15 dias grátis", longo: "Recurso pago · 15 dias grátis" };
  return { curto: "Recurso pago", longo: "Recurso pago" };
}
