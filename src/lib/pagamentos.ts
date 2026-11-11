import type { Liberavel, RecursoPago, RecursosPagos } from "./recursos-pagos";

// O que as telas de Assinar, Assinatura e Faturas leem do banco (migração 20261218120000; o combo, 20261220120000).

/**
 * O que se assina: um recurso, o combo (a Triagem e o Teste Prático numa assinatura só) ou o Plano Completo (os
 * quatro recursos numa assinatura só; migração 20270116120000).
 */
/** Os planos por faixa de vagas no ar (migração 20270407120000): liberam tudo, como o Plano Completo. */
export type PlanoPorFaixa = "empresa_5" | "empresa_20" | "empresa_50" | "agencia_15" | "agencia_200";
export const PLANOS_POR_FAIXA: PlanoPorFaixa[] = ["empresa_5", "empresa_20", "empresa_50", "agencia_15", "agencia_200"];
export function ehPlanoPorFaixa(x: unknown): x is PlanoPorFaixa {
  return (PLANOS_POR_FAIXA as unknown[]).includes(x);
}

export type Produto = RecursoPago | "combo" | "completo" | "salarios" | "carreiras" | PlanoPorFaixa;

/** Os pacotes: liberam mais de um recurso. */
export const PACOTES = ["completo", "combo", "empresa_5", "empresa_20", "empresa_50", "agencia_15", "agencia_200"] as const;

export const NOME_PRODUTO: Record<Produto, string> = {
  copiloto: "Triagem com IA",
  testes: "Teste Prático",
  combo: "Combo Triagem + Teste Prático",
  completo: "Plano Completo",
  video: "Entrevista em vídeo",
  automacoes: "Automações personalizadas",
  salarios: "Consulta de salários",
  carreiras: "Página de carreiras",
  empresa_5: "Plano Empresa até 5 vagas",
  empresa_20: "Plano Empresa até 20 vagas",
  empresa_50: "Plano Empresa até 50 vagas",
  agencia_15: "Plano Agência até 15 vagas",
  agencia_200: "Plano Agência até 200 vagas",
};

/** Com o artigo, para as frases ("Assinar a Triagem com IA", "Você já assina o Teste Prático"). */
export const O_PRODUTO: Record<Produto, string> = {
  copiloto: "a Triagem com IA",
  testes: "o Teste Prático",
  combo: "o combo Triagem + Teste Prático",
  completo: "o Plano Completo",
  video: "a Entrevista em vídeo",
  automacoes: "as Automações personalizadas",
  salarios: "a Consulta de salários",
  carreiras: "a Página de carreiras",
  empresa_5: "o Plano Empresa até 5 vagas",
  empresa_20: "o Plano Empresa até 20 vagas",
  empresa_50: "o Plano Empresa até 50 vagas",
  agencia_15: "o Plano Agência até 15 vagas",
  agencia_200: "o Plano Agência até 200 vagas",
};

/** Com "de" ("o cartão da Triagem com IA"). */
export const DO_PRODUTO: Record<Produto, string> = {
  copiloto: "da Triagem com IA",
  testes: "do Teste Prático",
  combo: "do combo Triagem + Teste Prático",
  completo: "do Plano Completo",
  video: "da Entrevista em vídeo",
  automacoes: "das Automações personalizadas",
  salarios: "da Consulta de salários",
  carreiras: "da Página de carreiras",
  empresa_5: "do Plano Empresa até 5 vagas",
  empresa_20: "do Plano Empresa até 20 vagas",
  empresa_50: "do Plano Empresa até 50 vagas",
  agencia_15: "do Plano Agência até 15 vagas",
  agencia_200: "do Plano Agência até 200 vagas",
};

export function ehProduto(x: unknown): x is Produto {
  return (
    x === "copiloto" ||
    x === "testes" ||
    x === "combo" ||
    x === "completo" ||
    x === "video" ||
    x === "automacoes" ||
    x === "salarios" ||
    x === "carreiras" ||
    ehPlanoPorFaixa(x)
  );
}

/** Os recursos que o produto libera. */
export function recursosDo(p: Produto): Liberavel[] {
  // o Plano Completo libera a Página de carreiras também (qualquer assinatura libera; migração 20270406120000)
  if (p === "completo" || ehPlanoPorFaixa(p)) return ["copiloto", "testes", "video", "automacoes", "salarios", "carreiras"];
  return p === "combo" ? ["copiloto", "testes"] : [p];
}

