import "server-only";
import {
  calcularAderencia,
  matchComAVaga,
  outraArea,
  perfilDaVaga,
  requisitosDaVaga,
  type Aderencia,
  type CamposDaVaga,
  type Candidato,
} from "@/lib/aderencia";
import { comFuncaoDasVagas, comFuncoes } from "@/lib/servidor/funcoes-pelo-contexto";
import { cidadesPerto, comoCurriculo, MINIMO } from "@/lib/servidor/combinam";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { entraEmParaAVaga } from "@/lib/talentos";
import * as antes from "./aderencia-de-antes";

// Admin › Nota de aderência (11/11/2026, claude/plano-pesos-da-aderencia.md; de novo em 22/11/2026, o tempo na função
// e o verde da vaga de entrada só para a mesma função): a conta de antes (congelada em ./aderencia-de-antes.ts) e a
// nova, lado a lado, nas vagas no ar. As atividades lidas pela IA ficam de fora (só valem quando ligadas). Para conferir, antes do push, quantas candidaturas
// mudam de cor, quantas pessoas entram ou saem de Talentos › Para a sua vaga e de "Vagas que combinam" (o aviso de
// segunda e o convite automático). Sem as perguntas com resposta procurada (a resposta fica guardada à parte): as duas
// contas ficam sem elas. Sem migração: o admin lê as tabelas com a chave de serviço.

export type Cor = "verde" | "amarela" | "cinza" | "sem";
export const CORES: Cor[] = ["verde", "amarela", "cinza", "sem"];

/** A cor do selo: verde a partir de 80%, amarela a partir de 50%, cinza abaixo; sem nota. */
export function corDaNota(n: number | null | undefined): Cor {
  return n === null || n === undefined ? "sem" : n >= 80 ? "verde" : n >= 50 ? "amarela" : "cinza";
}

export type MudancaDeNota = {
  vagaId: string;
  vaga: string;
  perfilId: string;
  antes: number | null;
  depois: number | null;
  motivo: string;
};

export type RelatorioAderencia = {
  vagas: { total: number; perfis: { nome: string; quantas: number }[] };
  candidaturas: {
    total: number;
    matriz: Record<Cor, Record<Cor, number>>;
    subiram: number;
    desceram: number;
    motivos: { nome: string; quantas: number }[];
    maiores: MudancaDeNota[];
  };
  talentos: {
    pessoas: number;
    antes: number;
    depois: number;
    entram: number;
    saem: number;
    vagas: VagaDeTalentos[];
    porQueEntram: Contagem[];
    porQueSaem: Contagem[];
  };
  combinam: { antes: number; depois: number; entram: number; saem: number; porQueEntram: Contagem[]; porQueSaem: Contagem[] };
  /** a lista de talentos foi cortada (as mais novas primeiro) */
  cortado: boolean;
};

export type VagaDeTalentos = { vagaId: string; vaga: string; antes: number; depois: number };
export type Contagem = { nome: string; quantas: number };

/** A experiência na função pela conta nova: a mesma função (1), com o tempo (`parte` do item) */
const naMesmaFuncao = (a: Aderencia) => a.funcao !== null && a.funcao >= 1;
/** O item da função vale menos de 75% pelo tempo (menos de 1 ano na mesma função, ou sem as datas) */
const poucoTempo = (a: Aderencia) => {
  const k = a.criterios.find((x) => x.funcao);
  if (!k || !naMesmaFuncao(a)) return false;
  const vale = a.perfil === "entrada" ? ((k.parte ?? 1) - 0.5) * 2 : (k.parte ?? 1);
  return vale < 0.75;
};

/** Por que alguém sai de Talentos › Para a sua vaga (o primeiro motivo que vale). */
function porQueSai(a1: Aderencia) {
  if (a1.faltam.length) return "Falta algo que a vaga pede (escolaridade, CNH ou horário)";
  if (a1.perfil === "entrada" && !naMesmaFuncao(a1)) return "Vaga de entrada sem a mesma função (até 79%)";
  if (poucoTempo(a1)) return "Pouco tempo na mesma função";
  return "Outros";
}

/** Por que alguém entra em Talentos › Para a sua vaga. */
function porQueEntra(a1: Aderencia) {
  return naMesmaFuncao(a1) ? "Na mesma função" : "Outros";
}

