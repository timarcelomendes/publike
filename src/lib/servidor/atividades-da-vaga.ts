import "server-only";
import { createHash } from "node:crypto";
import { mesesDoTrabalhoDoCurriculo, trabalhosNaMesmaFuncao, type AtividadesDaVaga } from "@/lib/aderencia";
import { lerExperiencias } from "@/lib/dados";
import { compararAtividadesComIA, daParaComparar, type TrabalhoParaComparar } from "@/lib/ia/atividades";
import { iaConfigurada } from "@/lib/ia/openai";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Experiencia } from "@/lib/tipos";
import { acessoFila } from "./filas";
import { comFuncoes } from "./funcoes-pelo-contexto";

// As atividades da vaga (migração 20270831120000): o robô das filas escolhe os pares em que a resposta muda a nota
// (quem se candidatou a uma vaga no ar ou está visível em Talentos e tem trabalho na mesma função da vaga), primeiro
// os candidatos, e pede à IA (o Haiku, se ninguém escolheu outro em Admin › Qualificados) se a pessoa fazia as mesmas
// atividades. A resposta fica guardada pela impressão da vaga e dos trabalhos: a IA só relê se um dos dois mudar.
// As telas leem com atividadesDaVaga (quem publicou) e minhasAtividades (quem procura).

export const MODELO_DAS_ATIVIDADES = "claude-haiku-5-5";
export const MODELOS_DA_COMPARACAO_DAS_ATIVIDADES = ["claude-haiku-5-5", "claude-sonnet-5-5"] as const;

type VagaDosDados = { id: string; titulo: string; descricao: string; cbo: string };
export type DadosParaAtividades = {
  vagas: VagaDosDados[];
  candidaturas: { anuncio_id: string; perfil_id: string }[];
  pessoas: { perfil_id: string; experiencias: unknown }[];
  lidos: { anuncio_id: string; perfil_id: string; impressao: string }[];
};

/** Um par para a IA: a vaga, a pessoa, os trabalhos na mesma função e a impressão dos dois. */
export type ParDasAtividades = {
  vaga: { id: string; titulo: string; descricao: string };
  perfil_id: string;
  candidato: boolean;
  trabalhos: TrabalhoParaComparar[];
  impressao: string;
};

/** A impressão do que a IA compara: a vaga e os trabalhos (muda um dos dois, a IA relê). */
export function impressaoDoPar(vaga: { titulo: string; descricao: string }, trabalhos: TrabalhoParaComparar[]) {
  const texto = [vaga.titulo, vaga.descricao, ...trabalhos.map((t) => `${t.cargo}|${t.descricao}`)].join("\n");
  return createHash("md5").update(texto).digest("hex");
}

/**
 * Os pares que faltam ler (novos ou mudados), primeiro quem se candidatou, depois os de Talentos, das vagas mais novas
 * para as mais antigas (a ordem do banco). Sem o que a pessoa fazia em nenhum trabalho da função, o par fica "sem".
 */
export async function paresParaLer(dados: DadosParaAtividades, agora = Date.now(), incluirLidos = false) {
  const lidos = new Map(dados.lidos.map((l) => [`${l.anuncio_id}:${l.perfil_id}`, l.impressao]));
  const candidatos = new Set(dados.candidaturas.map((k) => `${k.anuncio_id}:${k.perfil_id}`));
  const porVaga = new Map<string, Set<string>>();
  for (const k of dados.candidaturas) {
    if (!porVaga.has(k.anuncio_id)) porVaga.set(k.anuncio_id, new Set());
    porVaga.get(k.anuncio_id)!.add(k.perfil_id);
  }
  // as experiências com a ocupação da CBO (uma leitura no banco para todas)
  const pessoas = await comFuncoes(dados.pessoas.map((p) => ({ perfil_id: p.perfil_id, experiencias: lerExperiencias(p.experiencias) })));
  const pares: ParDasAtividades[] = [];
  for (const v of dados.vagas) {
    for (const p of pessoas) {
      const chave = `${v.id}:${p.perfil_id}`;
      const mesmas = trabalhosNaMesmaFuncao({ titulo: v.titulo, cbo: v.cbo }, p.experiencias as Experiencia[]);
      if (!mesmas.length) continue;
      const trabalhos = mesmas.slice(0, 4).map((e) => {
        const meses = mesesDoTrabalhoDoCurriculo(e, agora);
        return { cargo: e.cargo, meses: meses || null, descricao: e.descricao ?? "" };
      });
      const vaga = { id: v.id, titulo: v.titulo, descricao: v.descricao };
      const impressao = impressaoDoPar(vaga, trabalhos);
      if (!incluirLidos && lidos.get(chave) === impressao) continue;
      pares.push({ vaga, perfil_id: p.perfil_id, candidato: candidatos.has(chave), trabalhos, impressao });
    }
  }
  // quem se candidatou primeiro: é quem a empresa olha
  return pares.sort((a, b) => Number(b.candidato) - Number(a.candidato));
}

