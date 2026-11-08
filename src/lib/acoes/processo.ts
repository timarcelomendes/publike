"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { ehMotivoSaida, jeitoDasRegras, type Processo, type Regra } from "@/lib/processo";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Json } from "@/lib/supabase/tipos-banco";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";
import { lerPerguntas } from "@/lib/vaga-extra";

// O processo da conta, os pulos, o motivo de saída e o padrão das vagas (migração 20270315120000).

const INDISPONIVEL = "Isso ainda não está disponível. Tente de novo mais tarde.";

async function comLogin() {
  if (MODO_DEMO) return MENSAGEM_DEMO;
  if (!(await obterUsuario())) return "Entre na sua conta.";
  return null;
}

function erroDe(error: { code?: string; message: string } | null, padrao: string) {
  return error?.code === "PGRST202" ? INDISPONIVEL : mensagemDeErro(error, padrao);
}

export async function salvarProcesso(p: Processo): Promise<Resultado> {
  const falta = await comLogin();
  if (falta) return { ok: false, erro: falta };
  const regras = { ...p, jeito: jeitoDasRegras(p) };
  const { error } = await (await criarClienteServidor()).rpc("salvar_processo", { p: regras as unknown as Json });
  if (error) return { ok: false, erro: erroDe(error, "Não deu para salvar agora.") };
  refresh();
  return { ok: true, mensagem: "Pronto: o processo foi salvo e vale para todas as vagas." };
}

/** Quem administra deixa uma pessoa passar sem uma regra, dizendo o motivo (aparece na Trilha). */
export async function pularRegra(anuncioId: string, perfilId: string, regra: Regra, motivo: string): Promise<Resultado> {
  const falta = await comLogin();
  if (falta) return { ok: false, erro: falta };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Candidato não encontrado." };
  if (motivo.replace(/\s+/g, " ").trim().length < 3) return { ok: false, erro: "Diga em poucas palavras por que vai pular." };
  const { error } = await (await criarClienteServidor()).rpc("pular_regra", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
    p_regra: regra,
    p_motivo: motivo.slice(0, 200),
  });
  if (error) return { ok: false, erro: erroDe(error, "Não deu para pular agora.") };
  return { ok: true };
}

/** O motivo de quem sai do processo (antes de dispensar ou de levar para Não seguiu). */
export async function marcarMotivoSaida(anuncioId: string, perfis: string[], motivo: string | null) {
  if (!UUID.test(anuncioId) || !perfis.every((p) => UUID.test(p))) return { ok: false as const, erro: "Pedido inválido." };
  if (motivo !== null && !ehMotivoSaida(motivo)) return { ok: false as const, erro: "Escolha um motivo da lista." };
  const { error } = await (await criarClienteServidor()).rpc("marcar_motivo_saida", {
    p_anuncio: anuncioId,
    p_perfis: perfis.slice(0, 200),
    p_motivo: motivo,
  });
  // sem a migração, segue sem o motivo
  if (error && error.code !== "PGRST202") return { ok: false as const, erro: mensagemDeErro(error) };
  return { ok: true as const };
}

/** "Contratar sem proposta" e pedir os documentos da admissão (uma proposta curta, já aceita). */
export async function pedirDocumentos(
  anuncioId: string,
  perfilId: string,
  inicio: string,
  documentos: string[],
): Promise<Resultado & { regra?: Regra | null }> {
  const falta = await comLogin();
  if (falta) return { ok: false, erro: falta };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Candidato não encontrado." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return { ok: false, erro: "Confira o dia em que a pessoa começa." };
  const { error } = await (await criarClienteServidor()).rpc("pedir_documentos", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
    p_inicio: inicio,
    p_documentos: documentos.slice(0, 12),
  });
  if (error) {
    const regra = /^regra_(entrevista|proposta|teste|cliente)$/.exec(error.hint ?? "")?.[1] as Regra | undefined;
    return { ok: false, erro: erroDe(error, "Não deu para pedir os documentos agora."), regra: regra ?? null };
  }
  refresh();
  return { ok: true, mensagem: "Pronto: a pessoa recebeu o pedido dos documentos." };
}

/** O padrão das vagas novas (a aba Candidatura): as perguntas vêm no formato do formulário da vaga. */
export async function salvarPadroesDaCandidatura(dados: {
  curriculo: string;
  contato_direto: boolean;
  contato_por: string;
  perguntas: unknown;
  tirar_eliminados: boolean;
  teste: string;
}): Promise<Resultado> {
  const falta = await comLogin();
  if (falta) return { ok: false, erro: falta };
  const perguntas = lerPerguntas(dados.perguntas);
  if (!perguntas.ok) return { ok: false, erro: perguntas.erro };
  const p = {
    curriculo: ["regime", "sempre", "nunca"].includes(dados.curriculo) ? dados.curriculo : "regime",
    contato_direto: dados.contato_direto === true,
    contato_por: dados.contato_por === "chat" ? "chat" : "ambos",
    perguntas: perguntas.perguntas,
    tirar_eliminados: dados.tirar_eliminados === true,
    teste: ["opcional", "antes", "nenhum"].includes(dados.teste) ? dados.teste : "opcional",
  };
  const { error } = await (await criarClienteServidor()).rpc("salvar_padroes", { p: p as unknown as Json });
  if (error) return { ok: false, erro: erroDe(error, "Não deu para salvar agora.") };
  refresh();
  return { ok: true, mensagem: "Pronto: as vagas novas começam assim." };
}

