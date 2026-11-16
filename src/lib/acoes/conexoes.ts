"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import {
  lerMotivoSemContato,
  lerStatusConexao,
  MAX_RECADO_CONEXAO,
  type EstadoConexao,
  type MotivoSemContato,
} from "@/lib/conexoes";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { dataCurta, DIAS_GRATIS } from "@/lib/recursos-pagos";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Conexões entre talentos e empresas: pedir, responder e desfazer (a conversa, uma por pessoa, fica
// em acoes/mensagens.ts). O banco confere quem pode (lados certos, aba Talentos, bloqueio, conta
// suspensa, limite do dia).

/** O caminho de volta depois de entrar (só caminhos do próprio site). */
function voltarPara(voltar: string | undefined) {
  return voltar && voltar.startsWith("/") && !voltar.startsWith("//") ? voltar : "/talentos";
}

/**
 * Pede conexão com uma conta. Se o outro lado já tinha pedido, a conexão sai aceita na hora. Empresa com plano
 * pedindo a um talento: o contato já vem no pedido (o contato no convite); sem ele, `motivo` diz por quê.
 */
export async function pedirConexao(
  com: string,
  recado: string | null,
  voltar?: string,
): Promise<
  | { ok: true; mensagem: string; estado: EstadoConexao; motivo: MotivoSemContato | null }
  | { ok: false; erro: string; ir?: string }
> {
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
  // sem a migração 20270626120000, as duas colunas não vêm
  const contato = !aceita && linha.contato_liberado === true;
  const motivo = aceita || contato ? null : lerMotivoSemContato(linha.motivo);
  return {
    ok: true,
    mensagem: aceita
      ? "Vocês estão conectados: os contatos e a conversa já estão liberados."
      : contato
        ? "Pedido enviado, com o contato liberado: chame no WhatsApp, por e-mail ou pela conversa no Publike."
        : motivo === "desligado" || motivo === "aviso" || motivo === "limite"
          ? "Pedido enviado. O contato aparece quando a pessoa aceitar; avisamos quando responder."
          : "Pedido enviado. Avisamos quando responderem.",
    estado: { id: linha.id, status: aceita ? "aceita" : "pendente", pedi: !aceita, contato },
    motivo,
  };
}

/** Ver o contato num pedido meu que já estava esperando (feito antes do plano ou dos 15 dias grátis). */
export async function liberarContatoDaConexao(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/conexoes" };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("liberar_contato_da_conexao", { p_conexao: id });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Isso ainda não está no ar. Tente mais tarde." };
    if (error.hint === "contato_sem_plano") return { ok: false, erro: error.message, ir: "/painel/planos" };
    return { ok: false, erro: mensagemDeErro(error, "Não deu para liberar o contato agora.") };
  }
  refresh();
  return { ok: true, mensagem: "Contato liberado: chame no WhatsApp, por e-mail ou pela conversa no Publike." };
}

/** Os 15 dias grátis do contato no convite: uma vez por conta, até 5 contatos a cada 24 horas; depois, nos planos. */
export async function testarContatoNoConvite(): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("testar_contato_no_convite");
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Isso ainda não está no ar. Tente mais tarde." };
    return { ok: false, erro: mensagemDeErro(error, "Não deu para liberar agora. Tente de novo.") };
  }
  refresh();
  const ate = typeof data === "string" ? ` até ${dataCurta(data)}` : ` por ${DIAS_GRATIS} dias`;
  return {
    ok: true,
    mensagem: `Pronto: o contato no convite está liberado${ate}, com até 5 contatos a cada 24 horas.`,
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