/** Por que um par passa a combinar. */
function porQueCombina(m: Aderencia | null) {
  return m && naMesmaFuncao(m) ? "Na mesma função" : "Outros";
}

/** Por que um par deixa de combinar. */
function porQueDeixa(m: Aderencia | null) {
  if (!m) return "Sem % pela conta nova";
  if (m.faltam.length) return "Falta algo que a vaga pede (até 45%)";
  if (outraArea(m)) return "Outra área pela conta nova";
  if (m.perfil === "entrada" && !naMesmaFuncao(m)) return "Vaga de entrada sem a mesma função (até 79% ou 72%)";
  if (poucoTempo(m)) return "Pouco tempo na mesma função";
  return "Ficou abaixo de 70%";
}

/** Soma um motivo. */
const somar = (m: Map<string, number>, nome: string) => m.set(nome, (m.get(nome) ?? 0) + 1);

const COLUNAS_DA_VAGA =
  "id, titulo, descricao, cidade, bairro, escolaridade_minima, experiencia, cnh, jornada, horario, horario_detalhe";
const MAX_VAGAS = 500;
/** Quantos talentos entram na conta (os de currículo mais novo), como a lista de Talentos (até 500). */
const MAX_TALENTOS = 500;

type Vaga = CamposDaVaga & { id: string };
type Pessoa = { id: string; cidade: string | null; bairro: string | null; curriculo: NonNullable<Candidato["curriculo"]> };

/** Em partes de 200, para o endereço não ficar grande demais. */
async function emPartes<T>(ids: string[], ler: (parte: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const tudo: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await ler(ids.slice(i, i + 200));
    if (error) throw new Error(`Publike: não deu para ler os dados da nota de aderência (${error.message}).`);
    tudo.push(...(data ?? []));
  }
  return tudo;
}

/** O motivo da vaga ser de entrada ou de experiência, para a contagem. */
function motivoDoPerfil(v: Vaga) {
  if (v.experiencia === "sem") return "Entrada: marca “Aceita sem experiência”";
  if (v.experiencia) return "Experiência: pede tempo de experiência";
  return perfilDaVaga(v) === "entrada"
    ? "Entrada: “Não informar”, pelo título ou pelo texto"
    : "Experiência: “Não informar”, pela função";
}

/** Por que a nota de uma candidatura mudou (o primeiro motivo que vale). */
function motivoDaMudanca(depois: Aderencia) {
  if (depois.faltam.length) return "Falta algo que a vaga pede (até 45%)";
  if (depois.perfil === "entrada" && !naMesmaFuncao(depois)) {
    return depois.funcao !== null && depois.funcao >= 0.5
      ? "Vaga de entrada: área parecida, estudo ou curso (até 79%)"
      : "Vaga de entrada: nada da função (até 72%)";
  }
  if (poucoTempo(depois)) return "Pouco tempo na mesma função";
  if (naMesmaFuncao(depois)) return "O tempo na mesma função";
  return "Outros";
}

/** Entrava em Talentos › Para a sua vaga pela regra de antes (a mesma regra, com a nota de antes). */
function entravaAntes(a: antes.Aderencia) {
  return entraEmParaAVaga(a as unknown as Aderencia);
}

/** "Vagas que combinam" de antes: 70% ou mais e não é de outra área. */
function combinavaAntes(a: antes.Aderencia | null) {
  return Boolean(a && (a.nota ?? 0) >= MINIMO && !antes.outraArea(a));
}

function combinaAgora(a: Aderencia | null) {
  return Boolean(a && (a.nota ?? 0) >= MINIMO && !outraArea(a));
}