/** O padrão da contratação (a aba Contratação). */
export async function salvarPadroesDaContratacao(dados: {
  horario: string;
  beneficios: string;
  apresentar_onde: string;
  apresentar_hora: string;
  documentos: string[];
  taxa: string;
  garantia_dias: string;
}): Promise<Resultado> {
  const falta = await comLogin();
  if (falta) return { ok: false, erro: falta };
  const corte = (t: string, n: number) => t.replace(/\s+/g, " ").trim().slice(0, n);
  const hora = /^\d{2}:\d{2}$/.test(dados.apresentar_hora) ? dados.apresentar_hora : "";
  const taxa = dados.taxa.trim() ? Number(dados.taxa.replace(/\./g, "").replace(",", ".")) : null;
  if (taxa !== null && (!Number.isFinite(taxa) || taxa < 0)) return { ok: false, erro: "Confira o valor da taxa." };
  const garantia = dados.garantia_dias.trim() ? Number(dados.garantia_dias) : null;
  if (garantia !== null && (!Number.isInteger(garantia) || garantia < 0 || garantia > 365))
    return { ok: false, erro: "A garantia vai de 0 a 365 dias." };
  const p = {
    proposta: {
      horario: corte(dados.horario, 120),
      beneficios: corte(dados.beneficios, 300),
      apresentar_onde: corte(dados.apresentar_onde, 300),
      apresentar_hora: hora,
    },
    documentos: dados.documentos.map((d) => corte(d, 60)).filter(Boolean).slice(0, 12),
    taxa: taxa === null ? "" : String(taxa),
    garantia_dias: garantia === null ? "" : String(garantia),
  };
  const { error } = await (await criarClienteServidor()).rpc("salvar_padroes", { p: p as unknown as Json });
  if (error) return { ok: false, erro: erroDe(error, "Não deu para salvar agora.") };
  refresh();
  return { ok: true, mensagem: "Pronto: as próximas propostas começam assim." };
}

/** Leva o padrão para as vagas no ar. */
export async function aplicarPadroes(oQue: string[]): Promise<Resultado> {
  const falta = await comLogin();
  if (falta) return { ok: false, erro: falta };
  const lista = oQue.filter((x) => ["curriculo", "contato_direto", "contato_por"].includes(x));
  if (!lista.length) return { ok: false, erro: "Escolha o que levar para as vagas no ar." };
  const { data, error } = await (await criarClienteServidor()).rpc("aplicar_padroes", { p_o_que: lista });
  if (error) return { ok: false, erro: erroDe(error, "Não deu para mudar as vagas agora.") };
  refresh();
  const n = Number(data ?? 0);
  return {
    ok: true,
    mensagem: n === 0 ? "As vagas no ar já estavam assim." : n === 1 ? "Pronto: 1 vaga mudou." : `Pronto: ${n} vagas mudaram.`,
  };
}

/** Ao marcar a vaga como preenchida: quem deu match e ainda não está em Contratados (para dizer quem foi). */
export async function quemPodeTerSidoContratado(
  anuncioId: string,
): Promise<{ contratados: number; candidatos: { id: string; nome: string }[] } | null> {
  if (MODO_DEMO || !UUID.test(anuncioId) || !(await obterUsuario())) return null;
  const supabase = await criarClienteServidor();
  const [{ data: curtidas }, { data: etapas }] = await Promise.all([
    supabase.from("curtidas").select("perfil_id").eq("anuncio_id", anuncioId).eq("status", "match").limit(200),
    supabase.rpc("etapas_dos_candidatos", { p_anuncio: anuncioId }),
  ]);
  const etapaDe = new Map((etapas ?? []).map((e) => [e.perfil_id, e.etapa]));
  const ids = (curtidas ?? []).map((c) => c.perfil_id);
  const contratados = ids.filter((id) => etapaDe.get(id) === "contratado").length;
  const faltam = ids.filter((id) => etapaDe.get(id) !== "contratado" && etapaDe.get(id) !== "nao_seguiu");
  if (!faltam.length) return { contratados, candidatos: [] };
  const { data: perfis } = await supabase.from("perfis").select("id, nome").in("id", faltam);
  return {
    contratados,
    candidatos: (perfis ?? []).map((p) => ({ id: p.id, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}
