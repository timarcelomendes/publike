"use server";

import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
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

/** Abri a conversa: o que a outra pessoa mandou fica lido. */
export async function marcarConversaLida(anuncioId: string, perfilId: string): Promise<void> {
  if (MODO_DEMO || !UUID.test(anuncioId) || !UUID.test(perfilId)) return;
  const supabase = await criarClienteServidor();
  await supabase.rpc("marcar_conversa_lida", { p_anuncio: anuncioId, p_perfil: perfilId });
}
