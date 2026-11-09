"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { MAXIMO_COMENTARIO } from "@/lib/comentarios";
import { MOTIVOS_DENUNCIA } from "@/lib/constantes";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro, precisaCompletarPerfil } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { acessoDaEquipe } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { temContatoNoTexto, UUID } from "@/lib/validacao";

// Os comentários nas vagas (claude/plano-comentarios-e-indicar-por-email.md, parte 2; migração 20270318120000).
// O banco confere tudo de novo (o dono, os limites, o contato, a vaga aberta).

const MOTIVOS: string[] = MOTIVOS_DENUNCIA.map((m) => m.valor);
const SEM_MIGRACAO = "Os comentários ainda não estão disponíveis. Tente de novo mais tarde.";

function limpar(texto: string) {
  return texto.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function conferirTexto(texto: string): string | null {
  if (texto.length < 2) return "Escreva o comentário.";
  if (texto.length > MAXIMO_COMENTARIO) return `O comentário passa de ${MAXIMO_COMENTARIO} letras.`;
  if (temContatoNoTexto(texto)) return "Tire o telefone, o e-mail ou o link. O contato aparece quando der match.";
  return null;
}

export type ResultadoComentario = Resultado & { emRevisao?: boolean };

export async function comentar(anuncioId: string, texto: string, respostaA?: string | null): Promise<ResultadoComentario> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || (respostaA && !UUID.test(respostaA))) return { ok: false, erro: "Vaga não encontrada." };
  const limpo = limpar(texto);
  const erro = conferirTexto(limpo);
  if (erro) return { ok: false, erro };
  if (!(await obterUsuario()))
    return {
      ok: false,
      erro: "Entre na sua conta para comentar.",
      ir: `/entrar?next=${encodeURIComponent(`/anuncio/${anuncioId}#comentarios`)}`,
    };
  const { data, error } = await (await criarClienteServidor()).rpc("comentar", {
    p_anuncio: anuncioId,
    p_texto: limpo,
    p_resposta_a: respostaA ?? null,
  });
  if (error) {
    if (precisaCompletarPerfil(error))
      return {
        ok: false,
        erro: error.message,
        ir: `/perfil?completar=1&next=${encodeURIComponent(`/anuncio/${anuncioId}#comentarios`)}`,
      };
    return { ok: false, erro: error.code === "PGRST202" ? SEM_MIGRACAO : mensagemDeErro(error) };
  }
  const emRevisao = data?.[0]?.status === "revisao";
  // a IA revisa e os avisos saem já
  after(processarFilas);
  refresh();
  return {
    ok: true,
    emRevisao,
    mensagem: emRevisao ? "Recebemos. Em alguns segundos o comentário aparece para todo mundo." : undefined,
  };
}

export async function editarComentario(id: string, texto: string): Promise<ResultadoComentario> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Comentário não encontrado." };
  const limpo = limpar(texto);
  const erro = conferirTexto(limpo);
  if (erro) return { ok: false, erro };
  const { data, error } = await (await criarClienteServidor()).rpc("editar_comentario", {
    p_comentario: id,
    p_texto: limpo,
  });
  if (error) return { ok: false, erro: error.code === "PGRST202" ? SEM_MIGRACAO : mensagemDeErro(error) };
  if (data === "revisao") after(processarFilas);
  refresh();
  return { ok: true, emRevisao: data === "revisao" };
}

export async function apagarComentario(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Comentário não encontrado." };
  const { error } = await (await criarClienteServidor()).rpc("apagar_comentario", { p_comentario: id });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Comentário apagado." };
}

/** Quem publicou esconde (ou mostra de novo) um comentário da própria vaga. */
export async function esconderComentario(id: string, esconder: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Comentário não encontrado." };
  const { error } = await (await criarClienteServidor()).rpc("esconder_comentario", {
    p_comentario: id,
    p_esconder: esconder,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return {
    ok: true,
    mensagem: esconder ? "Comentário escondido. Só você e a moderação veem." : "O comentário voltou a aparecer.",
  };
}

/** Quem publicou liga ou desliga os comentários da vaga. */
export async function ligarComentarios(anuncioId: string, ligado: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Vaga não encontrada." };
  const { error } = await (await criarClienteServidor()).rpc("ligar_comentarios", {
    p_anuncio: anuncioId,
    p_ligado: ligado,
  });
  if (error) return { ok: false, erro: error.code === "PGRST202" ? SEM_MIGRACAO : mensagemDeErro(error) };
  refresh();
  return {
    ok: true,
    mensagem: ligado
      ? "Comentários ligados: quem vê a vaga pode perguntar."
      : "Comentários desligados. Os que já existem continuam na vaga.",
  };
}

export async function denunciarComentario(id: string, motivo: string, detalhes = ""): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Comentário não encontrado." };
  if (!MOTIVOS.includes(motivo)) return { ok: false, erro: "Escolha o motivo." };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta para denunciar.", ir: "/entrar" };
  const { error } = await (await criarClienteServidor()).rpc("denunciar_comentario", {
    p_comentario: id,
    p_motivo: motivo,
    p_detalhes: detalhes.trim().slice(0, 1000) || null,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Denúncia enviada. Obrigado por cuidar da comunidade." };
}

/** A moderação (Admin › Denúncias › Comentários): liberar ou remover, com o motivo para quem escreveu. */
export async function moderarComentario(id: string, decisao: "liberar" | "remover", nota?: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || !["liberar", "remover"].includes(decisao)) return { ok: false, erro: "Pedido inválido." };
  const acesso = await acessoDaEquipe();
  if (!acesso) return { ok: false, erro: "Só a moderação pode fazer isso.", ir: "/entrar?next=/admin/denuncias" };
  const { error } = await acesso.cliente.rpc("moderar_comentario", {
    p_comentario: id,
    p_decisao: decisao,
    p_nota: (nota ?? "").trim().slice(0, 500) || null,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: decisao === "remover" ? "Comentário removido." : "Pronto: comentário no ar." };
}
