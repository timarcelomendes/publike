import type { RecursoPago, RecursosPagos } from "./recursos-pagos";

// O que as telas de Assinar, Assinatura e Faturas leem do banco (migração 20261218120000; o combo, 20261220120000).

/** O que se assina: um recurso ou o combo (os dois numa assinatura só). */
export type Produto = RecursoPago | "combo";

export const NOME_PRODUTO: Record<Produto, string> = {
  copiloto: "Triagem com IA",
  testes: "Testes Publike",
  combo: "Combo Triagem + Testes",
};

/** Com o artigo, para as frases ("Assinar a Triagem com IA", "Você já assina os Testes Publike"). */
export const O_PRODUTO: Record<Produto, string> = {
  copiloto: "a Triagem com IA",
  testes: "os Testes Publike",
  combo: "o combo Triagem + Testes",
};

/** Com "de" ("o cartão da Triagem com IA"). */
export const DO_PRODUTO: Record<Produto, string> = {
  copiloto: "da Triagem com IA",
  testes: "dos Testes Publike",
  combo: "do combo Triagem + Testes",
};

export function ehProduto(x: unknown): x is Produto {
  return x === "copiloto" || x === "testes" || x === "combo";
}

/** Os recursos que o produto libera. */
export function recursosDo(p: Produto): RecursoPago[] {
  return p === "combo" ? ["copiloto", "testes"] : [p];
}

export type Ciclo = "MONTHLY" | "QUARTERLY";

export type Plano = { id: string; recurso: Produto; ciclo: Ciclo; valor: number };

export type Assinatura = {
  id: string;
  recurso: Produto;
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
  pago_ate: Partial<Record<Produto, string>> | null;
};

export type SituacaoFatura = "pendente" | "paga" | "atrasada" | "estornada" | "recusada" | "cancelada";

export type Fatura = {
  id: string;
  numero: number;
  recurso: Produto;
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

/**
 * Pode assinar o combo: os pagamentos abertos para a conta, o combo à venda e nenhuma assinatura valendo (quem
 * assina um recurso cancela antes; o que já foi pago continua valendo). Liberado sem prazo nos dois: não paga.
 */
export function podeAssinarCombo(pag: PagamentosDaConta | null, recursos: RecursosPagos | null) {
  if (!pag?.pode || !pag.planos.some((p) => p.recurso === "combo")) return false;
  if (pag.assinaturas.some((a) => a.situacao !== "cancelada")) return false;
  const semPrazo = (r: RecursoPago) => Boolean(recursos?.[r].liberado && !recursos[r].ate);
  return !(semPrazo("copiloto") && semPrazo("testes"));
}

/** "AAAA-MM-DD" no horário de Brasília. */
export function diaBr(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * O dia da 1ª cobrança: o maior entre hoje, o fim do teste grátis e o fim do que já está pago dos recursos que
 * o produto libera (assinar de novo, trocar o cartão ou passar para o combo não cobra o mesmo período duas vezes).
 */
export function diaDaPrimeiraCobranca(
  produto: Produto,
  testesAte: Partial<Record<string, string>> | null | undefined,
  pagoAte: Partial<Record<string, string>> | null | undefined,
  agora = new Date(),
) {
  const hoje = diaBr(agora);
  const chaves = new Set<string>([...recursosDo(produto), produto, "combo"]);
  const datas = [...chaves]
    .flatMap((k) => [recursosDo(produto).includes(k as RecursoPago) ? testesAte?.[k] : undefined, pagoAte?.[k]])
    .filter((d): d is string => Boolean(d))
    .map((d) => diaBr(new Date(d)));
  return datas.reduce((m, d) => (d > m ? d : m), hoje);
}
