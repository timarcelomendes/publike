import "server-only";
import { ocupacao, type Ocupacao } from "@/lib/cbo";
import { nomeDisponibilidade, nomeEscolaridade } from "@/lib/constantes";
import { tituloDaFuncao } from "@/lib/funcao-cbo";
import type { OpcaoDeFuncao } from "@/lib/ia/funcao";
import { lerCurriculoComIA, type CurriculoParaLer, type LeituraDoCurriculo } from "@/lib/ia/leitura-curriculo";
import { iaConfigurada } from "@/lib/ia/openai";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { acessoFila } from "./filas";
import { opcoesParaIA } from "./funcao";
import { chaveDaExperiencia } from "./funcoes-pelo-contexto";

// A leitura do currículo (migração 20270826120000; claude/plano-curriculos-qualificados.md). O robô das filas lê os
// currículos visíveis em Talentos que são novos ou mudaram, com o modelo escolhido em Admin › Qualificados (o
// Sonnet, se ninguém escolheu), e guarda as funções indicadas, a nota e os pontos a melhorar. Desligado até o admin
// ligar. A comparação Sonnet x Opus (Admin › Qualificados) usa a mesma leitura, sem guardar nada.

export const MODELO_DA_LEITURA = "claude-sonnet-5-5";
export const MODELOS_DA_COMPARACAO = ["claude-sonnet-5-5", "claude-opus-5-5"] as const;

/** A linha do currículo como o banco devolve. */
export type LinhaDoCurriculo = {
  titulo: string | null;
  experiencias: unknown;
  escolaridade: string | null;
  curso: string | null;
  estudos: unknown;
  cursos: string[] | null;
  habilidades: string[] | null;
  cnh: string | null;
  disponibilidade: string[] | null;
};

const mesDe = (t: unknown) => {
  const m = typeof t === "string" ? /^(\d{4})-(\d{2})/.exec(t) : null;
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
};

/** As experiências com o tempo já contado (a IA não faz conta de datas). */
export function paraLer(c: LinhaDoCurriculo, agora = new Date()): CurriculoParaLer {
  const hoje = agora.getFullYear() * 12 + agora.getMonth();
  const exps = (Array.isArray(c.experiencias) ? c.experiencias : [])
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object" && typeof e.cargo === "string")
    .filter((e) => String(e.cargo).trim())
    .slice(0, 10)
    .map((e) => {
      const ini = mesDe(e.inicio);
      const atual = e.fim == null || e.atual === true;
      const fim = atual ? hoje : mesDe(e.fim);
      return {
        cargo: String(e.cargo),
        onde: typeof e.onde === "string" ? e.onde : null,
        meses: ini != null && fim != null && fim >= ini ? fim - ini + 1 : null,
        atual,
        descricao: typeof e.descricao === "string" ? e.descricao : "",
      };
    });
  const estudos = (Array.isArray(c.estudos) ? c.estudos : [])
    .filter((e): e is { nivel?: string; curso?: string } => Boolean(e) && typeof e === "object")
    .map((e) => [nomeEscolaridade(e.nivel ?? null), e.curso].filter(Boolean).join(", "))
    .filter(Boolean);
  return {
    titulo: c.titulo,
    experiencias: exps,
    escolaridade: c.escolaridade ? nomeEscolaridade(c.escolaridade) : null,
    curso: c.curso,
    estudos,
    cursos: c.cursos ?? [],
    habilidades: c.habilidades ?? [],
    cnh: c.cnh,
    disponibilidade: (c.disponibilidade ?? []).map(nomeDisponibilidade),
  };
}

/**
 * As ocupações que a IA pode escolher: as que o robô das experiências já achou, as do "o que eu faço", as de cada
 * cargo e o que ele fazia, e as dos cursos (o primeiro emprego). Até 25, sem repetir.
 */
