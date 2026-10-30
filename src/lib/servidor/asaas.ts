import "server-only";

// O parceiro de pagamentos (Asaas; claude/plano-checkout-asaas.md). Só o servidor fala com ele, com a chave
// da conta posta na Vercel (ASAAS_API_KEY, nunca no código nem no banco). O número do cartão nunca passa por
// aqui: o cartão é pago na página do Asaas (o checkout, com a logo do Publike); o Pix sai daqui e aparece
// dentro do Publike.
//
//   ASAAS_AMBIENTE      "producao" ou "sandbox" (sem ele: sandbox)
//   ASAAS_API_KEY       a chave da API da conta
//   ASAAS_WEBHOOK_TOKEN o token que o Asaas manda nos avisos (header asaas-access-token)
//   ASAAS_API_URL       (só em teste) outro endereço da API
//   ASAAS_CHECKOUT_URL  (só em teste) outro endereço da página do checkout

export function asaasProducao() {
  return (process.env.ASAAS_AMBIENTE || "").trim().toLowerCase() === "producao";
}

function chave() {
  return (process.env.ASAAS_API_KEY || "").trim();
}

export function tokenDoWebhook() {
  return (process.env.ASAAS_WEBHOOK_TOKEN || "").trim();
}

export function asaasConfigurado() {
  return Boolean(chave());
}

function base() {
  const propria = (process.env.ASAAS_API_URL || "").trim().replace(/\/+$/, "");
  if (propria) return propria;
  return asaasProducao() ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

/** A página onde quem assina paga com o cartão. */
export function linkDoCheckout(id: string) {
  const propria = (process.env.ASAAS_CHECKOUT_URL || "").trim().replace(/\/+$/, "");
  const raiz = propria || (asaasProducao() ? "https://asaas.com" : "https://sandbox.asaas.com");
  return `${raiz}/checkoutSession/show?id=${encodeURIComponent(id)}`;
}

/** Só o começo e o fim, para conferir qual valor está posto sem mostrar o segredo inteiro. */
export function mascarar(valor: string) {
  if (!valor) return null;
  if (valor.length <= 12) return `${"•".repeat(valor.length)} (${valor.length} caracteres)`;
  return `${valor.slice(0, 6)}…${valor.slice(-4)} (${valor.length} caracteres)`;
}

/** O que o admin pode mostrar: posto ou não, a chave só mascarada, e o que está errado no token. */
export function situacaoAsaas() {
  const k = chave();
  const t = tokenDoWebhook();
  return {
    ambiente: asaasProducao() ? "produção" : "teste (sandbox)",
    producao: asaasProducao(),
    temChave: Boolean(k),
    chaveMascarada: mascarar(k),
    // a chave de produção começa com $aact_prod_ e a do sandbox com $aact_hmlg_ (quando o prefixo existe)
    chaveDeOutroAmbiente: Boolean(k) && (asaasProducao() ? /_hmlg_/.test(k) : /_prod_/.test(k)),
    temToken: Boolean(t),
    tokenMascarado: mascarar(t),
    // o Asaas pede de 32 a 255 caracteres, sem espaço, e diferente da chave da API
    problemaNoToken: !t
      ? null
      : t.length < 32
        ? "curto: o Asaas pede 32 caracteres ou mais"
        : /\s/.test(t)
          ? "tem espaço"
          : t === k
            ? "é igual à chave da API"
            : null,
  };
}

/** O token inteiro, para copiar e colar no painel do Asaas (só no Admin, no computador do dono). */
export function tokenParaCopiar() {
  return tokenDoWebhook();
}

let conferida: { em: number; ok: boolean | null } | null = null;

/** A chave é aceita pelo Asaas? (uma consulta leve, guardada por 10 minutos) null: sem chave ou sem resposta. */
export async function chaveAceita(): Promise<boolean | null> {
  if (!chave()) return null;
  if (conferida && Date.now() - conferida.em < 10 * 60_000) return conferida.ok;
  let ok: boolean | null;
  try {
    await pedir("GET", "/customers?limit=1");
    ok = true;
  } catch (e) {
    ok = e instanceof ErroAsaas && (e.status === 401 || e.status === 403) ? false : null;
  }
  conferida = { em: Date.now(), ok };
  return ok;
}

export class ErroAsaas extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
    /** a descrição do erro como o Asaas mandou (para o log; não vai para a tela) */
    readonly detalhe: string,
  ) {
    super(mensagem);
  }
}

