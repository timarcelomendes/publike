"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO, SITE_URL } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { documentoValido } from "@/lib/documento";
import { ehRecursoPago, NOME_RECURSO, type RecursoPago } from "@/lib/recursos-pagos";
import {
  asaasConfigurado,
  atualizarCliente,
  cancelarAssinaturaAsaas,
  criarAssinaturaPix,
  criarCheckout,
  criarCliente,
  ErroAsaas,
  linkDoCheckout,
} from "@/lib/servidor/asaas";
import { enviarPushPendentes } from "@/lib/servidor/filas";
import { acessoPagamentos, sincronizarAssinatura } from "@/lib/servidor/pagamentos";

// Assinar o Copiloto ou os Testes Publike (claude/plano-checkout-asaas.md). O cartão é pago na página do
// parceiro (o número nunca passa pelo Publike); o Pix é mostrado aqui. O banco confere de novo quem pode.

type Contexto = {
  pode: boolean;
  nome: string | null;
  email: string | null;
  cliente: { asaas_id: string; cpf_cnpj: string; nome: string; email: string | null } | null;
  planos: { id: string; recurso: RecursoPago; ciclo: "MONTHLY" | "QUARTERLY"; valor: number }[];
  ativas: RecursoPago[];
  sem_prazo: Record<RecursoPago, boolean>;
  testes_ate: Partial<Record<RecursoPago, string>> | null;
  pago_ate: Partial<Record<RecursoPago, string>> | null;
};

export type ResultadoAssinar = { ok: true; ir: string; externo?: boolean } | { ok: false; erro: string };

const CICLO: Record<string, string> = { MONTHLY: "mensal", QUARTERLY: "trimestral" };

