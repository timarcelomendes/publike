"use server";

import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario, type MensagemConversa } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { conversaCom, conversasPorPessoa } from "@/lib/servidor/conversas";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
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
  const { data: m } = await supabase
    .from("mensagens")
    .select("id, autor_id, texto, criado_em, lida_em, anexo, anexo_nome")
    .eq("id", data)
    .maybeSingle();
  return m
    ? { ok: true, mensagem: m }
    : { ok: false, erro: "O currículo foi, mas a conversa não atualizou. Abra de novo." };
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
