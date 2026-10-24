"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { LIMITES_MENSAGEM_EQUIPE } from "@/lib/mensagem-equipe";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { after } from "next/server";

/** Abriu "Mensagens da equipe": as mensagens e os avisos delas no sino ficam lidos. */
export async function lerMensagensDaEquipe(): Promise<void> {
  if (MODO_DEMO) return;
  const supabase = await criarClienteServidor();
  await supabase.rpc("ler_mensagens_equipe");
}

/** A conta responde uma mensagem da equipe pelo site: aparece no admin e vai por e-mail para a equipe. */
export async function responderMensagemDaEquipe(mensagemId: number, texto: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!Number.isInteger(mensagemId) || mensagemId <= 0) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/mensagens-da-equipe" };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("responder_mensagem_equipe", {
    p_mensagem: mensagemId,
    p_texto: texto.slice(0, LIMITES_MENSAGEM_EQUIPE.resposta + 50),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível mandar a resposta agora.") };
  // o aviso para a equipe vai pela fila de e-mails
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Resposta enviada para a equipe do Publike." };
}
