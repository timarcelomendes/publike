"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { lerStatusConexao, MAX_RECADO_CONEXAO, type EstadoConexao } from "@/lib/conexoes";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Conexões entre talentos e empresas: pedir, responder, desfazer e conversar. O banco confere
// quem pode (lados certos, aba Talentos, bloqueio, conta suspensa, limite do dia).

/** O caminho de volta depois de entrar (só caminhos do próprio site). */
function voltarPara(voltar: string | undefined) {
  return voltar && voltar.startsWith("/") && !voltar.startsWith("//") ? voltar : "/talentos";
}

/** Pede conexão com uma conta. Se o outro lado já tinha pedido, a conexão sai aceita na hora. */
export async function pedirConexao(
  com: string,
  recado: string | null,
  voltar?: string,
): Promise<{ ok: true; mensagem: string; estado: EstadoConexao } | { ok: false; erro: string; ir?: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(com)) return { ok: false, erro: "Pedido inválido." };
  const texto = typeof recado === "string" ? recado.trim() : "";
  if (texto.length > MAX_RECADO_CONEXAO) {
    return { ok: false, erro: `O recado passa de ${MAX_RECADO_CONEXAO} letras.` };
  }
  const usuario = await obterUsuario();
  if (!usuario) {
    return { ok: false, erro: "Entre na sua conta.", ir: `/entrar?next=${encodeURIComponent(voltarPara(voltar))}` };
  }
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("pedir_conexao", { p_com: com, p_mensagem: texto || null });
  if (error) {
    if (error.hint === "sem_vitrine") {
      return { ok: false, erro: error.message, ir: "/perfil/curriculo?para=talentos" };
    }
    return { ok: false, erro: mensagemDeErro(error, "Não deu para pedir a conexão agora.") };
  }
  const linha = data?.[0];
  if (!linha) return { ok: false, erro: "Não deu para pedir a conexão agora." };
  after(processarFilas);
  refresh();
  const aceita = lerStatusConexao(linha.status) === "aceita";
  return {
    ok: true,
    mensagem: aceita
      ? "Vocês estão conectados: os contatos e a conversa já estão liberados."
      : "Pedido enviado. Avisamos quando responderem.",
    estado: { id: linha.id, status: aceita ? "aceita" : "pendente", pedi: !aceita },
  };
}

/** Aceita ou recusa um pedido que recebi. */
export async function responderConexao(id: string, aceitar: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || typeof aceitar !== "boolean") return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/conexoes" };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("responder_conexao", { p_conexao: id, p_aceitar: aceitar });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para responder agora.") };
  if (aceitar) after(processarFilas);
  refresh();
  return {
    ok: true,
    mensagem: aceitar ? "Conexão aceita: os contatos e a conversa já estão liberados." : "Pedido recusado.",
  };
}

/** Cancela o pedido que fiz, tira da lista o que não foi aceito ou desfaz a conexão. */
export async function desfazerConexao(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/conexoes" };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("desfazer_conexao", { p_conexao: id });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para desfazer agora.") };
  refresh();
  return { ok: true, mensagem: "Pronto." };
}

type Enviada =
  | { ok: true; mensagem: { id: number; autor_id: string; texto: string; criado_em: string; lida_em: null } }
  | { ok: false; erro: string };

/** Manda uma mensagem na conversa de uma conexão aceita. */
export async function enviarMensagemConexao(conexaoId: string, texto: string): Promise<Enviada> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(conexaoId) || typeof texto !== "string") return { ok: false, erro: "Pedido inválido." };
  const limpo = texto.trim();
  if (!limpo) return { ok: false, erro: "Escreva a mensagem." };
  if (limpo.length > 2000) return { ok: false, erro: "A mensagem passa de 2000 letras." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("enviar_mensagem_conexao", { p_conexao: conexaoId, p_texto: limpo });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  // o aviso por e-mail para o outro lado sai pela fila
  after(processarFilas);
  return {
    ok: true,
    mensagem: { id: data, autor_id: usuario.id, texto: limpo, criado_em: new Date().toISOString(), lida_em: null },
  };
}

/** Abri a conexão: o que o outro lado mandou fica lido. */
export async function marcarConexaoLida(conexaoId: string): Promise<void> {
  if (MODO_DEMO || !UUID.test(conexaoId)) return;
  const supabase = await criarClienteServidor();
  await supabase.rpc("marcar_conexao_lida", { p_conexao: conexaoId });
}
