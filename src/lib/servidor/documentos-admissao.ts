import "server-only";
import { BUCKET_DOCUMENTOS, lerDocumentos, type DocumentosDaProposta } from "@/lib/documentos-admissao";
import { SUPABASE_CHAVE, SUPABASE_URL } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { acessoFila } from "./filas";

// Os documentos da admissão (migração 20270312120000; src/lib/documentos-admissao.ts). Sem a migração: null ou vazio.

/** Os meus documentos de uma proposta aceita (undefined: sem a migração; null: não há). */
export async function meusDocumentos(anuncioId: string): Promise<DocumentosDaProposta | null | undefined> {
  const { data, error } = await (await criarClienteServidor()).rpc("meus_documentos_admissao", { p_anuncio: anuncioId });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler os documentos: ${error.message}`);
    return undefined;
  }
  return lerDocumentos(data);
}

/** O resumo dos documentos de cada contratado de uma vaga da conta (perfil → documentos, sem os caminhos). */
export async function documentosDaVaga(anuncioId: string): Promise<Map<string, DocumentosDaProposta>> {
  const { data, error } = await (await criarClienteServidor()).rpc("documentos_da_vaga", { p_anuncio: anuncioId });
  const mapa = new Map<string, DocumentosDaProposta>();
  if (error || !data) return mapa;
  for (const x of data as unknown[]) {
    const d = lerDocumentos(x);
    if (d) mapa.set(d.perfilId, d);
  }
  return mapa;
}

/** Os documentos de um contratado, com os caminhos (para baixar). */
export async function documentosDoContratado(
  anuncioId: string,
  perfilId: string,
): Promise<(DocumentosDaProposta & { nome: string }) | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("documentos_do_contratado", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
  });
  if (error || !data) return null;
  const d = lerDocumentos(data);
  return d ? { ...d, nome: String((data as Record<string, unknown>).nome ?? "") } : null;
}

export type DocumentosPendentes = {
  anuncioId: string;
  perfilId: string;
  nome: string;
  vaga: string;
  inicio: string;
  total: number;
  enviados: number;
  levar: number;
};

/** Para o Agora e Esta semana: quem começa (ou começou há até 7 dias) com documentos ainda não entregues. */
export async function documentosPendentesDaConta(): Promise<DocumentosPendentes[]> {
  const { data, error } = await (await criarClienteServidor()).rpc("documentos_pendentes_da_conta");
  if (error || !data) return [];
  return data.map((d) => ({
    anuncioId: d.anuncio_id,
    perfilId: d.perfil_id,
    nome: d.nome,
    vaga: d.vaga,
    inicio: String(d.inicio).slice(0, 10),
    total: Number(d.total),
    enviados: Number(d.enviados),
    levar: Number(d.levar),
  }));
}

/** Apaga do Storage os arquivos que a pessoa trocou ou tirou (com o login dela). */
export async function apagarArquivosDeDocumento(caminhos: string[]) {
  if (!caminhos.length) return;
  const { error } = await (await criarClienteServidor()).storage.from(BUCKET_DOCUMENTOS).remove(caminhos);
  if (error) console.error(`Publike: falha ao apagar documentos trocados: ${error.message}`);
}

/**
 * A tarefa das filas: apaga os arquivos que venceram (7 dias depois da entrega ao contador ou 30 depois do primeiro
 * dia). No site no ar, quem apaga é a Edge Function "limpar-documentos" (claude/plano-seguranca.md, item 2): ela
 * usa a chave secreta que fica no próprio Supabase, e os arquivos nunca abrem para quem não entrou.
 */
export async function limparDocumentosVencidos(): Promise<{ apagados: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { apagados: 0 };
  if (acesso.chave) {
    const pelaFuncao = await limparPelaFuncao(acesso.chave);
    if (pelaFuncao) return pelaFuncao;
    // função ainda não publicada: o jeito antigo (só funciona enquanto o banco tiver a regra para "anon")
  }
  return limparPeloSite(acesso);
}

/** Pede a limpeza à Edge Function. null: a função ainda não existe no Supabase. */
async function limparPelaFuncao(chave: string): Promise<{ apagados: number; motivo?: string } | null> {
  let resposta: Response;
  try {
    resposta = await fetch(`${SUPABASE_URL}/functions/v1/limpar-documentos`, {
      method: "POST",
      headers: { "x-publike-chave": chave, apikey: SUPABASE_CHAVE, "content-type": "application/json" },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    console.error("Publike: a limpeza dos documentos não respondeu:", e instanceof Error ? e.message : e);
    return { apagados: 0, motivo: "Não foi possível apagar os documentos vencidos." };
  }
  if (resposta.status === 404) return null;
  const corpo = (await resposta.json().catch(() => ({}))) as { apagados?: number; erro?: string };
  if (!resposta.ok) {
    console.error(`Publike: a limpeza dos documentos falhou (${resposta.status}):`, corpo.erro ?? "");
    return { apagados: 0, motivo: "Não foi possível apagar os documentos vencidos." };
  }
  return { apagados: Number(corpo.apagados ?? 0) };
}

/** O jeito antigo, pelo próprio site (no computador do admin, com a chave secreta, continua valendo). */
async function limparPeloSite(acesso: NonNullable<ReturnType<typeof acessoFila>>): Promise<{ apagados: number; motivo?: string }> {
  const { data, error } = await acesso.cliente.rpc("servidor_documentos_vencidos", { p_chave: acesso.chave, p_limite: 200 });
  if (error) {
    if (error.code === "PGRST202") return { apagados: 0 };
    console.error("Publike: falha ao achar os documentos vencidos:", error.message);
    return { apagados: 0, motivo: "Não foi possível conferir os documentos vencidos." };
  }
  const caminhos = (data ?? []).map((d) => d.caminho);
  if (caminhos.length) {
    const { error: erroApagar } = await acesso.cliente.storage.from(BUCKET_DOCUMENTOS).remove(caminhos);
    if (erroApagar) {
      console.error("Publike: falha ao apagar os documentos vencidos:", erroApagar.message);
      return { apagados: 0, motivo: "Não foi possível apagar os documentos vencidos." };
    }
  }
  const propostas = [...new Set((data ?? []).map((d) => d.proposta_id))];
  const { error: erroMarcar } = await acesso.cliente.rpc("servidor_documentos_apagados", {
    p_chave: acesso.chave,
    p_propostas: propostas,
  });
  if (erroMarcar) console.error("Publike: falha ao marcar os documentos apagados:", erroMarcar.message);
  return { apagados: caminhos.length };
}

/** A tarefa das filas: 2 dias antes do primeiro dia, o lembrete para quem ainda não mandou os documentos. */
export async function lembrarDocumentos(): Promise<{ lembrados: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { lembrados: 0 };
  const { data, error } = await acesso.cliente.rpc("servidor_lembrete_documentos", { p_chave: acesso.chave });
  if (error) {
    if (error.code === "PGRST202") return { lembrados: 0 };
    console.error("Publike: falha no lembrete dos documentos:", error.message);
    return { lembrados: 0, motivo: "Não foi possível lembrar dos documentos da admissão." };
  }
  return { lembrados: Number(data ?? 0) };
}