export async function relatorioDaAderencia(c: ClienteBanco, agora: number): Promise<RelatorioAderencia> {
  const { data: linhas, error } = await c
    .from("anuncios")
    .select(COLUNAS_DA_VAGA)
    .eq("tipo", "vaga")
    .eq("status", "ativo")
    .is("preenchida_em", null)
    .gt("expira_em", new Date(agora).toISOString())
    .order("criado_em", { ascending: false })
    .limit(MAX_VAGAS);
  if (error) throw new Error(`Publike: não deu para ler as vagas no ar (${error.message}).`);
  const vagas = (await comFuncaoDasVagas(
    (linhas ?? []).map((v) => ({ ...v, descricao: v.descricao ?? "", cbo: null as string | null })),
  )) as Vaga[];
  const ids = vagas.map((v) => v.id);

  const curtidas = await emPartes(ids, (parte) =>
    c.from("curtidas").select("anuncio_id, perfil_id").in("anuncio_id", parte).is("desfeito_em", null),
  );
  const { data: visiveis, error: ev } = await c.from("curriculo_visivel").select("perfil_id");
  if (ev) throw new Error(`Publike: não deu para ler os talentos (${ev.message}).`);
  const idsPessoas = [...new Set([...curtidas.map((k) => k.perfil_id), ...(visiveis ?? []).map((v) => v.perfil_id)])];
  const [perfis, curriculos] = await Promise.all([
    emPartes(idsPessoas, (parte) =>
      c.from("perfis").select("id, cidade, bairro, tipo, suspenso_ate").in("id", parte),
    ),
    emPartes(idsPessoas, (parte) =>
      c
        .from("curriculos")
        .select(
          "perfil_id, escolaridade, curso, experiencias, cursos, cnh, disponibilidade, titulo, habilidades, estudos, atualizado_em",
        )
        .in("perfil_id", parte),
    ),
  ]);
  const perfilDe = new Map(perfis.map((p) => [p.id, p]));
  const lidos = curriculos.map((cv) => ({ id: cv.perfil_id, atualizado: cv.atualizado_em, cv: comoCurriculo(cv) }));
  // a função de cada experiência, como no site (claude/plano-match-pelo-contexto.md)
  const comCbo = await comFuncoes(lidos.map((x) => x.cv));
  const pessoas = new Map<string, Pessoa & { atualizado: string }>();
  lidos.forEach((x, i) => {
    const p = perfilDe.get(x.id);
    const cv = comCbo[i];
    if (!p || !cv) return;
    pessoas.set(x.id, { id: x.id, cidade: p.cidade, bairro: p.bairro, curriculo: cv, atualizado: x.atualizado });
  });

  // ---------------------------------------------------------------- as candidaturas
  const vagaDe = new Map(vagas.map((v) => [v.id, v]));
  const matriz = Object.fromEntries(CORES.map((a) => [a, Object.fromEntries(CORES.map((b) => [b, 0]))])) as Record<
    Cor,
    Record<Cor, number>
  >;
  const motivos = new Map<string, number>();
  const mudancas: MudancaDeNota[] = [];
  let total = 0;
  let subiram = 0;
  let desceram = 0;
  for (const k of curtidas) {
    const v = vagaDe.get(k.anuncio_id);
    const p = pessoas.get(k.perfil_id);
    if (!v || !p) continue;
    total++;
    const pessoa = { curriculo: p.curriculo, respostas: {}, cidade: p.cidade, bairro: p.bairro };
    const a0 = antes.calcularAderencia({ ...antes.requisitosDaVaga(v), perguntas: [] }, pessoa, agora);
    const a1 = calcularAderencia({ ...requisitosDaVaga(v), perguntas: [] }, pessoa, agora);
    const c0 = corDaNota(a0.nota);
    const c1 = corDaNota(a1.nota);
    matriz[c0][c1]++;
    if ((a1.nota ?? -1) > (a0.nota ?? -1)) subiram++;
    else if ((a1.nota ?? -1) < (a0.nota ?? -1)) desceram++;
    if (c0 !== c1) {
      const motivo = motivoDaMudanca(a1);
      motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);
      mudancas.push({ vagaId: v.id, vaga: v.titulo, perfilId: p.id, antes: a0.nota, depois: a1.nota, motivo });
    }
  }
  mudancas.sort((x, y) => Math.abs((y.depois ?? 0) - (y.antes ?? 0)) - Math.abs((x.depois ?? 0) - (x.antes ?? 0)));

  // ---------------------------------------------------------------- Talentos e "Vagas que combinam"
  const visivel = new Set((visiveis ?? []).map((v) => v.perfil_id));
  const talentos = [...pessoas.values()]
    .filter((p) => {
      const perfil = perfilDe.get(p.id);
      return (
        visivel.has(p.id) &&
        perfil?.tipo === "pessoa" &&
        (!perfil.suspenso_ate || new Date(perfil.suspenso_ate).getTime() < agora)
      );
    })
    .sort((a, b) => new Date(b.atualizado).getTime() - new Date(a.atualizado).getTime());
  const cortado = talentos.length > MAX_TALENTOS;
  const pool = talentos.slice(0, MAX_TALENTOS);
  const curtiu = new Set(curtidas.map((k) => `${k.anuncio_id}:${k.perfil_id}`));
  const porVaga: VagaDeTalentos[] = [];
  let tAntes = 0;
  let tDepois = 0;
  let entram = 0;
  let saem = 0;
  let cAntes = 0;
  let cDepois = 0;
  let cEntram = 0;
  let cSaem = 0;
  const tEntramPor = new Map<string, number>();
  const tSaemPor = new Map<string, number>();
  const cEntramPor = new Map<string, number>();
  const cSaemPor = new Map<string, number>();
  for (const v of vagas) {
    const req0 = { ...antes.requisitosDaVaga(v), perguntas: [] };
    const req1 = { ...requisitosDaVaga(v), perguntas: [] };
    const perto = cidadesPerto(v.cidade);
    let vAntes = 0;
    let vDepois = 0;
    for (const p of pool) {
      const pessoa = { curriculo: p.curriculo, respostas: {}, cidade: p.cidade, bairro: p.bairro };
      if (!curtiu.has(`${v.id}:${p.id}`)) {
        const a0 = antes.calcularAderencia(req0, pessoa, agora);
        const a1 = calcularAderencia(req1, pessoa, agora);
        const e0 = entravaAntes(a0);
        const e1 = entraEmParaAVaga(a1);
        if (e0) vAntes++;
        if (e1) vDepois++;
        if (e1 && !e0) {
          entram++;
          somar(tEntramPor, porQueEntra(a1));
        }
        if (e0 && !e1) {
          saem++;
          somar(tSaemPor, porQueSai(a1));
        }
      }
      // "Vagas que combinam": só as vagas da região da pessoa, como no aviso de segunda
      if (perto.includes(p.cidade ?? "")) {
        const novo = matchComAVaga(v, pessoa, agora);
        const m0 = combinavaAntes(antes.matchComAVaga(v, pessoa, agora));
        const m1 = combinaAgora(novo);
        if (m0) cAntes++;
        if (m1) cDepois++;
        if (m1 && !m0) {
          cEntram++;
          somar(cEntramPor, porQueCombina(novo));
        }
        if (m0 && !m1) {
          cSaem++;
          somar(cSaemPor, porQueDeixa(novo));
        }
      }
    }
    tAntes += vAntes;
    tDepois += vDepois;
    if (vAntes !== vDepois) porVaga.push({ vagaId: v.id, vaga: v.titulo, antes: vAntes, depois: vDepois });
  }
  porVaga.sort((x, y) => Math.abs(y.depois - y.antes) - Math.abs(x.depois - x.antes));

  const perfis_ = new Map<string, number>();
  for (const v of vagas) perfis_.set(motivoDoPerfil(v), (perfis_.get(motivoDoPerfil(v)) ?? 0) + 1);
  const ordenar = (m: Map<string, number>) =>
    [...m].map(([nome, quantas]) => ({ nome, quantas })).sort((a, b) => b.quantas - a.quantas);

  return {
    vagas: { total: vagas.length, perfis: ordenar(perfis_) },
    candidaturas: { total, matriz, subiram, desceram, motivos: ordenar(motivos), maiores: mudancas.slice(0, 20) },
    talentos: {
      pessoas: pool.length,
      antes: tAntes,
      depois: tDepois,
      entram,
      saem,
      vagas: porVaga.slice(0, 15),
      porQueEntram: ordenar(tEntramPor),
      porQueSaem: ordenar(tSaemPor),
    },
    combinam: {
      antes: cAntes,
      depois: cDepois,
      entram: cEntram,
      saem: cSaem,
      porQueEntram: ordenar(cEntramPor),
      porQueSaem: ordenar(cSaemPor),
    },
    cortado,
  };
}
