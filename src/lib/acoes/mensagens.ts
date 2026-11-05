"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { COLUNAS_DA_MENSAGEM, obterUsuario, type MensagemConversa } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { conversaCom, conversasPorPessoa } from "@/lib/servidor/conversas";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

type Enviada =
  | { ok: true; mensagem: { id: number; autor_id: string; texto: string; criado_em: string; lida_em: null } }
  | { ok: false; erro: string };

/**
 * Manda uma mensagem para uma conta com quem tenho match ou conexão aceita (a conversa é uma por
 * pessoa: as vagas e a conexão ficam juntas).
 */
export async function enviarMensagemPara(outroId: string, texto: string): Promise<Enviada> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(outroId) || typeof texto !== "string") return { ok: false, erro: "Pedido inválido." };
  const limpo = texto.trim();
  if (!limpo) return { ok: false, erro: "Escreva a mensagem." };
  if (limpo.length > 2000) return { ok: false, erro: "A mensagem passa de 2000 letras." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("enviar_mensagem_para", { p_outro: outroId, p_texto: limpo });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  // o aviso por e-mail para a outra pessoa sai pela fila
  after(processarFilas);
  return {
    ok: true,
    mensagem: { id: data, autor_id: usuario.id, texto: limpo, criado_em: new Date().toISOString(), lida_em: null },
  };
}

/**
 * Manda o currículo (PDF) na conversa de um match de vaga. O navegador já enviou o arquivo
 * para a pasta da pessoa no Storage; o banco confere, manda a mensagem com o anexo e guarda
 * o PDF como o currículo dela.
 */
export async function anexarCurriculoNaConversa(
  anuncioId: string,
  arquivo: string,
  nome: string,
): Promise<{ ok: true; mensagem: MensagemConversa } | { ok: false; erro: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || typeof arquivo !== "string" || typeof nome !== "string") {
    return { ok: false, erro: "Pedido inválido." };
  }
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("enviar_curriculo_na_conversa", {
    p_anuncio: anuncioId,
    p_arquivo: arquivo,
    p_nome: nome.slice(0, 120),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para mandar o currículo agora.") };
  after(processarFilas);
  const { data: m } = await supabase.from("mensagens").select(COLUNAS_DA_MENSAGEM).eq("id", data).maybeSingle();
  return m
    ? { ok: true, mensagem: m }
    : { ok: false, erro: "O currículo foi, mas a conversa não atualizou. Abra de novo." };
}

/**
 * O toque numa pergunta do match (migração 20270202120000): a resposta entra na conversa e vem a próxima pergunta
 * ou, na última, o agradecimento (e quem publicou recebe o resumo). Devolve as mensagens novas, para a conversa
 * mostrar na hora mesmo sem o canal ao vivo.
 */
export async function responderPerguntaDoChat(
  mensagemId: number,
  opcao: number,
): Promise<{ ok: true; mensagens: MensagemConversa[] } | { ok: false; erro: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!Number.isSafeInteger(mensagemId) || !Number.isInteger(opcao) || opcao < 0 || opcao > 9) {
    return { ok: false, erro: "Pedido inválido." };
  }
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("responder_pergunta_do_chat", { p_mensagem: mensagemId, p_opcao: opcao });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para responder agora. Tente de novo.") };
  // o aviso para quem publicou (no fim) sai pela fila
  after(processarFilas);
  const ids = ((data as { mensagens?: unknown } | null)?.mensagens ?? []) as number[];
  const { data: novas } = await supabase
    .from("mensagens")
    .select(COLUNAS_DA_MENSAGEM)
    .in("id", [mensagemId, ...ids.filter(Number.isSafeInteger)])
    .order("id");
  return { ok: true, mensagens: novas ?? [] };
}

/**
 * O toque na mensagem da entrevista (migração 20270206120000): confirmar presença, pedir outro horário ou escolher
 * um dos horários, com a mesma regra da página da vaga. A resposta entra na conversa; devolve a mensagem da
 * entrevista (com a situação nova) e a resposta, para a conversa mostrar na hora.
 */
