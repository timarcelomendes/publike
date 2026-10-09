"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { acessoDaEquipe } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { temContatoNoTexto, UUID } from "@/lib/validacao";

const SEM_CONTATO = "Tire o telefone, e-mail ou link. O contato de vocês já está no painel.";

/** Quem deu match com um serviço avalia (ou muda a avaliação). */
export async function avaliarServico(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const anuncioId = String(formData.get("anuncio_id") ?? "");
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Serviço não encontrado." };
  const usuario = await obterUsuario();
  if (!usuario) redirect(`/entrar?next=${encodeURIComponent(`/anuncio/${anuncioId}/avaliar`)}`);

  const nota = Number(formData.get("nota"));
  const comentario = String(formData.get("comentario") ?? "").trim();
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return { ok: false, erro: "Escolha de 1 a 5 estrelas.", erros: { nota: "Escolha de 1 a 5 estrelas." } };
  }
  if (comentario.length > 600) {
    return { ok: false, erro: "Confira o comentário.", erros: { comentario: "Use no máximo 600 letras." } };
  }
  if (temContatoNoTexto(comentario)) {
    return { ok: false, erro: "Confira o comentário.", erros: { comentario: SEM_CONTATO } };
  }

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("avaliar", {
    p_anuncio: anuncioId,
    p_nota: nota,
    p_comentario: comentario || null,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível salvar a avaliação agora.") };

  // a IA revisa o comentário logo depois (e o profissional recebe o aviso)
  after(processarFilas);
  revalidatePath(`/anuncio/${anuncioId}`);
  return {
    ok: true,
    mensagem:
      data === "pendente"
        ? "Obrigado! Sua avaliação aparece no perfil assim que passar pela revisão automática."
        : "Obrigado! Sua avaliação já aparece no perfil do profissional.",
  };
}

/** O profissional responde uma avaliação (uma vez). */
export async function responderAvaliacao(id: number, texto: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/avaliacoes" };
  const resposta = texto.trim();
  if (resposta.length < 2) return { ok: false, erro: "Escreva a resposta." };
  if (resposta.length > 600) return { ok: false, erro: "Use no máximo 600 letras." };
  if (temContatoNoTexto(resposta)) return { ok: false, erro: SEM_CONTATO };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("responder_avaliacao", { p_avaliacao: id, p_resposta: resposta });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  after(processarFilas);
  refresh();
  return {
    ok: true,
    mensagem:
      data === "pendente" ? "Resposta enviada. Ela aparece depois da revisão automática." : "Resposta publicada.",
  };
}

/** O profissional pede para a equipe olhar uma avaliação. */
export async function denunciarAvaliacao(id: number, motivo: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/avaliacoes" };
  const texto = motivo.trim().slice(0, 500);
  if (texto.length < 5) return { ok: false, erro: "Conte em poucas palavras o que há de errado." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("denunciar_avaliacao", { p_avaliacao: id, p_motivo: texto });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Pronto. A equipe vai olhar esta avaliação." };
}

/** Equipe: publicar (estava certo) ou remover o comentário ou a resposta. */
export async function moderarAvaliacao(
  id: number,
  parte: "comentario" | "resposta",
  decisao: "publicar" | "remover",
): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (
    !Number.isInteger(id) ||
    !["comentario", "resposta"].includes(parte) ||
    !["publicar", "remover"].includes(decisao)
  ) {
    return { ok: false, erro: "Pedido inválido." };
  }
  const acesso = await acessoDaEquipe();
  if (!acesso) return { ok: false, erro: "Só a moderação pode fazer isso.", ir: "/entrar?next=/admin/denuncias" };
  const { error } = await acesso.cliente.rpc("moderar_avaliacao", {
    p_avaliacao: id,
    p_parte: parte,
    p_decisao: decisao,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  after(processarFilas);
  revalidatePath("/");
  refresh();
  return {
    ok: true,
    mensagem: decisao === "publicar" ? "Publicado." : "Removido. Quem escreveu levou uma advertência.",
  };
}
