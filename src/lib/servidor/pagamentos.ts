import "server-only";
import type { Json } from "@/lib/supabase/tipos-banco";
import {
  assinaturasDoCliente,
  cancelarAssinaturaAsaas,
  cobrancasDaAssinatura,
  configurarNota,
  ErroAsaas,
  lerAssinatura,
  lerCobranca,
  lerNota,
  pixDaCobranca,
  type AssinaturaAsaas,
  type CobrancaAsaas,
} from "./asaas";
import { acessoFila } from "./filas";

// O que chega do Asaas vira cobrança no Publike, sempre conferido na API do Asaas (o aviso só diz o que olhar).
// Quem libera o recurso é o banco (servidor_pagamento_cobranca), pelo que foi pago.

type Acesso = NonNullable<ReturnType<typeof acessoFila>>;

type Vinculo = {
  assinatura_id: string;
  conta: string;
  recurso: string;
  situacao: string;
  nota_configurada: boolean;
  asaas_id: string;
};

type Gravada = {
  cobranca_id: string;
  conta: string;
  situacao: string;
  forma: string;
  assinatura_id: string;
  assinatura_situacao: string;
  assinatura_asaas: string;
  nota_configurada: boolean;
  tem_pix: boolean;
};

export function acessoPagamentos(): Acesso {
  const a = acessoFila();
  if (!a) throw new Error("Pagamentos sem acesso ao banco (falta a chave do servidor).");
  return a;
}

function textoDoErro(e: unknown) {
  if (e instanceof ErroAsaas) return `${e.message} (${e.status}) ${e.detalhe}`.slice(0, 480);
  if (e instanceof Error) return e.message.slice(0, 480);
  return String(e).slice(0, 480);
}

async function vincular(a: Acesso, sub: AssinaturaAsaas): Promise<Vinculo | null> {
  const { data, error } = await a.cliente.rpc("servidor_pagamento_vincular", {
    p_chave: a.chave,
    p_sub: sub as unknown as Json,
  });
  if (error) throw new Error(error.message);
  const v = (data as (Vinculo & { trocadas?: string[] }) | null) ?? null;
  // o cartão novo (troca): a assinatura antiga sai do Asaas, para não cobrar duas vezes
  for (const antiga of v?.trocadas ?? []) {
    try {
      await cancelarAssinaturaAsaas(antiga);
    } catch (e) {
      console.error("Publike: não deu para cancelar a assinatura trocada:", textoDoErro(e));
    }
  }
  return v;
}

/** A nota fiscal da assinatura, uma vez (o serviço vem do Admin; sem ele, fica para depois). */
async function garantirNota(a: Acesso, v: { conta: string; assinatura_id: string; asaas_id: string }) {
  const { data } = await a.cliente.rpc("servidor_pagamento_contexto", { p_chave: a.chave, p_conta: v.conta });
  const nota = (data as { nota?: { servico: string; e_codigo: boolean; descricao: string | null } | null } | null)
    ?.nota;
  if (!nota?.servico) return;
  try {
    await configurarNota(v.asaas_id, { servico: nota.servico, ehCodigo: nota.e_codigo, descricao: nota.descricao });
    await a.cliente.rpc("servidor_pagamento_nota_configurada", { p_chave: a.chave, p_assinatura: v.assinatura_id });
  } catch (e) {
    // a cobrança segue; a nota tenta de novo no próximo aviso
    console.error("Publike: não deu para ligar a nota fiscal da assinatura:", textoDoErro(e));
  }
}

/** Grava a cobrança (como o Asaas devolveu) e, no Pix em aberto, o código para pagar. */
export async function gravarCobranca(a: Acesso, pag: CobrancaAsaas, recusada = false): Promise<Gravada | null> {
  if (!pag.subscription) return null;
  let { data, error } = await a.cliente.rpc("servidor_pagamento_cobranca", {
    p_chave: a.chave,
    p_pag: { ...pag, publike_recusada: recusada ? "true" : "false" } as unknown as Json,
  });
  if (error) throw new Error(error.message);
  if (!data) {
    // a assinatura do checkout do cartão ainda não estava ligada: liga e grava de novo
    const v = await vincular(a, await lerAssinatura(pag.subscription));
    if (!v) return null;
    ({ data, error } = await a.cliente.rpc("servidor_pagamento_cobranca", {
      p_chave: a.chave,
      p_pag: { ...pag, publike_recusada: recusada ? "true" : "false" } as unknown as Json,
    }));
    if (error) throw new Error(error.message);
    if (!data) return null;
  }
  const g = data as Gravada;
  if (g.forma === "pix" && !g.tem_pix && (g.situacao === "pendente" || g.situacao === "atrasada")) {
    try {
      const pix = await pixDaCobranca(pag.id);
      await a.cliente.rpc("servidor_pagamento_pix", {
        p_chave: a.chave,
        p_asaas_id: pag.id,
        p_payload: pix.payload,
        p_expira: pix.expirationDate ? new Date(pix.expirationDate.replace(" ", "T") + "-03:00").toISOString() : null,
      });
    } catch (e) {
      console.error("Publike: não deu para ler o Pix da cobrança:", textoDoErro(e));
    }
  }
  if (!g.nota_configurada && g.assinatura_asaas) {
    await garantirNota(a, { conta: g.conta, assinatura_id: g.assinatura_id, asaas_id: g.assinatura_asaas });
  }
  // o Pix que nunca foi pago (a assinatura ainda não valeu) e venceu: a assinatura sai do Asaas
  if (g.situacao === "atrasada" && g.assinatura_situacao === "pendente" && g.assinatura_asaas) {
    try {
      await cancelarAssinaturaAsaas(g.assinatura_asaas);
    } catch (e) {
      console.error("Publike: não deu para cancelar a assinatura sem pagamento:", textoDoErro(e));
    }
    await a.cliente.rpc("servidor_pagamento_cancelada", { p_chave: a.chave, p_asaas_id: g.assinatura_asaas });
  }
  return g;
}

