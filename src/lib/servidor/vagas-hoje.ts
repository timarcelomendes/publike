import "server-only";
import { CATEGORIAS } from "@/lib/constantes";
import { caminhoDaFuncao, comMaiuscula, funcaoDaListaPeloCbo } from "@/lib/funcoes-das-paginas";
import { nomeDoBairro } from "@/lib/formato";
import { caminhoDaBusca, caminhoDoBairro, MINIMO_DO_BAIRRO, REGIMES_PROGRAMAS, slugDaCidade } from "@/lib/paginas-busca";
import { PRACAS, pracaDaCidade } from "@/lib/pracas";
import { agoraDaPaginaPublica } from "@/lib/tempo";
import { anunciosNoAr, type AnuncioNoAr } from "./paginas-busca";
import { funcoesDasVagasDaPraca } from "./paginas-funcao";

// Os números do dia de uma cidade (claude/plano-organico.md, item 2): a página /vagas/goiania/hoje e o /llms.txt.
// Tudo das vagas no ar da busca (as mesmas da página da cidade, 15 minutos de cache): só o que o site já mostra a
// qualquer visitante, somado. A lista da busca traz até 200 vagas por praça; com 200, os números são "pelo menos".

const HORA = 60 * 60 * 1000;
const LIMITE_DA_LISTA = 200;

/** Os grupos de contratação dos números (a ordem é a da página). */
export const GRUPOS_DE_REGIME = [
  { id: "carteira", nome: "com carteira assinada", um: "com carteira assinada", regimes: ["clt", "intermitente"] },
  { id: "temporario", nome: "temporárias", um: "temporária", regimes: ["temporario"] },
  { id: "diaria", nome: "diárias e freelas", um: "diária ou freela", regimes: ["diaria", "freelance"] },
  { id: "programas", nome: "de estágio e jovem aprendiz", um: "de estágio ou jovem aprendiz", regimes: REGIMES_PROGRAMAS },
] as const;

export type Contagem = { nome: string; n: number; caminho: string | null };

export type ResumoDoDia = {
  cidade: string;
  /** quando os números foram contados (ms) */
  quando: number;
  /** as vagas no ar na cidade */
  total: number;
  /** a lista da praça veio cheia: os números são o mínimo */
  noLimite: boolean;
  /** as vagas no ar na praça inteira ("Goiânia e região"), e o nome dela */
  regiao: { nome: string; total: number } | null;
  novas24h: number;
  novas7d: number;
  porRegime: { id: (typeof GRUPOS_DE_REGIME)[number]["id"]; nome: string; n: number }[];
  /** o salário do meio das vagas com salário por mês (a mediana), e de quantas vagas veio */
  salarioMensal: { mediana: number; vagas: number } | null;
  /** a diária do meio das vagas pagas por dia */
  diaria: { mediana: number; vagas: number } | null;
  funcoes: Contagem[];
  bairros: Contagem[];
  areas: Contagem[];
  /** as mais novas primeiro */
  vagas: AnuncioNoAr[];
};

function mediana(valores: number[]) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/** O valor de uma vaga na unidade pedida (a faixa conta pelo meio); null fora dela ou sem valor. */
function valorNa(a: AnuncioNoAr, unidade: "mes" | "dia", minimo: number, maximo: number) {
  if (a.pagamento_unidade !== unidade || !a.pagamento_valor) return null;
  const v = a.pagamento_ate && a.pagamento_ate > a.pagamento_valor ? (a.pagamento_valor + a.pagamento_ate) / 2 : a.pagamento_valor;
  return v >= minimo && v <= maximo ? v : null;
}

