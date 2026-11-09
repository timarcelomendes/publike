"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// As conquistas (claude/plano-posts-e-conquistas.md, parte 2; migração 20270322120000). O banco confere tudo de
// novo: de quem é a vaga, a resposta da pessoa, a conquista no ar.

const SEM_MIGRACAO = "As conquistas ainda não estão disponíveis. Tente de novo mais tarde.";
const RESPOSTAS = ["comecei", "ainda_nao", "nao_deu"] as const;

function erroDo(error: { code?: string; message: string }) {
  return error.code === "PGRST202" ? SEM_MIGRACAO : mensagemDeErro(error);
}

/** "Deu certo?": Comecei!, Ainda não ou Não deu certo. */
export async function responderConquista(anuncioId: string, resposta: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !(RESPOSTAS as readonly string[]).includes(resposta))
    return { ok: false, erro: "Pedido inválido." };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/" };
  const { error } = await (await criarClienteServidor()).rpc("responder_conquista", {
    p_anuncio: anuncioId,
    p_resposta: resposta,
  });
  if (error) return { ok: false, erro: erroDo(error) };
  refresh();
  return {
    ok: true,
    mensagem:
      resposta === "comecei"
        ? "Que notícia boa! Parabéns pelo trabalho novo."
        : resposta === "ainda_nao"
          ? "Combinado. A gente pergunta de novo daqui a uma semana."
          : "Obrigado por contar. Tem mais vagas perto de você esperando.",
  };
}

/** Mostrar a conquista no Publike (ou deixar só para a pessoa). */
export async function mostrarConquista(anuncioId: string, mostrar: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await (await criarClienteServidor()).rpc("mostrar_conquista", {
    p_anuncio: anuncioId,
    p_mostrar: mostrar,
  });
  if (error) return { ok: false, erro: erroDo(error) };
  refresh();
  return {
    ok: true,
    mensagem: mostrar
      ? "Pronto: a sua conquista aparece para quem está perto. Dá para tirar quando quiser."
      : "Combinado: fica só para você.",
  };
}

/** Quem publicou a vaga confirma (ou diz que não é verdade). */
export async function confirmarConquista(anuncioId: string, perfilId: string, sim: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await (await criarClienteServidor()).rpc("confirmar_conquista", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
    p_sim: sim,
  });
  if (error) return { ok: false, erro: erroDo(error) };
  refresh();
  return {
    ok: true,
    mensagem: sim
      ? "Confirmado: a pessoa foi para Contratado no quadro da vaga."
      : "Combinado: a conquista sai do Publike.",
  };
}

/** Dá (ou tira) os parabéns por uma conquista. */
export async function darParabens(
  anuncioId: string,
  perfilId: string,
): Promise<{ ok: true; parabens: number; dei: boolean } | Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta para dar os parabéns.", ir: "/entrar?next=/" };
  const { data, error } = await (await criarClienteServidor())
    .rpc("dar_parabens", { p_anuncio: anuncioId, p_perfil: perfilId })
    .maybeSingle();
  if (error || !data) return { ok: false, erro: error ? erroDo(error) : "Não foi possível agora. Tente de novo." };
  return { ok: true, parabens: data.parabens, dei: data.dei };
}