/** A assinatura inteira: liga, grava as cobranças e a nota. */
export async function sincronizarAssinatura(a: Acesso, sub: AssinaturaAsaas) {
  const v = await vincular(a, sub);
  if (!v) return null;
  const cobrancas: Gravada[] = [];
  if (sub.deleted || (sub.status && sub.status.toUpperCase() === "INACTIVE")) {
    await a.cliente.rpc("servidor_pagamento_cancelada", { p_chave: a.chave, p_asaas_id: sub.id });
    return { ...v, cobrancas };
  }
  for (const pag of await cobrancasDaAssinatura(sub.id)) {
    const g = await gravarCobranca(a, pag);
    if (g) cobrancas.push(g);
  }
  if (!v.nota_configurada && !cobrancas.some((c) => c.nota_configurada)) await garantirNota(a, v);
  return { ...v, cobrancas };
}

/** Na volta do checkout (o aviso pode não ter chegado ainda): procura as assinaturas do cliente da conta. */
export async function sincronizarCliente(conta: string) {
  const a = acessoPagamentos();
  const { data } = await a.cliente.rpc("servidor_pagamento_contexto", { p_chave: a.chave, p_conta: conta });
  const cliente = (data as { cliente?: { asaas_id: string } | null } | null)?.cliente?.asaas_id;
  if (!cliente) return;
  for (const sub of await assinaturasDoCliente(cliente)) {
    if (sub.deleted) continue;
    try {
      await sincronizarAssinatura(a, sub);
    } catch (e) {
      console.error("Publike: não deu para conferir a assinatura na volta do checkout:", textoDoErro(e));
    }
  }
}

type Evento = {
  id?: string;
  event?: string;
  payment?: { id?: string } | null;
  subscription?: { id?: string } | null;
  invoice?: { id?: string } | null;
};

const RECUSA = new Set(["PAYMENT_CREDIT_CARD_CAPTURE_REFUSED", "PAYMENT_REPROVED_BY_RISK_ANALYSIS"]);

/** Um aviso do Asaas. Devolve o erro (para o Asaas mandar de novo) ou null. */
export async function processarEvento(evento: Evento): Promise<string | null> {
  const id = evento.id || "";
  const tipo = evento.event || "";
  if (!id || !tipo) return null;
  const a = acessoPagamentos();
  const { data: novo, error } = await a.cliente.rpc("servidor_pagamento_evento", {
    p_chave: a.chave,
    p_id: id,
    p_tipo: tipo,
  });
  if (error) return error.message;
  if (!novo) return null;
  let erro: string | null = null;
  try {
    if (tipo.startsWith("PAYMENT_") && evento.payment?.id) {
      await gravarCobranca(a, await lerCobranca(evento.payment.id), RECUSA.has(tipo));
    } else if (tipo.startsWith("SUBSCRIPTION_") && evento.subscription?.id) {
      if (tipo === "SUBSCRIPTION_DELETED" || tipo === "SUBSCRIPTION_INACTIVATED") {
        await a.cliente.rpc("servidor_pagamento_cancelada", { p_chave: a.chave, p_asaas_id: evento.subscription.id });
      } else {
        await sincronizarAssinatura(a, await lerAssinatura(evento.subscription.id));
      }
    } else if (tipo.startsWith("INVOICE_") && evento.invoice?.id) {
      const nota = await lerNota(evento.invoice.id);
      await a.cliente.rpc("servidor_pagamento_nota", { p_chave: a.chave, p_nota: nota as unknown as Json });
    }
    // os do checkout (CHECKOUT_PAID e os outros) chegam também como SUBSCRIPTION_CREATED e PAYMENT_*
  } catch (e) {
    erro = textoDoErro(e);
    console.error(`Publike: aviso de pagamento ${tipo} com erro:`, erro);
  }
  await a.cliente.rpc("servidor_pagamento_evento_fim", { p_chave: a.chave, p_id: id, p_erro: erro });
  return erro;
}
