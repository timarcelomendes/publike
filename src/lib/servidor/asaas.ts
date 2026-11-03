import "server-only";
import { timingSafeEqual } from "node:crypto";

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
//
// As contas de teste marcadas "no sandbox" (Admin › Pagamentos) pagam na conta sandbox do Asaas mesmo com o
// site em produção (claude/plano-pagamentos-sandbox.md). Com ASAAS_AMBIENTE=producao:
//
//   ASAAS_SANDBOX_API_KEY       a chave da API da conta sandbox
//   ASAAS_SANDBOX_WEBHOOK_TOKEN o token do webhook da conta sandbox (diferente do de produção: é por ele que
//                               o aviso diz de qual conta veio)
//
// Cada chamada recebe `sandbox`: a conta de teste paga no sandbox (ou a assinatura foi feita lá). Com o site
// em sandbox, tudo já é sandbox e as variáveis ASAAS_SANDBOX_* não são usadas.

export function asaasProducao() {
  return (process.env.ASAAS_AMBIENTE || "").trim().toLowerCase() === "producao";
}

const env = (nome: string) => (process.env[nome] || "").trim();

/** A conta do Asaas de cada chamada: a principal (ASAAS_AMBIENTE) ou, com o site em produção, a sandbox. */
function credenciais(sandbox: boolean) {
  if (sandbox && asaasProducao())
    return { producao: false, chave: env("ASAAS_SANDBOX_API_KEY"), token: env("ASAAS_SANDBOX_WEBHOOK_TOKEN") };
  return { producao: asaasProducao(), chave: env("ASAAS_API_KEY"), token: env("ASAAS_WEBHOOK_TOKEN") };
}

export function tokenDoWebhook() {
  return credenciais(false).token;
}

/** As chamadas por esta conta do Asaas podem ser feitas (a chave está posta). */
export function asaasConfigurado(sandbox = false) {
  return Boolean(credenciais(sandbox).chave);
}

