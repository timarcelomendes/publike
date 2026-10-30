import "server-only";
import { cache } from "react";
import { obterUsuario } from "@/lib/dados";
import { lerFaturas, lerPagamentos, type FaturaCompleta } from "@/lib/pagamentos";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ErroAsaas, lerNota, pixDaCobranca } from "./asaas";
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
    const c = data as { asaas_id: string; forma: string; situacao: string } | null;
    if (!c || c.forma !== "pix" || !["pendente", "atrasada"].includes(c.situacao)) return null;
    const pix = await pixDaCobranca(c.asaas_id);
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
    const id = (data as { nota_asaas: string | null } | null)?.nota_asaas;
    if (!id) return null;
    const nota = await lerNota(id);
    if (!nota.pdfUrl || !/^https?:\/\//.test(nota.pdfUrl)) return null;
    const r = await fetch(nota.pdfUrl, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    return { pdf: await r.arrayBuffer(), numero: nota.number ?? null };
  } catch (e) {
    console.error("Publike: não deu para ler a nota fiscal:", e instanceof ErroAsaas ? `${e.status} ${e.detalhe}` : e);
    return null;
  }
}
