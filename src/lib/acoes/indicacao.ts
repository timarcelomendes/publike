"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

/** A empresa cria o link de quem vai indicar para a vaga ("João, do caixa"). Devolve o código. */
export async function criarLinkDeIndicacao(
  anuncioId: string,
  nome: string,
): Promise<Resultado & { codigo?: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Vaga não encontrada." };
  const limpo = nome.replace(/\s+/g, " ").trim();
  if (limpo.length < 2) return { ok: false, erro: "Escreva o nome de quem vai indicar." };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta." };
  const { data, error } = await (await criarClienteServidor()).rpc("criar_link_indicacao", {
    p_anuncio: anuncioId,
    p_nome: limpo.slice(0, 60),
  });
  if (error || !data) {
    return {
      ok: false,
      erro:
        error?.code === "PGRST202"
          ? "Isso ainda não está disponível. Tente de novo mais tarde."
          : mensagemDeErro(error, "Não deu para criar o link agora."),
    };
  }
  refresh();
  return { ok: true, codigo: data, mensagem: `Pronto: o link de ${limpo} está pronto para mandar.` };
}
