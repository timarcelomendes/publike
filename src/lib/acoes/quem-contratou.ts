"use server";

import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { mensagemDeErro } from "@/lib/erros";
import { fraseDaResposta, type RespostaQuemContratou, type ResultadoQuemContratou } from "@/lib/quem-contratou";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

/**
 * A resposta do "Quem você contratou?" pela página do link (migração 20271006120000), sem entrar: o código do link vale
 * a conta. "contratei" leva as pessoas (só quem foi aceito na vaga); `preencher` tira a vaga do ar e avisa quem ficou.
 */
export async function responderQuemContratou(
  token: string,
  resposta: RespostaQuemContratou,
  perfis: string[] = [],
  preencher = false,
): Promise<Resultado & { resultado?: ResultadoQuemContratou }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!/^[0-9a-f]{64}$/.test(token) || !["contratei", "ainda_nao", "ninguem"].includes(resposta))
    return { ok: false, erro: "Este link não vale. Confira se abriu o link inteiro do e-mail ou do WhatsApp." };
  const ids = [...new Set(perfis.filter((p) => typeof p === "string" && UUID.test(p)))].slice(0, 40);
  if (resposta === "contratei" && !ids.length) return { ok: false, erro: "Toque em quem você contratou." };
  const { data, error } = await (await criarClienteServidor()).rpc("responder_quem_contratou_pelo_link", {
    p_token: token,
    p_resposta: resposta,
    p_perfis: resposta === "contratei" ? ids : [],
    p_preencher: resposta !== "ainda_nao" && preencher,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  // os parabéns de quem foi contratado e o aviso de quem ficou saem já
  after(processarFilas);
  const resultado = (data ?? {}) as ResultadoQuemContratou;
  return { ok: true, mensagem: fraseDaResposta(resultado), resultado };
}
