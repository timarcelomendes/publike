"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// A vaga ainda está aberta? (migração 20271003120000): o "Ainda está aberta?" de quem procura e o "Sim, continua" de
// quem publicou. A pergunta para a empresa sai pelo robô das filas (das 8h às 20h, no máximo uma a cada 7 dias).

/** Quem procura pergunta. `confirmada`: a empresa já confirmou nos últimos 7 dias (nada a perguntar). */
export async function perguntarSeContinua(anuncioId: string): Promise<Resultado & { confirmada?: boolean }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: `/entrar?next=/anuncio/${anuncioId}` };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("perguntar_se_vaga_continua", { p_anuncio: anuncioId });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Ainda não dá para perguntar. Tente de novo em instantes." };
    return { ok: false, erro: mensagemDeErro(error, "Não deu para perguntar agora. Tente de novo.") };
  }
  if (data === "confirmada") return { ok: true, confirmada: true, mensagem: "A empresa confirmou há pouco: a vaga continua aberta." };
  return { ok: true, mensagem: "Perguntamos à empresa. Avisamos você quando ela responder." };
}

/** Quem publicou confirma que a vaga continua aberta: quem perguntou recebe o aviso. */
export async function confirmarVagaContinua(anuncioId: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: `/entrar?next=/painel/anuncio/${anuncioId}/continua` };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("confirmar_vaga_continua", { p_anuncio: anuncioId });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para confirmar agora. Tente de novo.") };
  // o aviso para quem perguntou sai logo (o sino, o celular e o e-mail)
  after(processarFilas);
  refresh();
  const n = Number(data ?? 0);
  return {
    ok: true,
    mensagem:
      n === 0
        ? "Pronto: a vaga aparece como confirmada aberta."
        : `Pronto: a vaga aparece como confirmada aberta, e ${n === 1 ? "a pessoa que perguntou foi avisada" : `as ${n} pessoas que perguntaram foram avisadas`}.`,
  };
}
