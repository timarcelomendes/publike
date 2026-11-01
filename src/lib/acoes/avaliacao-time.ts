"use server";

import { refresh } from "next/cache";
import {
  ehRecomendacao,
  lerAvaliacoesDoCandidato,
  MAX_COMPETENCIAS,
  type AvaliacoesDoCandidato,
} from "@/lib/avaliacao-time";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { mensagemDeErro } from "@/lib/erros";
import { criarClientePublico, criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Avaliação em time (migração 20270107120000). As regras (quem vê o quê) ficam no banco.

const notasLimpas = (notas: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(notas ?? {})
      .filter(([k, v]) => /^c[1-8]$/.test(k) && Number.isInteger(v) && v >= 1 && v <= 5)
      .slice(0, MAX_COMPETENCIAS),
  );

/** As competências da ficha da vaga (vale para todos os candidatos dela). */
export async function salvarFicha(anuncioId: string, competencias: string[]): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Pedido inválido." };
  const lista = (Array.isArray(competencias) ? competencias : [])
    .map((c) =>
      String(c ?? "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, MAX_COMPETENCIAS);
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_ficha_avaliacao", { p_anuncio: anuncioId, p_competencias: lista });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar a ficha.") };
  refresh();
  return { ok: true, mensagem: "Ficha salva." };
}

/** As avaliações de um candidato: a minha e, depois de eu avaliar, as dos outros. */
export async function carregarAvaliacoes(
  anuncioId: string,
  perfilId: string,
): Promise<{ ok: true; dados: AvaliacoesDoCandidato } | { ok: false; erro: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("avaliacoes_do_candidato", { p_anuncio: anuncioId, p_perfil: perfilId });
  const dados = lerAvaliacoesDoCandidato(data);
  if (error || !dados) return { ok: false, erro: mensagemDeErro(error, "Não deu para abrir as avaliações.") };
  return { ok: true, dados };
}

/** A minha avaliação do candidato. */
export async function avaliarCandidato(
  anuncioId: string,
  perfilId: string,
  d: { notas: Record<string, number>; recomendacao: string; comentario: string },
): Promise<{ ok: true; dados: AvaliacoesDoCandidato } | { ok: false; erro: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  if (!ehRecomendacao(d.recomendacao)) return { ok: false, erro: "Escolha: Seguir, Talvez ou Não seguir." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("avaliar_candidato", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
    p_notas: notasLimpas(d.notas),
    p_recomendacao: d.recomendacao,
    p_comentario: String(d.comentario ?? "").slice(0, 1000) || null,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar a avaliação.") };
  refresh();
  return carregarAvaliacoes(anuncioId, perfilId);
}

/** O gestor avalia pelo link dos finalistas (sem conta: vale o link; o nome é obrigatório). */
export async function avaliarPeloLink(
  token: string,
  id: string,
  d: { quem: string; notas: Record<string, number>; recomendacao: string; comentario: string },
): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!/^[0-9a-f]{64}$/.test(token) || !UUID.test(id)) return { ok: false, erro: "Link inválido." };
  if (!ehRecomendacao(d.recomendacao)) return { ok: false, erro: "Escolha: Seguir, Talvez ou Não seguir." };
  const { data, error } = await criarClientePublico().rpc("avaliar_pelo_link", {
    p_token: token,
    p_id: id,
    p_quem: String(d.quem ?? "").slice(0, 80),
    p_notas: notasLimpas(d.notas),
    p_recomendacao: d.recomendacao,
    p_comentario: String(d.comentario ?? "").slice(0, 1000) || null,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar a avaliação.") };
  if (data === "sem_nome") return { ok: false, erro: "Escreva o seu nome para avaliar." };
  if (data !== "ok") return { ok: false, erro: "Este link não vale mais." };
  return { ok: true, mensagem: "Avaliação enviada." };
}