export async function opcoesDaLeitura(cv: CurriculoParaLer): Promise<OpcaoDeFuncao[]> {
  const vistas = new Set<string>();
  const opcoes: OpcaoDeFuncao[] = [];
  const somar = (o: Pick<Ocupacao, "cbo" | "nome" | "sinonimos"> | null) => {
    if (!o || vistas.has(o.cbo)) return;
    vistas.add(o.cbo);
    opcoes.push({ cbo: o.cbo, nome: o.nome, sinonimos: o.sinonimos });
  };
  const chaves = cv.experiencias.map((e) => chaveDaExperiencia({ cargo: e.cargo, descricao: e.descricao }));
  if (chaves.length) {
    const { data } = await criarClientePublico().rpc("funcoes_das_experiencias", { p_chaves: [...new Set(chaves)] });
    for (const l of data ?? []) somar(ocupacao(l.cbo));
  }
  if (cv.titulo) for (const o of opcoesParaIA(cv.titulo, null, true).slice(0, 6)) somar(o);
  for (const e of cv.experiencias) for (const o of opcoesParaIA(e.cargo, e.descricao, true).slice(0, 5)) somar(o);
  for (const c of [cv.curso, ...cv.cursos].filter(Boolean) as string[])
    for (const o of opcoesParaIA(c, null).slice(0, 2)) somar(o);
  return opcoes.slice(0, 25);
}

/** O nome que aparece (e que a busca de Talentos acha): o título curto das funções comuns, senão o nome da CBO. */
export function nomeDaFuncao(cbo: string) {
  return tituloDaFuncao(cbo) ?? ocupacao(cbo)?.nome ?? cbo;
}

/** Lê um currículo: a leitura com o nome de cada função, ou null (nada para ler ou a IA não respondeu certo). */
export async function lerCurriculo(c: LinhaDoCurriculo, modelo: string) {
  const cv = paraLer(c);
  const opcoes = await opcoesDaLeitura(cv);
  const r = await lerCurriculoComIA(cv, opcoes, modelo);
  if (!r) return null;
  return { ...r, funcoes: r.funcoes.map((f) => ({ ...f, nome: nomeDaFuncao(f.cbo) })), opcoes: opcoes.length };
}
export type LeituraComNomes = Omit<LeituraDoCurriculo, "funcoes"> & {
  funcoes: (LeituraDoCurriculo["funcoes"][number] & { nome: string })[];
  modelo: string;
  tokens: { entrada: number; saida: number } | null;
  opcoes: number;
};

/** O robô das filas: até `limite` currículos de Talentos novos ou mudados por rodada. */
export async function leiturasDosCurriculos(limite = 3): Promise<{ lidos: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso || !iaConfigurada()) return { lidos: 0 };
  const { cliente, chave } = acesso;
  const { data: config, error: erroConfig } = await cliente.rpc("servidor_config_leitura", { p_chave: chave });
  // sem a migração ou desligado: nada
  if (erroConfig || !config || !(config as { ligado?: boolean }).ligado) return { lidos: 0 };
  const modelo = (config as { modelo?: string | null }).modelo || MODELO_DA_LEITURA;
  const { data: linhas, error } = await cliente.rpc("servidor_curriculos_para_leitura", { p_chave: chave, p_limite: limite });
  if (error) {
    console.error("Publike: falha ao buscar os currículos para ler:", error.message);
    return { lidos: 0, motivo: "Não foi possível buscar os currículos para ler." };
  }
  let lidos = 0;
  // os poucos da rodada ao mesmo tempo (cada leitura leva uns segundos; a rodada das filas tem 40 s)
  const lidas = await Promise.all(
    (linhas ?? []).map((l) =>
      lerCurriculo(l, modelo).catch((e) => {
        // a IA falhou: o currículo volta na próxima rodada
        console.error("Publike: a IA não leu o currículo:", e instanceof Error ? e.message : e);
        return null;
      }),
    ),
  );
  for (const [i, l] of (linhas ?? []).entries()) {
    const r = lidas[i];
    if (!r) continue;
    const { error: e } = await cliente.rpc("servidor_guardar_leitura", {
      p_chave: chave,
      p_perfil: l.perfil_id,
      p_impressao: l.impressao,
      p_funcoes: r.funcoes,
      p_nota: r.nota,
      p_melhorar: r.melhorar,
      p_modelo: r.modelo,
    });
    if (e) console.error("Publike: falha ao guardar a leitura do currículo:", e.message);
    else lidos++;
  }
  return { lidos };
}
