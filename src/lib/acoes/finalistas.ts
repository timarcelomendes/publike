"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { ehDecisao, LIMITES_FINALISTAS, type DecisaoCliente } from "@/lib/finalistas";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClientePublico, criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Finalistas para o cliente. A agência põe e tira gente da lista, escreve o parecer e cuida
// do link; o cliente (sem conta, pelo link) responde. As regras ficam no banco
// (adicionar_finalistas, salvar_parecer_finalista, link_dos_finalistas, responder_finalista).

const TOKEN = /^[0-9a-f]{64}$/;

function idsValidos(ids: unknown): string[] {
  return Array.isArray(ids) ? [...new Set(ids.filter((i): i is string => typeof i === "string" && UUID.test(i)))] : [];
}

/** Põe na lista quem já deu match; quem não deu fica de fora (e a mensagem diz). */
export async function adicionarFinalistas(anuncioId: string, perfis: string[]): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const ids = idsValidos(perfis);
  if (!UUID.test(anuncioId) || !ids.length) return { ok: false, erro: "Escolha quem vai para o cliente." };
  if (ids.length > 100) return { ok: false, erro: "Escolha até 100 pessoas de uma vez." };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("adicionar_finalistas", { p_anuncio: anuncioId, p_perfis: ids });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  // o aviso de cada um (o currículo foi para a empresa) vai por e-mail
  after(processarFilas);
  refresh();
  const n = data ?? 0;
  const fora = ids.length - n;
  const partes = [
    n === 0 ? "" : n === 1 ? "1 pessoa foi para os finalistas." : `${n} pessoas foram para os finalistas.`,
    fora === 0
      ? ""
      : fora === 1
        ? "1 ficou de fora: ainda não deu match ou já estava na lista."
        : `${fora} ficaram de fora: ainda não deram match ou já estavam na lista.`,
  ];
  if (n === 0) return { ok: false, erro: partes.join(" ").trim() || "Ninguém entrou na lista." };
  return { ok: true, mensagem: partes.filter(Boolean).join(" ") };
}

export async function tirarFinalista(anuncioId: string, perfilId: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("tirar_finalista", { p_anuncio: anuncioId, p_perfil: perfilId });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Saiu da lista do cliente." };
}

export async function salvarParecer(anuncioId: string, perfilId: string, parecer: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  const texto = (typeof parecer === "string" ? parecer : "").replace(/\r\n/g, "\n").trim();
  if (texto.length > LIMITES_FINALISTAS.parecer) {
    return { ok: false, erro: `O parecer tem no máximo ${LIMITES_FINALISTAS.parecer} letras.` };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_parecer_finalista", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
    p_parecer: texto,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: texto ? "Parecer salvo." : "Parecer apagado." };
}

export type RespostaLink = { ok: true; token: string; expira_em: string } | { ok: false; erro: string };

/** "pegar": cria o link se ainda não tem; "renovar": mais 30 dias; "trocar": link novo (o antigo para de abrir). */
export async function mexerNoLink(anuncioId: string, acao: "pegar" | "renovar" | "trocar"): Promise<RespostaLink> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !["pegar", "renovar", "trocar"].includes(acao)) {
    return { ok: false, erro: "Pedido inválido." };
  }
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("link_dos_finalistas", { p_anuncio: anuncioId, p_acao: acao });
  const link = data?.[0];
  if (error || !link) return { ok: false, erro: error ? mensagemDeErro(error) : "Não deu para criar o link agora." };
  refresh();
  return { ok: true, token: link.token, expira_em: link.expira_em };
}

const MOTIVOS: Record<string, string> = {
  expirado: "Este link venceu. Peça um novo para a agência.",
  invalido: "Não deu para salvar: esta pessoa não está mais na lista ou o link mudou. Recarregue a página.",
};

/** O cliente responde sobre um finalista (sem conta: vale o link). */
export async function responderFinalista(
  token: string,
  id: string,
  decisao: DecisaoCliente | null,
  comentario: string,
  quem: string,
): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (typeof token !== "string" || !TOKEN.test(token) || typeof id !== "string" || !UUID.test(id)) {
    return { ok: false, erro: MOTIVOS.invalido };
  }
  if (decisao !== null && !ehDecisao(decisao)) return { ok: false, erro: "Escolha uma resposta." };
  const c = (typeof comentario === "string" ? comentario : "").trim();
  const q = (typeof quem === "string" ? quem : "").replace(/\s+/g, " ").trim();
  if (c.length > LIMITES_FINALISTAS.comentario) {
    return { ok: false, erro: `O comentário tem no máximo ${LIMITES_FINALISTAS.comentario} letras.` };
  }
  if (q.length > LIMITES_FINALISTAS.quem) return { ok: false, erro: "Use um nome mais curto." };
  const { data, error } = await criarClientePublico().rpc("responder_finalista", {
    p_token: token,
    p_id: id,
    p_decisao: decisao,
    p_comentario: c || null,
    p_quem: q || null,
  });
  if (error) return { ok: false, erro: "Não deu para salvar agora. Tente de novo." };
  if (data !== "ok") return { ok: false, erro: MOTIVOS[data] ?? MOTIVOS.invalido };
  // o aviso para a agência sai por e-mail
  after(processarFilas);
  return { ok: true, mensagem: decisao || c ? "Resposta salva. A agência já recebeu." : "Resposta apagada." };
}
