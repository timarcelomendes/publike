import type { RecursoPago } from "./recursos-pagos";

// O que as telas de Assinar, Assinatura e Faturas leem do banco (migração 20261218120000).

export type Ciclo = "MONTHLY" | "QUARTERLY";

export type Plano = { id: string; recurso: RecursoPago; ciclo: Ciclo; valor: number };

export type Assinatura = {
  id: string;
  recurso: RecursoPago;
  ciclo: Ciclo;
  valor: number;
  forma: "cartao" | "pix";
  situacao: "pendente" | "ativa" | "cancelada";
  cartao_final: string | null;
  cartao_bandeira: string | null;
  proxima_cobranca: string | null;
  criada_em: string;
  cancelada_em: string | null;
  pago_ate: string | null;
};

export type PagamentosDaConta = {
  pode: boolean;
  tipo: string | null;
  planos: Plano[];
  assinaturas: Assinatura[];
  cliente: { cpf_cnpj: string; nome: string; email: string | null } | null;
  testes_ate: Partial<Record<RecursoPago, string>> | null;
  /** até quando já está pago, por recurso (assinar de novo começa a cobrar daí) */
  pago_ate: Partial<Record<RecursoPago, string>> | null;
};

export type SituacaoFatura = "pendente" | "paga" | "atrasada" | "estornada" | "recusada" | "cancelada";

export type Fatura = {
  id: string;
  numero: number;
  recurso: RecursoPago;
  valor: number;
  vencimento: string;
  situacao: SituacaoFatura;
  forma: "cartao" | "pix";
  pago_em: string | null;
  link_pagar: string | null;
  nota: { situacao: "agendada" | "autorizada" | "erro" | "cancelada"; numero: string | null } | null;
};

export type FaturaCompleta = Fatura & {
  periodo_ate: string;
  pix_payload: string | null;
  pix_expira: string | null;
  ciclo: Ciclo | null;
  conta: { nome: string | null; cpf_cnpj: string | null };
};

export const NOME_CICLO: Record<Ciclo, string> = { MONTHLY: "Mensal", QUARTERLY: "A cada 3 meses" };
export const POR_CICLO: Record<Ciclo, string> = { MONTHLY: "por mês", QUARTERLY: "a cada 3 meses" };
export const MESES: Record<Ciclo, number> = { MONTHLY: 1, QUARTERLY: 3 };

export const NOME_SITUACAO: Record<SituacaoFatura, string> = {
  pendente: "Em aberto",
  paga: "Paga",
  atrasada: "Vencida",
  estornada: "Estornada",
  recusada: "Cartão recusado",
  cancelada: "Cancelada",
};

export function emAberto(s: SituacaoFatura) {
  return s === "pendente" || s === "atrasada" || s === "recusada";
}

/** "2026-11-14" (a data do banco, sem hora) em "14 de novembro de 2026". */
export function dataDoDia(dia: string, ano = true) {
  const [a, m, d] = dia.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    ...(ano ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export function dataEHora(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

/** O número da fatura como aparece na tela e no recibo ("Nº 000123"). */
export function numeroDaFatura(n: number) {
  return `Nº ${String(n).padStart(6, "0")}`;
}

export function lerPagamentos(data: unknown): PagamentosDaConta | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Partial<PagamentosDaConta>;
  return {
    pode: o.pode === true,
    tipo: typeof o.tipo === "string" ? o.tipo : null,
    planos: Array.isArray(o.planos) ? o.planos.map((p) => ({ ...p, valor: Number(p.valor) })) : [],
    assinaturas: Array.isArray(o.assinaturas) ? o.assinaturas.map((a) => ({ ...a, valor: Number(a.valor) })) : [],
    cliente: o.cliente ?? null,
    testes_ate: o.testes_ate ?? null,
    pago_ate: o.pago_ate ?? null,
  };
}

export function lerFaturas(data: unknown): Fatura[] {
  return Array.isArray(data) ? (data as Fatura[]).map((f) => ({ ...f, valor: Number(f.valor) })) : [];
}