/** Dois produtos que liberam um mesmo recurso não valem juntos (cancela um para assinar o outro). */
export function seCruzam(a: Produto, b: Produto) {
  const de = recursosDo(b);
  return recursosDo(a).some((r) => de.includes(r));
}

/** O primeiro libera tudo o que o segundo libera ("o Plano Completo já inclui a Triagem com IA"). */
export function jaInclui(pacote: Produto, p: Produto) {
  const de = recursosDo(pacote);
  return recursosDo(p).every((r) => de.includes(r));
}

/**
 * O ciclo do plano: mensal, a cada 3 meses, anual (YEARLY, só nos planos por faixa) ou AVULSO, o plano por 30 dias
 * sem renovar (uma cobrança só; migração 20270416120000). A assinatura nunca é AVULSO.
 */
export type Ciclo = "MONTHLY" | "QUARTERLY" | "YEARLY" | "AVULSO";
export type CicloDeAssinatura = Exclude<Ciclo, "AVULSO">;

export type Plano = {
  id: string;
  recurso: Produto;
  ciclo: Ciclo;
  valor: number;
  /** os planos por faixa: até quantas vagas no ar (migração 20270407120000) */
  limite_vagas?: number | null;
};

export type Assinatura = {
  id: string;
  recurso: Produto;
  ciclo: CicloDeAssinatura;
  valor: number;
  forma: "cartao" | "pix";
  situacao: "pendente" | "ativa" | "cancelada";
  cartao_final: string | null;
  cartao_bandeira: string | null;
  proxima_cobranca: string | null;
  criada_em: string;
  cancelada_em: string | null;
  pago_ate: string | null;
  /** o arrependimento do anual: a 1ª cobrança paga há até 7 dias (até quando dá para pedir de volta) */
  devolver?: { cobranca: string; ate: string; valor: number } | null;
};

/** O plano por 30 dias (que vale ou espera o pagamento) ou a troca de faixa esperando o pagamento. */
export type Compra = {
  id: string;
  tipo: "trinta_dias" | "faixa";
  recurso: Produto;
  valor: number;
  forma: "cartao" | "pix";
  situacao: "pendente" | "paga" | "cancelada" | "estornada";
  ate: string | null;
  paga_em: string | null;
  criada_em: string;
  /** a cobrança da compra (a fatura) */
  cobranca: string | null;
  /** ainda dá para desistir e receber de volta (até 7 dias do pagamento) */
  devolver: boolean;
};

export type PagamentosDaConta = {
  pode: boolean;
  tipo: string | null;
  planos: Plano[];
  assinaturas: Assinatura[];
  compras: Compra[];
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
  /** a cobrança avulsa: o plano por 30 dias ou a diferença da troca de faixa */
  compra?: "trinta_dias" | "faixa" | null;
  nota: { situacao: "agendada" | "autorizada" | "erro" | "cancelada"; numero: string | null } | null;
};

export type FaturaCompleta = Fatura & {
  periodo_ate: string;
  pix_payload: string | null;
  pix_expira: string | null;
  ciclo: Ciclo | null;
  conta: { nome: string | null; cpf_cnpj: string | null };
};

export const NOME_CICLO: Record<Ciclo, string> = {
  MONTHLY: "Mensal",
  QUARTERLY: "A cada 3 meses",
  YEARLY: "Anual",
  AVULSO: "30 dias, sem renovar",
};
export const POR_CICLO: Record<Ciclo, string> = {
  MONTHLY: "por mês",
  QUARTERLY: "a cada 3 meses",
  YEARLY: "por ano",
  AVULSO: "por 30 dias",
};
export const MESES: Record<Ciclo, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12, AVULSO: 1 };

/** O plano de 30 dias de um produto, à venda. */
export function planoDeTrintaDias(pag: PagamentosDaConta | null, produto: Produto) {
  return pag?.planos.find((p) => p.recurso === produto && p.ciclo === "AVULSO") ?? null;
}