/** Compara um par: a resposta da IA, "sem" (não dá para comparar ou a resposta não serviu) ou null (a IA falhou). */
export async function compararPar(par: ParDasAtividades, modelo: string) {
  if (!daParaComparar(par.vaga, par.trabalhos)) return { resultado: "sem" as const, trecho: "", modelo: null };
  const r = await compararAtividadesComIA(par.vaga, par.trabalhos, modelo);
  return r ?? { resultado: "sem" as const, trecho: "", modelo };
}

/** O robô das filas: até `limite` pares por rodada, 3 de cada vez. */
export async function atividadesDasVagas(limite = 6): Promise<{ lidos: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso || !iaConfigurada()) return { lidos: 0 };
  const { cliente, chave } = acesso;
  const { data: config, error: erroConfig } = await cliente.rpc("servidor_config_atividades", { p_chave: chave });
  if (erroConfig) {
    if (erroConfig.code === "PGRST202") return { lidos: 0 };
    console.error("Publike: falha ao ler a configuração das atividades:", erroConfig.message);
    return { lidos: 0, motivo: "Não foi possível ler a configuração das atividades da vaga." };
  }
  const cfg = config as { ligado?: boolean; modelo?: string | null } | null;
  if (!cfg?.ligado) return { lidos: 0 };
  const modelo = cfg.modelo || MODELO_DAS_ATIVIDADES;
  const { data, error } = await cliente.rpc("servidor_dados_para_atividades", { p_chave: chave });
  if (error || !data) {
    console.error("Publike: falha ao ler os pares das atividades:", error?.message);
    return { lidos: 0, motivo: "Não foi possível ler os pares das atividades da vaga." };
  }
  const todos = await paresParaLer(data as unknown as DadosParaAtividades);
  // sem o que a pessoa fazia (ou a vaga sem descrição) não dá para comparar: fica "sem" na hora, sem a IA
  const semComo = todos.filter((p) => !daParaComparar(p.vaga, p.trabalhos)).slice(0, 50);
  const pares = todos.filter((p) => daParaComparar(p.vaga, p.trabalhos)).slice(0, limite);
  let lidos = 0;
  for (const p of semComo) {
    const { error: e } = await cliente.rpc("servidor_guardar_atividades", {
      p_chave: chave,
      p_anuncio: p.vaga.id,
      p_perfil: p.perfil_id,
      p_impressao: p.impressao,
      p_resultado: "sem",
      p_trecho: "",
      p_modelo: "",
    });
    if (e) console.error("Publike: falha ao guardar as atividades:", e.message);
  }
  for (let i = 0; i < pares.length; i += 3) {
    const lote = pares.slice(i, i + 3);
    const respostas = await Promise.all(
      lote.map((p) =>
        compararPar(p, modelo).catch((e) => {
          // a IA falhou: o par volta na próxima rodada
          console.error("Publike: a IA não comparou as atividades:", e instanceof Error ? e.message : e);
          return null;
        }),
      ),
    );
    for (const [k, r] of respostas.entries()) {
      if (!r) continue;
      const p = lote[k];
      const { error: e } = await cliente.rpc("servidor_guardar_atividades", {
        p_chave: chave,
        p_anuncio: p.vaga.id,
        p_perfil: p.perfil_id,
        p_impressao: p.impressao,
        p_resultado: r.resultado,
        p_trecho: r.trecho,
        p_modelo: r.modelo ?? "",
      });
      if (e) console.error("Publike: falha ao guardar as atividades:", e.message);
      else lidos++;
    }
  }
  return { lidos };
}

const comoAtividades = (l: { resultado: string; trecho: string }): AtividadesDaVaga | null =>
  l.resultado === "sim" || l.resultado === "parte" || l.resultado === "nao"
    ? { resultado: l.resultado, trecho: l.trecho }
    : null;

/** Quem publicou: as atividades lidas de quem está na vaga (por pessoa). Sem a migração ou com falha, nenhuma. */
export async function atividadesDaVaga(anuncioId: string): Promise<Map<string, AtividadesDaVaga>> {
  try {
    const c = await criarClienteServidor();
    const { data, error } = await c.rpc("atividades_da_vaga", { p_anuncio: anuncioId });
    if (error) return new Map();
    return new Map(
      (data ?? []).flatMap((l) => {
        const a = comoAtividades(l);
        return a ? [[l.perfil_id, a] as const] : [];
      }),
    );
  } catch {
    return new Map();
  }
}

/** Quem procura: as próprias atividades lidas (por vaga). Sem a migração, sem login ou com falha, nenhuma. */
export async function minhasAtividades(): Promise<Map<string, AtividadesDaVaga>> {
  try {
    const c = await criarClienteServidor();
    const { data, error } = await c.rpc("minhas_atividades");
    if (error) return new Map();
    return new Map(
      (data ?? []).flatMap((l) => {
        const a = comoAtividades(l);
        return a ? [[l.anuncio_id, a] as const] : [];
      }),
    );
  } catch {
    return new Map();
  }
}
