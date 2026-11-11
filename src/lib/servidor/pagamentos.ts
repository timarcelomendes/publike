import "server-only";
import type { Json } from "@/lib/supabase/tipos-banco";
import { NOME_PRODUTO, PACOTES, ehProduto, substituiSozinho } from "@/lib/pagamentos";
import {
  assinaturasDoCliente,
  atualizarAssinatura,
  cancelarAssinaturaAsaas,
  cobrancasDaAssinatura,
  cobrancasDoCliente,
  configurarNota,
  criarNotaDaCobranca,
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

async function vincular(a: Acesso, sandbox: boolean, sub: AssinaturaAsaas): Promise<Vinculo | null> {
  const { data, error } = await a.cliente.rpc("servidor_pagamento_vincular", {
    p_chave: a.chave,
    p_sub: sub as unknown as Json,
  });
  if (error) throw new Error(error.message);
  const v = (data as (Vinculo & { trocadas?: string[] }) | null) ?? null;
  // o cartão novo (troca): a assinatura antiga sai do Asaas, para não cobrar duas vezes
  for (const antiga of v?.trocadas ?? []) {
    try {
      await cancelarAssinaturaAsaas(sandbox, antiga);
    } catch (e) {
      console.error("Publike: não deu para cancelar a assinatura trocada:", textoDoErro(e));
    }
  }
  // o plano que começou a valer (o cartão ligado) tira o que ele substitui
  if (v?.situacao === "ativa" && (PACOTES as readonly string[]).includes(v.recurso)) {
    await pararAsSubstituidas(a, v.conta, v.asaas_id);
  }
  return v;
}

type DaConta = { id: string; recurso: string; asaas_id: string | null; situacao: string; sandbox?: boolean };

/**
 * O pacote que começou a valer (o plano por faixa, o Plano Completo ou o combo) cancela sozinho as assinaturas que
 * ele substitui (o Teste Prático sozinho, o combo...; substituiSozinho em src/lib/pagamentos.ts): assinar o plano não
 * pede para cancelar antes e não cobra duas vezes. O que já foi pago delas continua valendo até o fim. Nunca trava o
 * pagamento: deu erro, fica para o próximo aviso (migração 20270421120000).
 */
async function pararAsSubstituidas(a: Acesso, conta: string, asaasDoNovo: string) {
  try {
    const { data, error } = await a.cliente.rpc("servidor_assinaturas_da_conta", { p_chave: a.chave, p_conta: conta });
    if (error) {
      // sem a migração: segue como antes (quem assina cancela à mão)
      if (error.code !== "PGRST202") console.error("Publike: não deu para ler as assinaturas da conta:", error.message);
      return;
    }
    const lista = (data ?? []) as DaConta[];
    const novo = lista.find((x) => x.asaas_id === asaasDoNovo && x.situacao === "ativa");
    if (!novo || !ehProduto(novo.recurso)) return;
    for (const x of lista) {
      if (x.id === novo.id || !x.asaas_id || x.situacao === "cancelada") continue;
      if (!ehProduto(x.recurso) || !substituiSozinho(novo.recurso, x.recurso)) continue;
      try {
        await cancelarAssinaturaAsaas(x.sandbox === true, x.asaas_id);
      } catch (e) {
        // já não existe no Asaas: só falta marcar aqui; senão, tenta de novo no próximo aviso
        if (!(e instanceof ErroAsaas && e.status === 404)) {
          console.error("Publike: não deu para cancelar a assinatura substituída:", textoDoErro(e));
          continue;
        }
      }
      await a.cliente.rpc("servidor_pagamento_cancelada", { p_chave: a.chave, p_asaas_id: x.asaas_id });
    }
  } catch (e) {
    console.error("Publike: não deu para cancelar as assinaturas substituídas:", textoDoErro(e));
  }
}

/** A nota fiscal da assinatura, uma vez (o serviço vem do Admin; sem ele, fica para depois). */
async function garantirNota(
  a: Acesso,
  sandbox: boolean,
  v: { conta: string; assinatura_id: string; asaas_id: string },
) {
  const { data } = await a.cliente.rpc("servidor_pagamento_contexto", { p_chave: a.chave, p_conta: v.conta });
  const nota = (data as { nota?: { servico: string; e_codigo: boolean; descricao: string | null } | null } | null)
    ?.nota;
  if (!nota?.servico) return;
  try {
    await configurarNota(sandbox, v.asaas_id, {
      servico: nota.servico,
      ehCodigo: nota.e_codigo,
      descricao: nota.descricao,
    });
    await a.cliente.rpc("servidor_pagamento_nota_configurada", { p_chave: a.chave, p_assinatura: v.assinatura_id });
  } catch (e) {
    // a cobrança segue; a nota tenta de novo no próximo aviso
    console.error("Publike: não deu para ligar a nota fiscal da assinatura:", textoDoErro(e));
  }
}

type GravadaAvulsa = {
  cobranca_id: string;
  conta: string;
  recurso: string;
  situacao: string;
  forma: string;
  compra_id: string;
  tipo: "trinta_dias" | "faixa";
  tem_pix: boolean;
  paga_agora: boolean;
  nota: boolean;
  trocar_assinatura: { asaas_id: string | null; valor: number; recurso: string; ciclo: string } | null;
};

/** O Pix da cobrança em aberto, para pagar dentro do Publike. */
async function guardarPix(a: Acesso, sandbox: boolean, id: string) {
  try {
    const pix = await pixDaCobranca(sandbox, id);
    await a.cliente.rpc("servidor_pagamento_pix", {
      p_chave: a.chave,
      p_asaas_id: id,
      p_payload: pix.payload,
      p_expira: pix.expirationDate ? new Date(pix.expirationDate.replace(" ", "T") + "-03:00").toISOString() : null,
    });
  } catch (e) {
    console.error("Publike: não deu para ler o Pix da cobrança:", textoDoErro(e));
  }
}

/**
 * A cobrança avulsa (o plano por 30 dias ou a diferença da troca de faixa; migração 20270416120000): grava; quando
 * a troca de faixa é paga, muda o valor da renovação no Asaas; quando é paga, pede a nota fiscal.
 */
export async function gravarAvulsa(a: Acesso, sandbox: boolean, pag: CobrancaAsaas, recusada: boolean) {
  const { data, error } = await a.cliente.rpc("servidor_pagamento_avulsa", {
    p_chave: a.chave,
    p_pag: { ...pag, publike_recusada: recusada ? "true" : "false" } as unknown as Json,
  });
  if (error) throw new Error(error.message);
  const g = (data as GravadaAvulsa | null) ?? null;
  if (!g) return null;
  if (g.forma === "pix" && !g.tem_pix && (g.situacao === "pendente" || g.situacao === "atrasada")) {
    await guardarPix(a, sandbox, pag.id);
  }
  const t = g.trocar_assinatura;
  if (t?.asaas_id) {
    const nome = ehProduto(t.recurso) ? NOME_PRODUTO[t.recurso] : "Plano";
    try {
      await atualizarAssinatura(sandbox, t.asaas_id, { valor: Number(t.valor), descricao: `Publike · ${nome}` });
    } catch (e) {
      // a faixa já mudou no Publike; o valor da renovação fica para o Admin conferir
      console.error("Publike: não deu para mudar o valor da assinatura no parceiro:", textoDoErro(e));
    }
  }
  if (g.situacao === "paga" && !g.nota) {
    const { data: ctx } = await a.cliente.rpc("servidor_pagamento_contexto", { p_chave: a.chave, p_conta: g.conta });
    const nota = (ctx as { nota?: { servico: string; e_codigo: boolean; descricao: string | null } | null } | null)
      ?.nota;
    if (nota?.servico) {
      const nome = ehProduto(g.recurso) ? NOME_PRODUTO[g.recurso] : "Publike";
      try {
        await criarNotaDaCobranca(sandbox, {
          cobranca: pag.id,
          valor: Number(pag.value),
          servico: nota.servico,
          ehCodigo: nota.e_codigo,
          descricao: g.tipo === "faixa" ? `${nome}: diferença da troca de faixa` : `${nome}: 30 dias`,
          observacao: nota.descricao,
        });
      } catch (e) {
        // a nota tenta de novo no próximo aviso da cobrança
        console.error("Publike: não deu para pedir a nota da cobrança avulsa:", textoDoErro(e));
      }
    }
  }
  return g;
}

/** Grava a cobrança (como o Asaas devolveu) e, no Pix em aberto, o código para pagar. */
export async function gravarCobranca(
  a: Acesso,
  sandbox: boolean,
  pag: CobrancaAsaas,
  recusada = false,
): Promise<Gravada | null> {
  if (!pag.subscription) {
    await gravarAvulsa(a, sandbox, pag, recusada);
    return null;
  }
  let { data, error } = await a.cliente.rpc("servidor_pagamento_cobranca", {
    p_chave: a.chave,
    p_pag: { ...pag, publike_recusada: recusada ? "true" : "false" } as unknown as Json,
  });
  if (error) throw new Error(error.message);
  if (!data) {
    // a assinatura do checkout do cartão ainda não estava ligada: liga e grava de novo
    const v = await vincular(a, sandbox, await lerAssinatura(sandbox, pag.subscription));
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
    await guardarPix(a, sandbox, pag.id);
  }
  if (!g.nota_configurada && g.assinatura_asaas) {
    await garantirNota(a, sandbox, { conta: g.conta, assinatura_id: g.assinatura_id, asaas_id: g.assinatura_asaas });
  }
  // o Pix do plano pago (a assinatura passou a valer): tira o que ele substitui
  if (g.situacao === "paga" && g.assinatura_situacao === "ativa" && g.assinatura_asaas) {
    await pararAsSubstituidas(a, g.conta, g.assinatura_asaas);
  }
  // o Pix que nunca foi pago (a assinatura ainda não valeu) e venceu: a assinatura sai do Asaas
  if (g.situacao === "atrasada" && g.assinatura_situacao === "pendente" && g.assinatura_asaas) {
    try {
      await cancelarAssinaturaAsaas(sandbox, g.assinatura_asaas);
    } catch (e) {
      console.error("Publike: não deu para cancelar a assinatura sem pagamento:", textoDoErro(e));
    }
    await a.cliente.rpc("servidor_pagamento_cancelada", { p_chave: a.chave, p_asaas_id: g.assinatura_asaas });
  }
  return g;
}

/** A assinatura inteira: liga, grava as cobranças e a nota. */
export async function sincronizarAssinatura(a: Acesso, sandbox: boolean, sub: AssinaturaAsaas) {
  const v = await vincular(a, sandbox, sub);
  if (!v) return null;
  const cobrancas: Gravada[] = [];
  if (sub.deleted || (sub.status && sub.status.toUpperCase() === "INACTIVE")) {
    await a.cliente.rpc("servidor_pagamento_cancelada", { p_chave: a.chave, p_asaas_id: sub.id });
    return { ...v, cobrancas };
  }
  for (const pag of await cobrancasDaAssinatura(sandbox, sub.id)) {
    const g = await gravarCobranca(a, sandbox, pag);
    if (g) cobrancas.push(g);
  }
  if (!v.nota_configurada && !cobrancas.some((c) => c.nota_configurada)) await garantirNota(a, sandbox, v);
  return { ...v, cobrancas };
}

/** Na volta do checkout (o aviso pode não ter chegado ainda): procura as assinaturas do cliente da conta. */
export async function sincronizarCliente(conta: string) {
  const a = acessoPagamentos();
  const { data } = await a.cliente.rpc("servidor_pagamento_contexto", { p_chave: a.chave, p_conta: conta });
  // o cliente é de uma conta do Asaas só (a de produção ou, na conta de teste, a sandbox)
  const c = (data as { cliente?: { asaas_id: string; sandbox?: boolean } | null } | null)?.cliente;
  if (!c?.asaas_id) return;
  const sandbox = c.sandbox === true;
  for (const sub of await assinaturasDoCliente(sandbox, c.asaas_id)) {
    if (sub.deleted) continue;
    try {
      await sincronizarAssinatura(a, sandbox, sub);
    } catch (e) {
      console.error("Publike: não deu para conferir a assinatura na volta do checkout:", textoDoErro(e));
    }
  }
  // as cobranças avulsas (o plano por 30 dias e a troca de faixa) não estão em nenhuma assinatura
  try {
    for (const pag of await cobrancasDoCliente(sandbox, c.asaas_id)) {
      if (pag.subscription || pag.deleted) continue;
      await gravarAvulsa(a, sandbox, pag, false);
    }
  } catch (e) {
    console.error("Publike: não deu para conferir as compras na volta do checkout:", textoDoErro(e));
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

/**
 * Um aviso do Asaas. Devolve o erro (para o Asaas mandar de novo) ou null. `sandbox`: veio da conta sandbox
 * (pelo token), e tudo é lido lá.
 */
export async function processarEvento(evento: Evento, sandbox = false): Promise<string | null> {
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
      await gravarCobranca(a, sandbox, await lerCobranca(sandbox, evento.payment.id), RECUSA.has(tipo));
    } else if (tipo.startsWith("SUBSCRIPTION_") && evento.subscription?.id) {
      if (tipo === "SUBSCRIPTION_DELETED" || tipo === "SUBSCRIPTION_INACTIVATED") {
        await a.cliente.rpc("servidor_pagamento_cancelada", { p_chave: a.chave, p_asaas_id: evento.subscription.id });
      } else {
        await sincronizarAssinatura(a, sandbox, await lerAssinatura(sandbox, evento.subscription.id));
      }
    } else if (tipo.startsWith("INVOICE_") && evento.invoice?.id) {
      const nota = await lerNota(sandbox, evento.invoice.id);
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
