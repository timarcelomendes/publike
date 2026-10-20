"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { lerNumeroBR } from "@/lib/numero";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// A colocação de quem a agência contratou para o cliente: o começo, a taxa (e se já recebeu)
// e a garantia de reposição. As regras ficam no banco (salvar_colocacao).

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function salvarColocacao(
  anuncioId: string,
  perfilId: string,
  _anterior: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  const texto = (nome: string) => {
    const v = formData.get(nome);
    return typeof v === "string" ? v.trim() : "";
  };
  const erros: Record<string, string> = {};
  const inicio = texto("inicio");
  if (!DATA.test(inicio)) erros.inicio = "Diga o dia em que a pessoa começou.";
  const taxaBruta = texto("taxa");
  const taxa = taxaBruta ? lerNumeroBR(taxaBruta) : null;
  if (taxa !== null && (!Number.isFinite(taxa) || taxa < 0 || taxa > 10_000_000))
    erros.taxa = "Confira o valor da taxa.";
  const garantia = Number(texto("garantia") || "0");
  if (!Number.isInteger(garantia) || garantia < 0 || garantia > 365) erros.garantia = "A garantia vai de 0 a 365 dias.";
  const saiu = texto("saiu_em");
  if (saiu && !DATA.test(saiu)) erros.saiu_em = "Confira o dia em que a pessoa saiu.";
  else if (saiu && DATA.test(inicio) && saiu < inicio) erros.saiu_em = "A saída vem depois do começo.";
  const nota = texto("nota");
  if (nota.length > 500) erros.nota = "Use no máximo 500 letras.";
  if (Object.keys(erros).length) return { ok: false, erro: "Confira os campos marcados.", erros };

  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_colocacao", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
    p_inicio: inicio,
    p_taxa: taxa,
    p_paga: formData.get("paga") === "on",
    p_garantia_dias: garantia,
    p_saiu_em: saiu || null,
    p_nota: nota || null,
  });
  if (error) {
    const campo =
      error.hint && ["inicio", "taxa", "garantia", "saiu_em", "nota"].includes(error.hint) ? error.hint : null;
    return campo
      ? { ok: false, erro: "Confira os campos marcados.", erros: { [campo]: mensagemDeErro(error) } }
      : { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return { ok: true, mensagem: "Colocação salva." };
}

export async function apagarColocacao(anuncioId: string, perfilId: string): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("apagar_colocacao", { p_anuncio: anuncioId, p_perfil: perfilId });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Colocação apagada." };
}