/** "AAAA-MM-DD" no horário de Brasília. */
function diaBr(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function erroParaTela(e: unknown) {
  if (e instanceof ErroAsaas) {
    console.error("Publike: pagamento recusado pelo parceiro:", e.status, e.detalhe);
    if (e.status === 400 && /cpf|cnpj/i.test(e.detalhe)) return "O parceiro de pagamentos não aceitou o CPF ou CNPJ.";
    return e.message;
  }
  console.error("Publike: falha ao assinar:", e instanceof Error ? e.message : e);
  return "Não deu para assinar agora. Tente de novo em instantes.";
}

async function quemAssina(): Promise<{ erro: string } | { conta: string }> {
  if (MODO_DEMO) return { erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) return { erro: "Entre na sua conta." };
  if (usuario.papel === "recrutador") return { erro: "Só quem administra a conta pode assinar." };
  if (!asaasConfigurado()) return { erro: "Os pagamentos ainda não estão ligados." };
  return { conta: usuario.id };
}

export async function assinar(dados: {
  plano: string;
  forma: "cartao" | "pix";
  documento: string;
  nome: string;
  email: string;
  /** trocar o cartão (ou passar do Pix para o cartão) da assinatura que já vale */
  troca?: boolean;
}): Promise<ResultadoAssinar> {
  const q = await quemAssina();
  if ("erro" in q) return { ok: false, erro: q.erro };
  const conta = q.conta;
  if (dados.forma !== "cartao" && dados.forma !== "pix") return { ok: false, erro: "Escolha cartão ou Pix." };
  const documento = documentoValido(dados.documento);
  if (!documento) return { ok: false, erro: "Confira o CPF ou o CNPJ." };
  const nome = dados.nome.replace(/\s+/g, " ").trim().slice(0, 120);
  if (nome.length < 2) return { ok: false, erro: "Escreva o nome que vai na nota fiscal." };
  const email = dados.email.trim().slice(0, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: "Confira o e-mail." };

  try {
    const a = acessoPagamentos();
    const { data: pode } = await a.cliente.rpc("servidor_pagamento_tentativa", { p_chave: a.chave, p_conta: conta });
    if (pode !== true) return { ok: false, erro: "Muitas tentativas. Espere uma hora e tente de novo." };
    const { data, error } = await a.cliente.rpc("servidor_pagamento_contexto", { p_chave: a.chave, p_conta: conta });
    if (error || !data) throw new Error(error?.message ?? "sem contexto");
    const ctx = data as unknown as Contexto;
    if (!ctx.pode) return { ok: false, erro: "A assinatura ainda não está aberta para a sua conta." };
    const plano = ctx.planos.find((p) => p.id === dados.plano);
    if (!plano) return { ok: false, erro: "Esse plano não está mais à venda. Atualize a página." };
    if (ctx.sem_prazo[plano.recurso]) return { ok: false, erro: "Esse recurso já está liberado para a sua conta." };
    const troca = dados.troca === true && dados.forma === "cartao";
    if (dados.troca && !troca) return { ok: false, erro: "A troca é só para o cartão." };
    if (troca && !ctx.ativas.includes(plano.recurso)) return { ok: false, erro: "Não há assinatura para trocar." };
    if (!troca && ctx.ativas.includes(plano.recurso))
      return { ok: false, erro: `Você já assina o ${NOME_RECURSO[plano.recurso]}. Veja em Assinatura.` };

    // o cliente no parceiro (um por conta): nome, CPF ou CNPJ e e-mail da nota fiscal
    let cliente = ctx.cliente?.asaas_id ?? null;
    const mudou =
      !ctx.cliente ||
      ctx.cliente.cpf_cnpj !== documento ||
      ctx.cliente.nome !== nome ||
      (ctx.cliente.email ?? "") !== email;
    if (!cliente) {
      cliente = (await criarCliente({ nome, cpfCnpj: documento, email: email || null, ref: conta })).id;
    } else if (mudou) {
      await atualizarCliente(cliente, { nome, cpfCnpj: documento, email: email || null });
    }
    if (mudou) {
      const { error: e2 } = await a.cliente.rpc("servidor_pagamento_cliente", {
        p_chave: a.chave,
        p_conta: conta,
        p_asaas_id: cliente,
        p_cpf_cnpj: documento,
        p_nome: nome,
        p_email: email,
      });
      if (e2) throw new Error(e2.message);
    }

    // a 1ª cobrança: no fim do teste grátis ou do que já está pago (assinar de novo, trocar o cartão); senão, hoje
    const hoje = diaBr(new Date());
    const datas = [ctx.testes_ate?.[plano.recurso], ctx.pago_ate?.[plano.recurso]]
      .filter((d): d is string => Boolean(d))
      .map((d) => diaBr(new Date(d)));
    const primeiro = datas.reduce((m, d) => (d > m ? d : m), hoje);
    const nomeItem = `Publike · ${NOME_RECURSO[plano.recurso]} (${CICLO[plano.ciclo]})`;
    const descricao =
      plano.ciclo === "QUARTERLY"
        ? `${NOME_RECURSO[plano.recurso]} por 3 meses, renovado a cada 3 meses`
        : `${NOME_RECURSO[plano.recurso]} por 1 mês, renovado todo mês`;

    if (dados.forma === "cartao") {
      const volta = `${SITE_URL}/painel/assinatura`;
      const ck = await criarCheckout({
        cliente,
        valor: Number(plano.valor),
        ciclo: plano.ciclo,
        primeiro,
        nome: nomeItem,
        descricao,
        voltar: { ok: `${volta}?cartao=ok`, cancelou: `${volta}?cartao=cancelou`, expirou: `${volta}?cartao=expirou` },
      });
      const { error: e3 } = await a.cliente.rpc("servidor_pagamento_assinatura", {
        p_chave: a.chave,
        p_conta: conta,
        p_plano: plano.id,
        p_forma: "cartao",
        p_asaas_id: "",
        p_checkout_id: ck.id,
        p_proxima: primeiro,
      });
      if (e3) throw new Error(e3.message);
      return { ok: true, ir: linkDoCheckout(ck.id), externo: true };
    }

    const sub = await criarAssinaturaPix({
      cliente,
      valor: Number(plano.valor),
      ciclo: plano.ciclo,
      primeiro,
      descricao: nomeItem,
      ref: conta,
    });
    const { error: e4 } = await a.cliente.rpc("servidor_pagamento_assinatura", {
      p_chave: a.chave,
      p_conta: conta,
      p_plano: plano.id,
      p_forma: "pix",
      p_asaas_id: sub.id,
      p_checkout_id: "",
      p_proxima: primeiro,
    });
    if (e4) throw new Error(e4.message);
    const gravadas = await sincronizarAssinatura(a, sub);
    after(() => enviarPushPendentes());
    const aberta = gravadas?.cobrancas.find((c) => c.situacao === "pendente");
    return { ok: true, ir: aberta ? `/painel/faturas/${aberta.cobranca_id}?pix=1` : "/painel/assinatura?pix=ok" };
  } catch (e) {
    return { ok: false, erro: erroParaTela(e) };
  }
}

/** Cancela: não cobra mais, e o recurso fica até o fim do que já foi pago. */
export async function cancelarAssinatura(
  id: string,
): Promise<{ ok: true; mensagem: string } | { ok: false; erro: string }> {
  const q = await quemAssina();
  if ("erro" in q) return { ok: false, erro: q.erro };
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, erro: "Pedido inválido." };
  try {
    const a = acessoPagamentos();
    const { data } = await a.cliente.rpc("servidor_pagamento_da_conta", {
      p_chave: a.chave,
      p_conta: q.conta,
      p_assinatura: id,
    });
    const ass = data as { asaas_id: string | null; situacao: string; recurso: string } | null;
    if (!ass || !ass.asaas_id) return { ok: false, erro: "Assinatura não encontrada." };
    if (ass.situacao === "cancelada") return { ok: true, mensagem: "Essa assinatura já estava cancelada." };
    await cancelarAssinaturaAsaas(ass.asaas_id);
    const { error } = await a.cliente.rpc("servidor_pagamento_cancelada", {
      p_chave: a.chave,
      p_asaas_id: ass.asaas_id,
    });
    if (error) throw new Error(error.message);
    after(() => enviarPushPendentes());
    refresh();
    const nome = ehRecursoPago(ass.recurso) ? NOME_RECURSO[ass.recurso as RecursoPago] : "recurso";
    return { ok: true, mensagem: `Assinatura cancelada. O ${nome} continua até o fim do que já foi pago.` };
  } catch (e) {
    return { ok: false, erro: erroParaTela(e) };
  }
}
