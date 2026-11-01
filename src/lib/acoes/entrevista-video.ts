"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterAnuncio, obterUsuario } from "@/lib/dados";
import { BUCKET_VIDEO, MAX_PERGUNTAS, type EntrevistaParaAssistir } from "@/lib/entrevista-video";
import { mensagemDeErro } from "@/lib/erros";
import { entrevistaParaAssistir, limparVideosVencidos, processarIAVideo } from "@/lib/servidor/entrevista-video";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Entrevista gravada com IA (migração 20270105120000). As regras ficam no banco; aqui, as mensagens e a IA.

const ID_PERGUNTA = /^p[1-6]$/;

/** Salva as perguntas e as regras da entrevista da vaga. */
export async function salvarConfigVideo(
  anuncioId: string,
  d: { perguntas: string[]; segundos: number; segunda_chance: boolean; aceita_texto: boolean; pedir_a_todos: boolean },
): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Pedido inválido." };
  const perguntas = (Array.isArray(d.perguntas) ? d.perguntas : [])
    .map((p) =>
      String(p ?? "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, MAX_PERGUNTAS);
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("video_salvar_config", {
    p_anuncio: anuncioId,
    p_perguntas: perguntas,
    p_segundos: Math.round(Number(d.segundos) || 90),
    p_segunda_chance: Boolean(d.segunda_chance),
    p_aceita_texto: Boolean(d.aceita_texto),
    p_pedir_a_todos: Boolean(d.pedir_a_todos),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora.") };
  refresh();
  return { ok: true, mensagem: "Perguntas salvas." };
}

/** Pede a entrevista em vídeo a um ou vários candidatos (quem já respondeu, ou ainda está no prazo, fica de fora). */
export async function pedirVideo(anuncioId: string, perfis: string[]): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const ids = (Array.isArray(perfis) ? perfis : []).filter((x) => UUID.test(x)).slice(0, 100);
  if (!UUID.test(anuncioId) || !ids.length) return { ok: false, erro: "Escolha quem vai receber o pedido." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("video_pedir", { p_anuncio: anuncioId, p_perfis: ids });
  if (error) {
    if (error.hint === "sem_perguntas")
      return { ok: false, erro: error.message, ir: `/painel/anuncio/${anuncioId}/video` };
    return { ok: false, erro: mensagemDeErro(error, "Não deu para pedir agora.") };
  }
  after(processarFilas);
  refresh();
  const n = data ?? 0;
  const fora = ids.length - n;
  if (!n)
    return {
      ok: false,
      erro:
        ids.length === 1
          ? "Essa pessoa já tem uma entrevista em vídeo pedida ou respondida."
          : "Todos já têm uma entrevista em vídeo pedida ou respondida.",
    };
  return {
    ok: true,
    mensagem: `${n === 1 ? "Pedido enviado" : `${n} pedidos enviados`}: a pessoa tem 5 dias para responder.${
      fora ? ` ${fora === 1 ? "1 já tinha" : `${fora} já tinham`} o pedido.` : ""
    }`,
  };
}

/** O candidato abre uma pergunta (o tempo começa a contar a partir daqui). */
export async function verPergunta(
  id: string,
  pergunta: string,
): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || !ID_PERGUNTA.test(pergunta)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("video_ver_pergunta", { p_id: id, p_pergunta: pergunta });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para abrir a pergunta.") };
  return { ok: true, texto: data ?? "" };
}

/** A gravação já subiu para o bucket: guarda a resposta e apaga a gravação de antes (a segunda tentativa). */
export async function registrarResposta(
  id: string,
  pergunta: string,
  caminho: string,
  duracao: number,
): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || !ID_PERGUNTA.test(pergunta) || typeof caminho !== "string")
    return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { data: antes, error } = await supabase.rpc("video_registrar", {
    p_id: id,
    p_pergunta: pergunta,
    p_caminho: caminho,
    p_duracao: Math.max(1, Math.round(Number(duracao) || 1)),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para guardar a resposta.") };
  if (antes) await supabase.storage.from(BUCKET_VIDEO).remove([antes]);
  return { ok: true, mensagem: "Resposta guardada." };
}

/** Responde por escrito (quando a empresa deixa; em vaga exclusiva para PCD, sempre). */
export async function responderPorTexto(id: string, pergunta: string, texto: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || !ID_PERGUNTA.test(pergunta)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { data: antes, error } = await supabase.rpc("video_responder_texto", {
    p_id: id,
    p_pergunta: pergunta,
    p_texto: String(texto ?? "").slice(0, 2000),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para guardar a resposta.") };
  if (antes) await supabase.storage.from(BUCKET_VIDEO).remove([antes]);
  return { ok: true, mensagem: "Resposta guardada." };
}

/** Envia a entrevista; a IA transcreve e resume depois da resposta (o candidato não espera). */
export async function enviarEntrevistaVideo(id: string, anuncioId: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || !UUID.test(anuncioId)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("video_enviar", { p_id: id });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para enviar agora.") };
  // os links saem agora, com o login de quem enviou (depois da resposta, não há mais o login)
  const [entrevista, anuncio] = await Promise.all([entrevistaParaAssistir(id), obterAnuncio(anuncioId)]);
  if (entrevista && anuncio) {
    after(async () => {
      await processarIAVideo({
        id,
        vaga: { titulo: anuncio.titulo, descricao: anuncio.descricao ?? "" },
        respostas: entrevista.respostas,
      });
    });
  }
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Entrevista enviada. A empresa recebeu o aviso." };
}

/** O candidato apaga a entrevista: os vídeos, as transcrições e o resumo. */
export async function apagarMinhaEntrevistaVideo(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { data: caminhos, error } = await supabase.rpc("video_apagar", { p_id: id });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para apagar agora.") };
  if (caminhos?.length) {
    const { error: erroArquivos } = await supabase.storage.from(BUCKET_VIDEO).remove(caminhos);
    if (erroArquivos) console.error("Publike: falha ao apagar os vídeos:", erroArquivos.message);
  }
  refresh();
  return { ok: true, mensagem: "Pronto: seus vídeos e as respostas desta entrevista foram apagados." };
}

/** A empresa abre a entrevista para assistir (os links valem 10 minutos). Apaga antes o que já venceu. */
export async function abrirEntrevistaVideo(
  id: string,
): Promise<{ ok: true; entrevista: EntrevistaParaAssistir } | { ok: false; erro: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta." };
  after(() => limparVideosVencidos().then(() => undefined));
  const entrevista = await entrevistaParaAssistir(id);
  if (!entrevista) return { ok: false, erro: "Entrevista não encontrada." };
  return { ok: true, entrevista };
}

/** A IA de novo (quando falhou ou ainda não rodou), pela empresa. */
export async function refazerIAVideo(id: string, anuncioId: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || !UUID.test(anuncioId)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  const anuncio = await obterAnuncio(anuncioId);
  if (!usuario || !anuncio || anuncio.autor_id !== usuario.id) return { ok: false, erro: "Vaga não encontrada." };
  const entrevista = await entrevistaParaAssistir(id);
  if (!entrevista || entrevista.situacao !== "enviada") return { ok: false, erro: "Entrevista não encontrada." };
  const r = await processarIAVideo({
    id,
    vaga: { titulo: anuncio.titulo, descricao: anuncio.descricao ?? "" },
    respostas: entrevista.respostas,
  });
  if (!r.ok) return { ok: false, erro: r.erro ?? "A IA não conseguiu agora. Tente de novo." };
  refresh();
  return { ok: true, mensagem: "Pronto: a transcrição e o resumo saíram." };
}