/** "Mudar de faixa": a assinatura de plano por faixa que vale e as faixas de cima da mesma família (Empresa ou Agência). */
export function faixasDeCima(pag: PagamentosDaConta | null) {
  const a = pag?.assinaturas.find((x) => x.situacao === "ativa" && ehPlanoPorFaixa(x.recurso));
  if (!a) return { assinatura: null, faixas: [] as Plano[] };
  const familia = String(a.recurso).split("_")[0];
  // a faixa está no nome ("empresa_20"): vale mesmo com o plano de hoje fora de venda
  const atual = Number(String(a.recurso).split("_")[1]) || 0;
  const faixas = (pag?.planos ?? [])
    .filter(
      (p) =>
        p.ciclo === a.ciclo &&
        ehPlanoPorFaixa(p.recurso) &&
        String(p.recurso).startsWith(familia) &&
        (p.limite_vagas ?? 0) > atual,
    )
    .sort((x, y) => (x.limite_vagas ?? 0) - (y.limite_vagas ?? 0));
  return { assinatura: a, faixas };
}

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
    compras: Array.isArray(o.compras) ? o.compras.map((k) => ({ ...k, valor: Number(k.valor) })) : [],
    cliente: o.cliente ?? null,
    testes_ate: o.testes_ate ?? null,
    pago_ate: o.pago_ate ?? null,
  };
}

export function lerFaturas(data: unknown): Fatura[] {
  return Array.isArray(data) ? (data as Fatura[]).map((f) => ({ ...f, valor: Number(f.valor) })) : [];
}

/**
 * Pode assinar o pacote (o combo ou o Plano Completo): os pagamentos abertos para a conta, o pacote à venda e
 * nenhuma assinatura valendo que se cruze com ele (quem assina um recurso cancela antes; o que já foi pago continua
 * valendo). Liberado sem prazo em todos os recursos do pacote: não paga.
 */
export function podeAssinarPacote(
  pag: PagamentosDaConta | null,
  recursos: RecursosPagos | null,
  pacote: (typeof PACOTES)[number],
) {
  if (!pag?.pode || !pag.planos.some((p) => p.recurso === pacote)) return false;
  if (pag.assinaturas.some((a) => a.situacao !== "cancelada" && seCruzam(a.recurso, pacote))) return false;
  // a Página de carreiras não tem estado em RecursosPagos: conta como não liberada (o servidor confere de novo)
  const semPrazo = (r: Liberavel) => r !== "carreiras" && Boolean(recursos?.[r]?.liberado && !recursos[r].ate);
  return !recursosDo(pacote).every(semPrazo);
}

/** O mensal do pacote e quanto os recursos dele custam separados, por mês (sem algum preço, sem comparação). */
export function economiaDoPacote(pag: PagamentosDaConta | null, pacote: (typeof PACOTES)[number]) {
  const mensal = (r: Produto) => pag?.planos.find((p) => p.recurso === r && p.ciclo === "MONTHLY")?.valor;
  const valor = mensal(pacote);
  const partes = recursosDo(pacote).map(mensal);
  if (valor == null || partes.some((x) => x == null)) return null;
  const separados = partes.reduce<number>((t, x) => t + (x ?? 0), 0);
  return { valor, separados, economia: Math.round((separados - valor) * 100) / 100 };
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
  // o que já foi pago do próprio produto, dos recursos dele e dos pacotes que liberam algum deles
  const chaves = new Set<string>([...recursosDo(produto), produto, ...PACOTES.filter((x) => seCruzam(x, produto))]);
  const datas = [...chaves]
    .flatMap((k) => [recursosDo(produto).includes(k as RecursoPago) ? testesAte?.[k] : undefined, pagoAte?.[k]])
    .filter((d): d is string => Boolean(d))
    .map((d) => diaBr(new Date(d)));
  return datas.reduce((m, d) => (d > m ? d : m), hoje);
}

/**
 * O plano por faixa que cabe na conta: agência verificada (com o Plano Agência à venda) → Agência; senão, Empresa. A
 * faixa é a menor em que as vagas no ar cabem; passou de todas, a maior (publicar nunca trava).
 */
export function planoQueCabe(
  pag: PagamentosDaConta | null,
  faixa: { vagas_no_ar: number; agencia: boolean } | null,
): PlanoPorFaixa | null {
  const aVenda = (pag?.planos ?? []).filter((p) => ehPlanoPorFaixa(p.recurso) && p.ciclo === "MONTHLY");
  const daAgencia = aVenda.filter((p) => String(p.recurso).startsWith("agencia"));
  const lista = (faixa?.agencia && daAgencia.length ? daAgencia : aVenda.filter((p) => String(p.recurso).startsWith("empresa")))
    .slice()
    .sort((a, b) => (a.limite_vagas ?? 0) - (b.limite_vagas ?? 0));
  if (!lista.length) return null;
  const vagas = faixa?.vagas_no_ar ?? 0;
  const cabe = lista.find((p) => (p.limite_vagas ?? 0) >= vagas) ?? lista.at(-1);
  return cabe && ehPlanoPorFaixa(cabe.recurso) ? cabe.recurso : null;
}
