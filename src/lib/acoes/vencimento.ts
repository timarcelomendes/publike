"use server";

import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { RESPOSTAS_VENCIMENTO, type RespostaVencimento, type ResultadoVencimento } from "@/lib/vencimento";

/**
 * A resposta do vencimento pela página do link (migração 20271010120000), sem entrar: o código do link vale a conta.
 * Prorrogar, "Já preenchi" (com o "Quem você contratou?" quando alguém foi aceito) ou "Não preciso mais".
 */
export async function responderVencimento(
  token: string,
  resposta: RespostaVencimento,
): Promise<Resultado & { resultado?: ResultadoVencimento }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!/^[0-9a-f]{64}$/.test(token) || !RESPOSTAS_VENCIMENTO.includes(resposta))
    return { ok: false, erro: "Este link não vale. Confira se abriu o link inteiro do e-mail." };
  const { data, error } = await (await criarClienteServidor()).rpc("responder_vencimento_pelo_link", {
    p_token: token,
    p_resposta: resposta,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  // o retorno de quem esperava sai já
  after(processarFilas);
  return { ok: true, resultado: (data ?? {}) as ResultadoVencimento };
}
