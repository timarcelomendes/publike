"use server";

import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { listarMinhasConversas, obterConversa, obterUsuario, type MensagemConversa } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

type Enviada =
  | { ok: true; mensagem: { id: number; autor_id: string; texto: string; criado_em: string; lida_em: null } }
  | { ok: false; erro: string };

/** Manda uma mensagem na conversa de um match (anúncio + quem curtiu). */
export async function enviarMensagem(anuncioId: string, perfilId: string, texto: string): Promise<Enviada> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId) || typeof texto !== "string") {
    return { ok: false, erro: "Pedido inválido." };
  }
  const limpo = texto.trim();
  if (!limpo) return { ok: false, erro: "Escreva a mensagem." };
  if (limpo.length > 2000) return { ok: false, erro: "A mensagem passa de 2000 letras." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("enviar_mensagem", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
    p_texto: limpo,
  });
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

/** Abri a conversa: o que a outra pessoa mandou fica lido. */
export async function marcarConversaLida(anuncioId: string, perfilId: string): Promise<void> {
  if (MODO_DEMO || !UUID.test(anuncioId) || !UUID.test(perfilId)) return;
  const supabase = await criarClienteServidor();
  await supabase.rpc("marcar_conversa_lida", { p_anuncio: anuncioId, p_perfil: perfilId });
}

// ---------------------------------------------------------------- janela de mensagens

/** As conversas para a janela de mensagens (canto da tela), da mais recente para a mais antiga. */
export async function conversasDaJanela() {
  if (MODO_DEMO) return null;
  const usuario = await obterUsuario();
  if (!usuario) return null;
  const lista = await listarMinhasConversas();
  if (!lista) return null;
  return [...lista]
    .sort((a, b) => (b.ultima_em ?? b.match_em ?? "").localeCompare(a.ultima_em ?? a.match_em ?? ""))
    .slice(0, 60);
}

/** Uma conversa aberta na janela de mensagens, com as últimas mensagens. */
export async function abrirConversaDaJanela(anuncioId: string, outroId: string) {
  if (MODO_DEMO || !UUID.test(anuncioId) || !UUID.test(outroId)) return null;
  const usuario = await obterUsuario();
  if (!usuario) return null;
  const dados = await obterConversa(anuncioId, outroId);
  return dados ? { ...dados, euId: usuario.id } : null;
}
