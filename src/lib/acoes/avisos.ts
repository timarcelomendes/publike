"use server";

import { ehGrupoDeAviso, type CanalDeAviso } from "@/lib/avisos";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

/** Liga ou desliga um grupo de avisos no e-mail ou no celular (a página Avisos e notificações). */
export async function mudarAviso(grupo: string, canal: CanalDeAviso, ligado: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!ehGrupoDeAviso(grupo) || (canal !== "email" && canal !== "celular")) {
    return { ok: false, erro: "Aviso desconhecido. Atualize a página." };
  }
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/perfil/avisos" };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("mudar_aviso", { p_grupo: grupo, p_canal: canal, p_ligado: ligado });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora. Tente de novo.") };
  return { ok: true };
}

/** Liga de novo o "Receber avisos por e-mail" do perfil (pela página Avisos e notificações). */
export async function ligarEmails(): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/perfil/avisos" };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("mudar_receber_emails", { p_ligado: true });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para ligar agora. Tente de novo.") };
  return { ok: true, mensagem: "Os avisos por e-mail estão ligados." };
}

/**
 * O "parar de receber" do e-mail, sem entrar: a chave do link diz de quem é. Devolve o que saiu
 * (o grupo ou "todos"), ou o erro.
 */
export async function sairDosAvisos(
  chave: string,
  grupo: string,
): Promise<{ ok: true; saiu: string } | { ok: false; erro: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(chave) || (grupo !== "todos" && !ehGrupoDeAviso(grupo))) {
    return { ok: false, erro: "Este link não vale mais. Escolha os avisos na sua conta." };
  }
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("sair_dos_avisos", { p_chave: chave, p_grupo: grupo });
  if (error) {
    console.error(`Publike: o "parar de receber" falhou: ${error.message}`);
    return { ok: false, erro: "Não deu certo agora. Tente de novo em instantes." };
  }
  if (!data) return { ok: false, erro: "Este link não vale mais. Escolha os avisos na sua conta." };
  return { ok: true, saiu: data };
}
