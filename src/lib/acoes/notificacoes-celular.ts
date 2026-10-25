"use server";

import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

/** Liga as notificações no celular neste aparelho (a inscrição que o navegador criou). */
export async function salvarInscricaoPush(dados: {
  endpoint: string;
  p256dh: string;
  auth: string;
  navegador?: string;
}): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar" };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_inscricao_push", {
    p_endpoint: String(dados.endpoint ?? "").slice(0, 1000),
    p_p256dh: String(dados.p256dh ?? "").slice(0, 100),
    p_auth: String(dados.auth ?? "").slice(0, 40),
    p_navegador: String(dados.navegador ?? "").slice(0, 120),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível ativar as notificações agora.") };
  return { ok: true, mensagem: "Notificações ligadas neste aparelho." };
}

/** Desliga neste aparelho. */
export async function removerInscricaoPush(endpoint: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar" };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("remover_inscricao_push", { p_endpoint: String(endpoint ?? "").slice(0, 1000) });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível desligar agora.") };
  return { ok: true, mensagem: "Notificações desligadas neste aparelho." };
}