export async function responderEntrevistaNaConversa(
  mensagemId: number,
  resposta: "confirmada" | "remarcar" | "escolher",
  quando?: string,
): Promise<{ ok: true; mensagens: MensagemConversa[] } | { ok: false; erro: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const horario = quando ? new Date(quando) : null;
  if (
    !Number.isSafeInteger(mensagemId) ||
    !["confirmada", "remarcar", "escolher"].includes(resposta) ||
    (resposta === "escolher" && (!horario || Number.isNaN(horario.getTime())))
  ) {
    return { ok: false, erro: "Pedido inválido." };
  }
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("responder_entrevista_no_chat", {
    p_mensagem: mensagemId,
    p_resposta: resposta,
    p_quando: resposta === "escolher" && horario ? horario.toISOString() : null,
  });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Ainda não dá para responder por aqui. Responda na página da vaga." };
    return { ok: false, erro: mensagemDeErro(error, "Não deu para responder agora. Tente de novo.") };
  }
  // o aviso para quem marcou sai por e-mail (confirmada: com o convite para a agenda)
  after(processarFilas);
  const ids = ((data as { mensagens?: unknown } | null)?.mensagens ?? []) as number[];
  const { data: mudadas } = await supabase
    .from("mensagens")
    .select(COLUNAS_DA_MENSAGEM)
    .in("id", [mensagemId, ...ids.filter(Number.isSafeInteger)])
    .order("id");
  return { ok: true, mensagens: mudadas ?? [] };
}

/** Link do currículo anexado numa mensagem (só os dois da conversa; vale 10 minutos). */
export async function linkDoAnexo(mensagemId: number): Promise<string | null> {
  if (MODO_DEMO || !Number.isSafeInteger(mensagemId)) return null;
  const supabase = await criarClienteServidor();
  // a leitura da mensagem já confere que a pessoa está na conversa
  const { data } = await supabase.from("mensagens").select("anexo").eq("id", mensagemId).maybeSingle();
  if (!data?.anexo) return null;
  const { data: link } = await supabase.storage.from("curriculos").createSignedUrl(data.anexo, 600);
  return link?.signedUrl ?? null;
}

/** Abri a conversa: tudo o que a outra pessoa mandou (de qualquer vaga ou da conexão) fica lido. */
export async function marcarConversaLidaCom(outroId: string): Promise<void> {
  if (MODO_DEMO || !UUID.test(outroId)) return;
  const supabase = await criarClienteServidor();
  await supabase.rpc("marcar_conversa_lida_com", { p_outro: outroId });
}

/**
 * "Marcar como lida" e "Marcar como não lida", no menu de cada conversa (claude/plano-lida-nao-lida.md). A não lida
 * vale só para mim: o "lida" de quem mandou continua.
 */
export async function mudarLeituraDaConversa(outroId: string, lida: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(outroId)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = lida
    ? await supabase.rpc("marcar_conversa_lida_com", { p_outro: outroId })
    : await supabase.rpc("marcar_conversa_nao_lida_com", { p_outro: outroId });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Ainda não dá para marcar como não lida. Tente mais tarde." };
    return { ok: false, erro: mensagemDeErro(error, "Não deu para marcar agora. Tente de novo.") };
  }
  refresh();
  return { ok: true, mensagem: lida ? "Marcada como lida." : "Marcada como não lida." };
}

// ---------------------------------------------------------------- janela de mensagens

/** As conversas para a janela de mensagens (canto da tela): uma por pessoa, da mais recente. */
export async function conversasDaJanela() {
  if (MODO_DEMO) return null;
  const usuario = await obterUsuario();
  if (!usuario) return null;
  const lista = await conversasPorPessoa();
  return lista ? lista.slice(0, 60) : null;
}

/** A conversa com uma pessoa, aberta na janela de mensagens, com as últimas mensagens. */
export async function abrirConversaDaJanela(outroId: string) {
  if (MODO_DEMO || !UUID.test(outroId)) return null;
  const usuario = await obterUsuario();
  if (!usuario) return null;
  const dados = await conversaCom(outroId);
  return dados ? { ...dados, euId: usuario.id } : null;
}