async function pedir<T>(metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
  const k = chave();
  if (!k) throw new ErroAsaas("Pagamentos não configurados.", 0, "sem ASAAS_API_KEY");
  let r: Response;
  try {
    r = await fetch(`${base()}${caminho}`, {
      method: metodo,
      headers: {
        access_token: k,
        "User-Agent": "Publike",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw new ErroAsaas("O parceiro de pagamentos não respondeu. Tente de novo.", 0, String(e).slice(0, 300));
  }
  const texto = await r.text();
  let dados: unknown = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = null;
  }
  if (!r.ok) {
    const erros = (dados as { errors?: { description?: string }[] } | null)?.errors;
    const detalhe =
      erros
        ?.map((e) => e.description)
        .filter(Boolean)
        .join(" | ") || texto.slice(0, 300);
    throw new ErroAsaas("O parceiro de pagamentos recusou o pedido.", r.status, detalhe);
  }
  return dados as T;
}

// ------------------------------------------------------------------ tipos (só o que o Publike usa)

export type ClienteAsaas = { id: string };

export type AssinaturaAsaas = {
  id: string;
  customer: string;
  status?: string;
  cycle?: string;
  value?: number;
  nextDueDate?: string;
  description?: string | null;
  billingType?: string;
  deleted?: boolean;
};

export type CobrancaAsaas = {
  id: string;
  customer?: string;
  subscription?: string | null;
  status: string;
  value: number;
  dueDate: string;
  billingType?: string;
  invoiceUrl?: string | null;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  deleted?: boolean;
  creditCard?: { creditCardNumber?: string | null; creditCardBrand?: string | null } | null;
};

export type PixAsaas = { encodedImage: string; payload: string; expirationDate?: string | null };

export type NotaAsaas = {
  id: string;
  payment?: string | null;
  status: string;
  number?: string | null;
  statusDescription?: string | null;
  pdfUrl?: string | null;
};

type Lista<T> = { data: T[] };

// ------------------------------------------------------------------ chamadas

export function criarCliente(d: { nome: string; cpfCnpj: string; email: string | null; ref: string }) {
  return pedir<ClienteAsaas>("POST", "/customers", {
    name: d.nome,
    cpfCnpj: d.cpfCnpj,
    email: d.email || undefined,
    externalReference: d.ref,
    // os avisos e e-mails são do Publike (sem a marca do parceiro)
    notificationDisabled: true,
  });
}

export function atualizarCliente(id: string, d: { nome: string; cpfCnpj: string; email: string | null }) {
  return pedir<ClienteAsaas>("POST", `/customers/${encodeURIComponent(id)}`, {
    name: d.nome,
    cpfCnpj: d.cpfCnpj,
    email: d.email || undefined,
    notificationDisabled: true,
  });
}

export function criarAssinaturaPix(d: {
  cliente: string;
  valor: number;
  ciclo: "MONTHLY" | "QUARTERLY";
  primeiro: string;
  descricao: string;
  ref: string;
}) {
  return pedir<AssinaturaAsaas>("POST", "/subscriptions", {
    customer: d.cliente,
    billingType: "PIX",
    value: d.valor,
    nextDueDate: d.primeiro,
    cycle: d.ciclo,
    description: d.descricao,
    externalReference: d.ref,
  });
}

export function lerAssinatura(id: string) {
  return pedir<AssinaturaAsaas>("GET", `/subscriptions/${encodeURIComponent(id)}`);
}

export async function assinaturasDoCliente(cliente: string) {
  const r = await pedir<Lista<AssinaturaAsaas>>(
    "GET",
    `/subscriptions?customer=${encodeURIComponent(cliente)}&limit=20`,
  );
  return r?.data ?? [];
}

export async function cobrancasDaAssinatura(id: string) {
  const r = await pedir<Lista<CobrancaAsaas>>("GET", `/subscriptions/${encodeURIComponent(id)}/payments?limit=20`);
  return r?.data ?? [];
}

export function cancelarAssinaturaAsaas(id: string) {
  return pedir<{ deleted?: boolean }>("DELETE", `/subscriptions/${encodeURIComponent(id)}`);
}

export function lerCobranca(id: string) {
  return pedir<CobrancaAsaas>("GET", `/payments/${encodeURIComponent(id)}`);
}

export function pixDaCobranca(id: string) {
  return pedir<PixAsaas>("GET", `/payments/${encodeURIComponent(id)}/pixQrCode`);
}

export function lerNota(id: string) {
  return pedir<NotaAsaas>("GET", `/invoices/${encodeURIComponent(id)}`);
}

/** A nota fiscal de cada cobrança paga da assinatura, emitida pelo Asaas (o serviço vem do Admin). */
export function configurarNota(
  assinatura: string,
  d: { servico: string; ehCodigo: boolean; descricao: string | null },
) {
  return pedir<unknown>("POST", `/subscriptions/${encodeURIComponent(assinatura)}/invoiceSettings`, {
    ...(d.ehCodigo ? { municipalServiceCode: d.servico } : { municipalServiceId: d.servico }),
    effectiveDatePeriod: "ON_PAYMENT_CONFIRMATION",
    observations: d.descricao || undefined,
    deductions: 0,
    receivedOnly: true,
    taxes: { retainIss: false, iss: 0, cofins: 0, csll: 0, inss: 0, ir: 0, pis: 0 },
  });
}

/**
 * O checkout do cartão (a página do Asaas): a assinatura nasce lá, quando o cartão passa. `primeiro` é a data
 * da primeira cobrança (no teste grátis, o fim do teste).
 */
export function criarCheckout(d: {
  cliente: string;
  valor: number;
  ciclo: "MONTHLY" | "QUARTERLY";
  primeiro: string;
  nome: string;
  descricao: string;
  voltar: { ok: string; cancelou: string; expirou: string };
}) {
  return pedir<{ id: string }>("POST", "/checkouts", {
    billingTypes: ["CREDIT_CARD"],
    chargeTypes: ["RECURRENT"],
    minutesToExpire: 60,
    customer: d.cliente,
    callback: { successUrl: d.voltar.ok, cancelUrl: d.voltar.cancelou, expiredUrl: d.voltar.expirou },
    items: [{ name: d.nome, description: d.descricao, quantity: 1, value: d.valor }],
    subscription: { cycle: d.ciclo, nextDueDate: `${d.primeiro} 00:00:00` },
  });
}