const contar = (mapa: Map<string, Contagem>, chave: string, nome: string, caminho: string | null) => {
  const atual = mapa.get(chave);
  if (atual) atual.n += 1;
  else mapa.set(chave, { nome, n: 1, caminho });
};
const ordenar = (mapa: Map<string, Contagem>) =>
  [...mapa.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR"));

export async function resumoDoDia(cidade: string): Promise<ResumoDoDia> {
  const praca = pracaDaCidade(cidade) ?? PRACAS[0];
  const [lista, funcoesDasVagas, agora] = await Promise.all([
    anunciosNoAr("vaga", cidade),
    // pela cidade da praça: o cache é um só para todas as cidades dela (a lista de vagas é a mesma)
    funcoesDasVagasDaPraca(praca.cidade).catch((): Record<string, string> => ({})),
    agoraDaPaginaPublica(),
  ]);
  const daCidade = lista
    .filter((a) => a.cidade === cidade)
    .sort((x, y) => Date.parse(y.criado_em ?? "") - Date.parse(x.criado_em ?? ""));
  const daRegiao = lista.filter((a) => praca.cidades.includes(a.cidade as (typeof praca.cidades)[number]));
  const desde = (horas: number) => daCidade.filter((a) => a.criado_em && agora - Date.parse(a.criado_em) <= horas * HORA);

  const funcoes = new Map<string, Contagem>();
  const bairros = new Map<string, Contagem>();
  const areas = new Map<string, Contagem>();
  const vagasDoBairro = new Map<string, number>();
  for (const a of daCidade) {
    if (a.bairro && a.bairro !== cidade) {
      const slug = slugDaCidade(a.bairro);
      vagasDoBairro.set(slug, (vagasDoBairro.get(slug) ?? 0) + 1);
    }
  }
  for (const a of daCidade) {
    const funcao = funcaoDaListaPeloCbo(funcoesDasVagas[a.id]);
    if (funcao) contar(funcoes, funcao.slug, comMaiuscula(funcao.nome), caminhoDaFuncao(cidade, funcao.slug));
    if (a.bairro && a.bairro !== cidade) {
      const slug = slugDaCidade(a.bairro);
      // o bairro só tem página no Google com pelo menos 2 vagas (as outras, sem link)
      const caminho = (vagasDoBairro.get(slug) ?? 0) >= MINIMO_DO_BAIRRO ? caminhoDoBairro(cidade, a.bairro) : null;
      contar(bairros, slug, nomeDoBairro(a.bairro), caminho);
    }
    const area = CATEGORIAS.find((c) => c.slug === a.categoria);
    if (area && area.slug !== "outros") contar(areas, area.slug, area.nome, caminhoDaBusca("vaga", cidade, area.slug));
  }

  const mensais = daCidade.map((a) => valorNa(a, "mes", 500, 50_000)).filter((v): v is number => v !== null);
  const diarias = daCidade.map((a) => valorNa(a, "dia", 30, 2_000)).filter((v): v is number => v !== null);
  const medianaMensal = mensais.length >= 3 ? mediana(mensais) : null;
  const medianaDiaria = diarias.length >= 3 ? mediana(diarias) : null;

  return {
    cidade,
    quando: agora,
    total: daCidade.length,
    noLimite: lista.length >= LIMITE_DA_LISTA,
    regiao: praca.cidade === cidade ? { nome: praca.nome, total: daRegiao.length } : null,
    novas24h: desde(24).length,
    novas7d: desde(24 * 7).length,
    porRegime: GRUPOS_DE_REGIME.map((g) => {
      const n = daCidade.filter((a) => (g.regimes as readonly string[]).includes(a.regime ?? "")).length;
      return { id: g.id, nome: n === 1 ? g.um : g.nome, n };
    }),
    salarioMensal: medianaMensal ? { mediana: Math.round(medianaMensal / 10) * 10, vagas: mensais.length } : null,
    diaria: medianaDiaria ? { mediana: Math.round(medianaDiaria / 5) * 5, vagas: diarias.length } : null,
    funcoes: ordenar(funcoes),
    bairros: ordenar(bairros),
    areas: ordenar(areas),
    vagas: daCidade,
  };
}

/** "124 vagas de emprego abertas", ou "pelo menos 200..." quando a lista veio cheia. */
export function quantasVagas(n: number, noLimite: boolean) {
  const texto = n === 1 ? "1 vaga de emprego aberta" : `${n.toLocaleString("pt-BR")} vagas de emprego abertas`;
  return noLimite ? `pelo menos ${texto}` : texto;
}
