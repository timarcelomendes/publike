import "server-only";
import {
  BUCKET_VIDEO,
  DIAS_PARA_RESPONDER,
  lerResumoVideo,
  PRAZOS_PARA_RESPONDER,
  type ConfigVideo,
  type EntrevistaParaAssistir,
  type MinhaEntrevistaVideo,
  type SituacaoVideo,
  type VideoNoQuadro,
} from "@/lib/entrevista-video";
import { MODELO_PADRAO, iaConfigurada } from "@/lib/ia/openai";
import { resumirEntrevistaVideo } from "@/lib/ia/tarefas";
import { falaDisponivel, transcrever } from "@/lib/ia/transcrever";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Json } from "@/lib/supabase/tipos-banco";
import { acessoFila } from "./filas";

// A entrevista gravada (migração 20270105120000): o que as telas leem, os links dos vídeos (valem poucos minutos)
// e a IA (transcreve e resume pelo servidor, com a chave do servidor).

const SITUACOES: SituacaoVideo[] = ["pedida", "respondendo", "enviada", "vencida", "apagada", "cancelada"];
const situacao = (x: unknown): SituacaoVideo =>
  SITUACOES.includes(x as SituacaoVideo) ? (x as SituacaoVideo) : "pedida";

/** As perguntas e as regras da vaga (null: o banco ainda sem a migração ou a vaga não é da conta). */
export async function configVideo(anuncioId: string): Promise<ConfigVideo | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("video_config", { p_anuncio: anuncioId });
  if (error || !data || typeof data !== "object") {
    if (error && error.code !== "PGRST202")
      console.error(`Publike: falha ao ler a entrevista em vídeo: ${error.message}`);
    return null;
  }
  const o = data as Record<string, unknown>;
  const perguntas = (Array.isArray(o.perguntas) ? o.perguntas : [])
    .filter((p): p is { id: string; texto: string } => Boolean(p) && typeof p === "object")
    .map((p) => ({ id: String(p.id), texto: String(p.texto) }));
  return {
    perguntas,
    segundos: Number(o.segundos) || 90,
    segunda_chance: o.segunda_chance !== false,
    aceita_texto: o.aceita_texto !== false,
    pedir_a_todos: o.pedir_a_todos === true,
    dias: (PRAZOS_PARA_RESPONDER as readonly number[]).includes(Number(o.dias)) ? Number(o.dias) : DIAS_PARA_RESPONDER,
    pcd: o.pcd === true,
    liberado: o.liberado === true,
  };
}