function base(producao: boolean) {
  const propria = env("ASAAS_API_URL").replace(/\/+$/, "");
  if (propria) return propria;
  return producao ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

/** A página onde quem assina paga com o cartão. */
export function linkDoCheckout(sandbox: boolean, id: string) {
  const propria = env("ASAAS_CHECKOUT_URL").replace(/\/+$/, "");
  const raiz = propria || (credenciais(sandbox).producao ? "https://asaas.com" : "https://sandbox.asaas.com");
  return `${raiz}/checkoutSession/show?id=${encodeURIComponent(id)}`;
}

/** Só o começo e o fim, para conferir qual valor está posto sem mostrar o segredo inteiro. */
export function mascarar(valor: string) {
  if (!valor) return null;
  if (valor.length <= 12) return `${"•".repeat(valor.length)} (${valor.length} caracteres)`;
  return `${valor.slice(0, 6)}…${valor.slice(-4)} (${valor.length} caracteres)`;
}

// o Asaas pede de 32 a 255 caracteres, sem espaço, e diferente da chave da API
function problemaDoToken(t: string, k: string) {
  if (!t) return null;
  if (t.length < 32) return "curto: o Asaas pede 32 caracteres ou mais";
  if (/\s/.test(t)) return "tem espaço";
  if (t === k) return "é igual à chave da API";
  return null;
}

/** O que o admin pode mostrar: posto ou não, a chave só mascarada, e o que está errado no token. */
export function situacaoAsaas() {
  const { chave: k, token: t } = credenciais(false);
  const producao = asaasProducao();
  const sk = env("ASAAS_SANDBOX_API_KEY");
  const st = env("ASAAS_SANDBOX_WEBHOOK_TOKEN");
  return {
    ambiente: producao ? "produção" : "teste (sandbox)",
    producao,
    temChave: Boolean(k),
    chaveMascarada: mascarar(k),
    // a chave de produção começa com $aact_prod_ e a do sandbox com $aact_hmlg_ (quando o prefixo existe)
    chaveDeOutroAmbiente: Boolean(k) && (producao ? /_hmlg_/.test(k) : /_prod_/.test(k)),
    temToken: Boolean(t),
    tokenMascarado: mascarar(t),
    problemaNoToken: problemaDoToken(t, k),
    // a conta sandbox das contas de teste (só conta com o site em produção)
    sandbox: {
      temChave: Boolean(sk),
      chaveMascarada: mascarar(sk),
      chaveDeOutroAmbiente: /_prod_/.test(sk),
      temToken: Boolean(st),
      tokenMascarado: mascarar(st),
      problemaNoToken: st && st === t ? "é igual ao token de produção" : problemaDoToken(st, sk),
    },
  };
}

/** O token inteiro, para copiar e colar no painel do Asaas (só no Admin, no computador do dono). */
export function tokenParaCopiar(sandbox = false) {
  return sandbox ? env("ASAAS_SANDBOX_WEBHOOK_TOKEN") : tokenDoWebhook();
}

/**
 * De qual conta do Asaas veio o aviso, pelo token: null quando não bate com nenhum. Com o site em produção,
 * o token do sandbox também vale (e o aviso é lido no sandbox).
 */
export function contaDoAviso(veio: string | null): { sandbox: boolean } | null {
  if (!veio) return null;
  const igual = (token: string) => {
    if (token.length < 16) return false;
    const a = Buffer.from(token);
    const b = Buffer.from(veio);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  if (igual(credenciais(false).token)) return { sandbox: false };
  if (asaasProducao() && igual(credenciais(true).token)) return { sandbox: true };
  return null;
}

const conferida: Record<"principal" | "sandbox", { em: number; ok: boolean | null } | null> = {
  principal: null,
  sandbox: null,
};

/** A chave é aceita pelo Asaas? (uma consulta leve, guardada por 10 minutos) null: sem chave ou sem resposta. */
export async function chaveAceita(sandbox = false): Promise<boolean | null> {
  if (!credenciais(sandbox).chave) return null;
  const qual = sandbox ? "sandbox" : "principal";
  const c = conferida[qual];
  if (c && Date.now() - c.em < 10 * 60_000) return c.ok;
  let ok: boolean | null;
  try {
    await pedir(sandbox, "GET", "/customers?limit=1");
    ok = true;
  } catch (e) {
    ok = e instanceof ErroAsaas && (e.status === 401 || e.status === 403) ? false : null;
  }
  conferida[qual] = { em: Date.now(), ok };
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

async function pedir<T>(
  sandbox: boolean,
  metodo: "GET" | "POST" | "DELETE",
  caminho: string,
  corpo?: unknown,
): Promise<T> {
  const { chave: k, producao } = credenciais(sandbox);
  if (!k)
    throw new ErroAsaas(
      "Pagamentos não configurados.",
      0,
      sandbox && asaasProducao() ? "sem ASAAS_SANDBOX_API_KEY" : "sem ASAAS_API_KEY",
    );
  let r: Response;
  try {
    r = await fetch(`${base(producao)}${caminho}`, {
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

export function criarCliente(
  sandbox: boolean,
  d: { nome: string; cpfCnpj: string; email: string | null; ref: string },
) {
  return pedir<ClienteAsaas>(sandbox, "POST", "/customers", {
    name: d.nome,
    cpfCnpj: d.cpfCnpj,
    email: d.email || undefined,
    externalReference: d.ref,
    // os avisos e e-mails são do Publike (sem a marca do parceiro)
    notificationDisabled: true,
  });
}

/** O endereço de cobrança e o celular (o checkout do cartão pede; a cidade o Asaas tira do CEP). */
export type EnderecoCobranca = {
  telefone: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string | null;
  bairro: string;
};

export function atualizarCliente(
  sandbox: boolean,
  id: string,
  d: { nome: string; cpfCnpj: string; email: string | null; endereco?: EnderecoCobranca | null },
) {
  const e = d.endereco;
  return pedir<ClienteAsaas>(sandbox, "POST", `/customers/${encodeURIComponent(id)}`, {
    name: d.nome,
    cpfCnpj: d.cpfCnpj,
    email: d.email || undefined,
    ...(e
      ? {
          phone: e.telefone,
          mobilePhone: e.telefone.length === 11 ? e.telefone : undefined,
          postalCode: e.cep,
          address: e.rua,
          addressNumber: e.numero,
          complement: e.complemento || undefined,
          province: e.bairro,
        }
      : {}),
    notificationDisabled: true,
  });
}

export function criarAssinaturaPix(
  sandbox: boolean,
  d: {
    cliente: string;
    valor: number;
    ciclo: "MONTHLY" | "QUARTERLY";
    primeiro: string;
    descricao: string;
    ref: string;
  },
) {
  return pedir<AssinaturaAsaas>(sandbox, "POST", "/subscriptions", {
    customer: d.cliente,
    billingType: "PIX",
    value: d.valor,
    nextDueDate: d.primeiro,
    cycle: d.ciclo,
    description: d.descricao,
    externalReference: d.ref,
  });
}

export function lerAssinatura(sandbox: boolean, id: string) {
  return pedir<AssinaturaAsaas>(sandbox, "GET", `/subscriptions/${encodeURIComponent(id)}`);
}

export async function assinaturasDoCliente(sandbox: boolean, cliente: string) {
  const r = await pedir<Lista<AssinaturaAsaas>>(
    sandbox,
    "GET",
    `/subscriptions?customer=${encodeURIComponent(cliente)}&limit=20`,
  );
  return r?.data ?? [];
}

export async function cobrancasDaAssinatura(sandbox: boolean, id: string) {
  const r = await pedir<Lista<CobrancaAsaas>>(
    sandbox,
    "GET",
    `/subscriptions/${encodeURIComponent(id)}/payments?limit=20`,
  );
  return r?.data ?? [];
}

export function cancelarAssinaturaAsaas(sandbox: boolean, id: string) {
  return pedir<{ deleted?: boolean }>(sandbox, "DELETE", `/subscriptions/${encodeURIComponent(id)}`);
}

export function lerCobranca(sandbox: boolean, id: string) {
  return pedir<CobrancaAsaas>(sandbox, "GET", `/payments/${encodeURIComponent(id)}`);
}

export function pixDaCobranca(sandbox: boolean, id: string) {
  return pedir<PixAsaas>(sandbox, "GET", `/payments/${encodeURIComponent(id)}/pixQrCode`);
}

export function lerNota(sandbox: boolean, id: string) {
  return pedir<NotaAsaas>(sandbox, "GET", `/invoices/${encodeURIComponent(id)}`);
}

/** A nota fiscal de cada cobrança paga da assinatura, emitida pelo Asaas (o serviço vem do Admin). */
export function configurarNota(
  sandbox: boolean,
  assinatura: string,
  d: { servico: string; ehCodigo: boolean; descricao: string | null },
) {
  return pedir<unknown>(sandbox, "POST", `/subscriptions/${encodeURIComponent(assinatura)}/invoiceSettings`, {
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
export function criarCheckout(
  sandbox: boolean,
  d: {
    cliente: string;
    valor: number;
    ciclo: "MONTHLY" | "QUARTERLY";
    primeiro: string;
    nome: string;
    descricao: string;
    voltar: { ok: string; cancelou: string; expirou: string };
  },
) {
  return pedir<{ id: string }>(sandbox, "POST", "/checkouts", {
    billingTypes: ["CREDIT_CARD"],
    chargeTypes: ["RECURRENT"],
    minutesToExpire: 60,
    customer: d.cliente,
    callback: { successUrl: d.voltar.ok, cancelUrl: d.voltar.cancelou, expiredUrl: d.voltar.expirou },
    items: [{ name: d.nome, description: d.descricao, quantity: 1, value: d.valor }],
    subscription: { cycle: d.ciclo, nextDueDate: `${d.primeiro} 00:00:00` },
  });
}
