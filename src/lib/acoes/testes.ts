"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { motivoProibido } from "@/lib/copiloto";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Json } from "@/lib/supabase/tipos-banco";
import { MAX_QUESTOES, MAX_TESTES_NA_VAGA, type QuestaoTeste } from "@/lib/testes";
import type { Resultado } from "@/lib/tipos";
import { temContato, UUID } from "@/lib/validacao";

// Teste Prático (migração 20261204120000). O banco confere de novo quem pode o quê e corrige os testes.

async function comConta(): Promise<{ erro: string } | null> {
  if (MODO_DEMO) return { erro: MENSAGEM_DEMO };
  if (!(await obterUsuario())) return { erro: "Entre na sua conta." };
  return null;
}

/** Os testes da vaga (até 3), cada um opcional ou obrigatório. */
export async function salvarTestesDaVaga(
  anuncioId: string,
  itens: { modelo_id: string; obrigatoria: boolean }[],
): Promise<Resultado> {
  const sem = await comConta();
  if (sem) return { ok: false, erro: sem.erro };
  if (!UUID.test(anuncioId) || !Array.isArray(itens) || itens.some((i) => !UUID.test(i?.modelo_id ?? ""))) {
    return { ok: false, erro: "Pedido inválido." };
  }
  if (itens.length > MAX_TESTES_NA_VAGA) return { ok: false, erro: `Escolha até ${MAX_TESTES_NA_VAGA} testes.` };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("avaliacoes_salvar_na_vaga", {
    p_anuncio: anuncioId,
    p_itens: itens.map((i) => ({ modelo_id: i.modelo_id, obrigatoria: i.obrigatoria === true })) as unknown as Json,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora.") };
  refresh();
  return { ok: true, mensagem: itens.length ? "Testes da vaga salvos." : "A vaga ficou sem teste." };
}

export type RespostaTesteDaCasa =
  { ok: true; id: string; mensagem: string } | { ok: false; erro: string; erros?: Record<string, string> };

/** Cria ou edita um teste da casa (prático: uma resposta certa por questão). */
export async function salvarTesteDaCasa(
  id: string | null,
  titulo: string,
  descricao: string,
  questoes: QuestaoTeste[],
): Promise<RespostaTesteDaCasa> {
  const sem = await comConta();
  if (sem) return { ok: false, erro: sem.erro };
  if (id !== null && !UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const erros: Record<string, string> = {};
  const nome = String(titulo ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (nome.length < 3 || nome.length > 90) erros.titulo = "Dê um nome ao teste (de 3 a 90 letras).";
  else if (motivoProibido(nome)) erros.titulo = "O nome do teste não pode falar disso.";
  const lista = (Array.isArray(questoes) ? questoes : []).slice(0, MAX_QUESTOES + 1);
  if (!lista.length) return { ok: false, erro: "Ponha pelo menos uma questão." };
  if (lista.length > MAX_QUESTOES) return { ok: false, erro: `Ponha até ${MAX_QUESTOES} questões.` };
  const limpas = lista.map((q, i) => {
    const enunciado = String(q?.enunciado ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const opcoes = (Array.isArray(q?.opcoes) ? q.opcoes : [])
      .map((o, j) => ({
        id: "abcde"[j] ?? `o${j}`,
        texto: String(o?.texto ?? "")
          .replace(/\s+/g, " ")
          .trim(),
        pontos: o?.pontos ? 1 : 0,
      }))
      .filter((o) => o.texto)
      .slice(0, 5)
      .map((o, j) => ({ ...o, id: "abcde"[j] }));
    const k = `q${i + 1}`;
    const motivo = motivoProibido(enunciado) ?? opcoes.map((o) => motivoProibido(o.texto)).find(Boolean);
    if (enunciado.length < 5) erros[k] = "Escreva a pergunta.";
    else if (motivo) erros[k] = motivo.replace("nos critérios", "no teste");
    else if (temContato(enunciado) || opcoes.some((o) => temContato(o.texto)))
      erros[k] = "Sem telefone, e-mail ou link.";
    else if (opcoes.length < 2) erros[k] = "Ponha pelo menos 2 respostas.";
    else if (opcoes.filter((o) => o.pontos).length !== 1) erros[k] = "Marque uma resposta certa.";
    return { id: k, enunciado, opcoes };
  });
  if (Object.keys(erros).length) return { ok: false, erro: "Confira o que está marcado.", erros };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("avaliacao_salvar_da_casa", {
    p_id: id,
    p_titulo: nome,
    p_descricao:
      String(descricao ?? "")
        .trim()
        .slice(0, 240) || null,
    p_questoes: limpas as unknown as Json,
  });
  if (error || !data) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora.") };
  refresh();
  return { ok: true, id: data, mensagem: "Teste salvo. Agora dá para pôr nas vagas." };
}

export async function apagarTesteDaCasa(id: string): Promise<Resultado> {
  const sem = await comConta();
  if (sem) return { ok: false, erro: sem.erro };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("avaliacao_apagar_da_casa", { p_id: id });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Teste apagado. Ele saiu das vagas; os resultados já feitos continuam." };
}

/** Manda um teste para quem curtiu a vaga. */
export async function pedirTeste(anuncioId: string, perfilId: string, modeloId: string): Promise<Resultado> {
  const sem = await comConta();
  if (sem) return { ok: false, erro: sem.erro };
  if (![anuncioId, perfilId, modeloId].every((x) => UUID.test(x))) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("avaliacao_pedir", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
    p_modelo: modeloId,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para mandar agora.") };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Teste enviado. A pessoa tem 3 dias para fazer." };
}

/** Quem curtiu a vaga abre o teste dela: devolve o endereço do teste. */
export async function comecarTesteDaVaga(anuncioId: string, modeloId: string): Promise<Resultado> {
  const sem = await comConta();
  if (sem) return { ok: false, erro: sem.erro, ir: `/entrar?next=/anuncio/${anuncioId}` };
  if (!UUID.test(anuncioId) || !UUID.test(modeloId)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("avaliacao_da_vaga_para_mim", {
    p_anuncio: anuncioId,
    p_modelo: modeloId,
  });
  if (error || !data) return { ok: false, erro: mensagemDeErro(error, "Não deu para abrir o teste agora.") };
  return { ok: false, erro: "", ir: `/testes/${data}` };
}

/** O "Começar": aceita as condições e o tempo começa a contar (mais tempo: o dobro). A página volta com as questões. */
export async function aceitarTeste(id: string, maisTempo = false): Promise<Resultado> {
  const sem = await comConta();
  if (sem) return { ok: false, erro: sem.erro };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("avaliacao_aceitar", { p_id: id, p_mais_tempo: maisTempo === true });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true };
}

export type RespostaEnvioTeste =
  { ok: true; pontos: number; maximo: number; por_competencia: unknown } | { ok: false; erro: string };

/** Manda as respostas e quantas vezes a pessoa saiu da tela; acabou o tempo, vale o que foi respondido. */
export async function enviarTeste(
  id: string,
  respostas: Record<string, string>,
  saidas = 0,
): Promise<RespostaEnvioTeste> {
  const sem = await comConta();
  if (sem) return { ok: false, erro: sem.erro };
  if (!UUID.test(id) || typeof respostas !== "object" || !respostas) return { ok: false, erro: "Pedido inválido." };
  const limpas = Object.fromEntries(
    Object.entries(respostas)
      .filter(([k, v]) => /^[a-z0-9]{1,12}$/.test(k) && typeof v === "string" && /^[a-z0-9]{1,6}$/.test(v))
      .slice(0, 40),
  );
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("avaliacao_enviar", {
    p_id: id,
    p_respostas: limpas,
    p_saidas: Number.isInteger(saidas) ? Math.min(Math.max(saidas, 0), 1000) : 0,
  });
  if (error || !data) return { ok: false, erro: mensagemDeErro(error, "Não deu para enviar agora. Tente de novo.") };
  after(processarFilas);
  const r = data as { pontos: number; maximo: number; por_competencia: unknown };
  return { ok: true, pontos: r.pontos, maximo: r.maximo, por_competencia: r.por_competencia };
}