/** As entrevistas da vaga por candidato (null: sem a migração). */
export async function videosDaVaga(anuncioId: string): Promise<Map<string, VideoNoQuadro> | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("video_da_vaga", { p_anuncio: anuncioId });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler as entrevistas em vídeo: ${error.message}`);
    return null;
  }
  return new Map(
    (data ?? []).map((v) => [
      v.perfil_id,
      {
        id: v.id,
        situacao: situacao(v.situacao),
        pedida_em: v.pedida_em,
        prazo: v.prazo,
        enviada_em: v.enviada_em,
        resumo: lerResumoVideo(v.resumo),
        videos_apagados: v.videos_apagados,
      },
    ]),
  );
}

/** A entrevista do candidato nesta vaga (null: não foi pedida, ou sem a migração). */
export async function minhaEntrevistaVideo(anuncioId: string): Promise<MinhaEntrevistaVideo | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("video_minha", { p_anuncio: anuncioId });
  if (error || !data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  return { ...(o as unknown as MinhaEntrevistaVideo), situacao: situacao(o.situacao) };
}

/** Uma entrevista para assistir, com os links dos vídeos (10 minutos). null: não é da conta. */
export async function entrevistaParaAssistir(id: string): Promise<EntrevistaParaAssistir | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("video_da_entrevista", { p_id: id });
  if (error || !data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const respostas = (Array.isArray(o.respostas) ? o.respostas : []) as Record<string, unknown>[];
  const caminhos = respostas.map((r) => r.caminho).filter((c): c is string => typeof c === "string");
  const links = new Map<string, string>();
  if (caminhos.length) {
    const { data: assinados } = await supabase.storage.from(BUCKET_VIDEO).createSignedUrls(caminhos, 600);
    for (const a of assinados ?? []) if (a.path && a.signedUrl) links.set(a.path, a.signedUrl);
  }
  return {
    id: String(o.id),
    situacao: situacao(o.situacao),
    enviada_em: typeof o.enviada_em === "string" ? o.enviada_em : null,
    resumo: lerResumoVideo(o.resumo),
    videos: o.videos === true,
    vence_em: String(o.vence_em),
    respostas: respostas.map((r) => ({
      pergunta_id: String(r.pergunta_id),
      pergunta: String(r.pergunta ?? ""),
      tipo: r.tipo === "video" || r.tipo === "texto" ? r.tipo : null,
      url: typeof r.caminho === "string" ? (links.get(r.caminho) ?? null) : null,
      duracao: typeof r.duracao === "number" ? r.duracao : null,
      texto: typeof r.texto === "string" ? r.texto : null,
      transcricao: typeof r.transcricao === "string" ? r.transcricao : null,
    })),
  };
}

/**
 * A IA da entrevista: transcreve os vídeos que ainda não têm transcrição e resume tudo. Os vídeos chegam pelos
 * links assinados (quem pediu já tem acesso); o resultado é guardado com a chave do servidor. Sem a IA, nada.
 */
export async function processarIAVideo(d: {
  id: string;
  vaga: { titulo: string; descricao: string };
  respostas: {
    pergunta_id: string;
    pergunta: string;
    url: string | null;
    texto: string | null;
    transcricao: string | null;
  }[];
  modelo?: string | null;
}): Promise<{ ok: boolean; erro?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { ok: false, erro: "Falta a chave do servidor." };
  const transcricoes: Record<string, string> = {};
  if (falaDisponivel()) {
    for (const r of d.respostas) {
      if (r.transcricao || !r.url) continue;
      try {
        const resposta = await fetch(r.url, { signal: AbortSignal.timeout(60_000) });
        if (!resposta.ok) continue;
        const blob = await resposta.blob();
        const ext = (blob.type || "").includes("mp4") ? "mp4" : "webm";
        transcricoes[r.pergunta_id] = await transcrever(
          blob,
          `resposta.${ext}`,
          `Uma pessoa responde a uma entrevista de emprego para a vaga de ${d.vaga.titulo}. A pergunta: ${r.pergunta}`,
        );
      } catch (e) {
        console.error("Publike: a transcrição da entrevista falhou:", e instanceof Error ? e.message : e);
      }
    }
  }
  const respostas = d.respostas.map((r) => ({
    ...r,
    transcricao: r.transcricao ?? transcricoes[r.pergunta_id] ?? null,
  }));
  let resumo: Json | null = null;
  const comConteudo = respostas.filter((r) => r.texto || r.transcricao);
  if (iaConfigurada() && comConteudo.length) {
    try {
      const linhas = [
        "<vaga>",
        `Título: ${d.vaga.titulo}`,
        `Descrição: ${d.vaga.descricao.slice(0, 1500)}`,
        "</vaga>",
        ...respostas.flatMap((r, i) => [
          `<resposta numero="${i + 1}">`,
          `Pergunta: ${r.pergunta}`,
          `Resposta: ${(r.texto ?? r.transcricao ?? "(sem resposta)").slice(0, 3000)}`,
          "</resposta>",
        ]),
      ];
      const r = await resumirEntrevistaVideo(linhas.join("\n"), d.modelo || MODELO_PADRAO);
      resumo = { resumo: r.resumo, fortes: r.fortes, conferir: r.conferir };
    } catch (e) {
      console.error("Publike: o resumo da entrevista falhou:", e instanceof Error ? e.message : e);
    }
  }
  if (!Object.keys(transcricoes).length && !resumo) return { ok: false, erro: "A IA não conseguiu agora." };
  const { error } = await acesso.cliente.rpc("servidor_video_guardar_ia", {
    p_chave: acesso.chave,
    p_id: d.id,
    p_transcricoes: transcricoes,
    p_resumo: resumo,
  });
  if (error) {
    console.error("Publike: falha ao guardar a IA da entrevista:", error.message);
    return { ok: false, erro: "Não deu para guardar agora." };
  }
  return { ok: true };
}

/** Apaga os arquivos que passaram dos 6 meses (os da conta ou os da pessoa), com o login de quem está vendo. */
export async function limparVideosVencidos(): Promise<number> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("video_vencidos", { p_limite: 200 });
  if (error || !data?.length) return 0;
  const caminhos = data.map((v) => v.caminho);
  const { error: erroApagar } = await supabase.storage.from(BUCKET_VIDEO).remove(caminhos);
  if (erroApagar) {
    console.error("Publike: falha ao apagar os vídeos vencidos:", erroApagar.message);
    return 0;
  }
  const ids = [...new Set(data.map((v) => v.entrevista_id))];
  await supabase.rpc("video_marcar_apagados", { p_ids: ids });
  return caminhos.length;
}
