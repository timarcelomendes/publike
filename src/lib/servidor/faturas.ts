import "server-only";
import { cache } from "react";
import { obterUsuario } from "@/lib/dados";
import { lerFaturas, lerPagamentos, type FaturaCompleta } from "@/lib/pagamentos";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { asaasProducao, ErroAsaas, lerNota, pixDaCobranca } from "./asaas";
import { acessoPagamentos } from "./pagamentos";

// As leituras das telas de Assinar, Assinatura e Faturas (só a conta logada; o banco confere).

export const pagamentosDaConta = cache(async () => {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("pagamentos_da_conta");
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler os pagamentos:", error.message);
    return null;
  }
  return lerPagamentos(data);
});

export type DiferencaDeFaixa =
  | { erro: string }
  | {
      assinatura_id: string;
      de: string;
      para: string;
      plano_id: string;
      valor_hoje: number;
      valor_novo: number;
      dias: number;
      pago_ate: string | null;
      diferenca: number;
    };

/** Quanto falta pagar para a assinatura ir para a faixa pedida (migração 20270416120000). Sem a migração: null. */
export async function minhaDiferencaDeFaixa(assinatura: string, recurso: string): Promise<DiferencaDeFaixa | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("minha_diferenca_de_faixa", {
    p_assinatura: assinatura,
    p_recurso: recurso,
  });
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.erro === "string") return { erro: d.erro };
  return {
    ...(d as Omit<Extract<DiferencaDeFaixa, { diferenca: number }>, "valor_hoje" | "valor_novo" | "diferenca">),
    valor_hoje: Number(d.valor_hoje),
    valor_novo: Number(d.valor_novo),
    diferenca: Number(d.diferenca),
  };
}

/** O celular e o endereço de cobrança já informados (para o cartão vir preenchido). Sem a migração: null. */
export async function meuEnderecoDeCobranca(): Promise<{
  telefone: string | null;
  endereco: Partial<Record<"cep" | "rua" | "numero" | "complemento" | "bairro", string>> | null;
} | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("meu_endereco_de_cobranca");
  if (error || !data) return null;
  return data as never;
}

export async function minhasFaturas() {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("minhas_faturas");
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler as faturas:", error.message);
    return [];
  }
  return lerFaturas(data);
}

export async function minhaFatura(id: string): Promise<FaturaCompleta | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("minha_fatura", { p_id: id });
  if (error || !data) return null;
  const f = data as unknown as FaturaCompleta;
  return { ...f, valor: Number(f.valor) };
}

/**
 * A conta logada é de teste e paga no sandbox do Asaas (com o site em produção): a tela de assinar avisa que
 * nada é cobrado de verdade.
 */
export async function pagoNoSandbox(): Promise<boolean> {
  if (!asaasProducao()) return false;
  const usuario = await obterUsuario();
  if (!usuario) return false;
  try {
    const a = acessoPagamentos();
    const { data, error } = await a.cliente.rpc("servidor_pagamento_no_sandbox", {
      p_chave: a.chave,
      p_conta: usuario.id,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

/** O QR do Pix da fatura em aberto, lido na hora (a imagem não fica no banco). */
export async function qrDoPix(cobranca: string): Promise<{ imagem: string; codigo: string } | null> {
  const usuario = await obterUsuario();
  if (!usuario) return null;
  try {
    const a = acessoPagamentos();
    const { data } = await a.cliente.rpc("servidor_pagamento_cobranca_da_conta", {
      p_chave: a.chave,
      p_conta: usuario.id,
      p_cobranca: cobranca,
    });
    const c = data as { asaas_id: string; forma: string; situacao: string; sandbox?: boolean } | null;
    if (!c || c.forma !== "pix" || !["pendente", "atrasada"].includes(c.situacao)) return null;
    const pix = await pixDaCobranca(c.sandbox === true, c.asaas_id);
    if (!/^[A-Za-z0-9+/=]+$/.test(pix.encodedImage)) return null;
    return { imagem: `data:image/png;base64,${pix.encodedImage}`, codigo: pix.payload };
  } catch (e) {
    console.error("Publike: não deu para ler o Pix:", e instanceof ErroAsaas ? `${e.status} ${e.detalhe}` : e);
    return null;
  }
}

/** O PDF da nota fiscal autorizada da fatura (lido no parceiro e entregue pelo Publike). */
export async function pdfDaNota(cobranca: string): Promise<{ pdf: ArrayBuffer; numero: string | null } | null> {
  const usuario = await obterUsuario();
  if (!usuario || !/^[0-9a-f-]{36}$/.test(cobranca)) return null;
  try {
    const a = acessoPagamentos();
    const { data } = await a.cliente.rpc("servidor_pagamento_cobranca_da_conta", {
      p_chave: a.chave,
      p_conta: usuario.id,
      p_cobranca: cobranca,
    });
    const c = data as { nota_asaas: string | null; sandbox?: boolean } | null;
    if (!c?.nota_asaas) return null;
    const nota = await lerNota(c.sandbox === true, c.nota_asaas);
    if (!nota.pdfUrl || !/^https?:\/\//.test(nota.pdfUrl)) return null;
    const r = await fetch(nota.pdfUrl, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    return { pdf: await r.arrayBuffer(), numero: nota.number ?? null };
  } catch (e) {
    console.error("Publike: não deu para ler a nota fiscal:", e instanceof ErroAsaas ? `${e.status} ${e.detalhe}` : e);
    return null;
  }
}
