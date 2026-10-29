import type { Aderencia } from "./aderencia";
import { pontosDaArea, semAcento, type QuemProcura } from "./descobrir";
import { chaveBairro } from "./regioes";

// "Relevantes para você", na linha do tempo: a ordem de cada pessoa, e não a mesma para todos. Conta o
// que diz respeito a ela e, com peso menor, o que está em alta (as curtidas recentes da vaga):
//   o currículo ........ o % de match com a vaga (0 a 35); sem currículo, a área do que faz e procura
//                        (0 a 24); a vaga de outra área desce
//   perto de casa ...... o bairro, a região e a distância (0 a 30)
//   o que é novo ....... a publicação mais nova pesa mais (0 a 20; para empresa, 0 a 30)
//   o interesse ........ quem ela segue, os bairros que segue, as buscas com aviso, as áreas do que já
//                        curtiu e o que salvou (0 a 25)
//   em alta ............ a vaga curtida nas últimas 24 horas, 3 dias ou 7 dias, mais com 3 curtidas
//                        ou mais (0 a 15). Em Recentes a curtida não muda o lugar: vale a publicação
// O que ela já curtiu desce (já está nas Candidaturas), e os anúncios dela também. Para empresa,
// comércio e agência (sem currículo para comparar): perto, o que é novo e o interesse.

/** O que a linha sabe da pessoa para a ordem dela (tudo dela; nada dos outros). */
export type SinaisDaPessoa = {
  /** o que ela faz e procura (o mesmo do Descobrir); null: visitante */
  quem: QuemProcura | null;
  /** empresa, comércio ou agência: sem a parte do currículo, e o que é novo pesa mais */
  empresa: boolean;
  /** a conta de quem vê: os próprios anúncios descem (ela já conhece) */
  eu: string | null;
  /** as contas que ela segue */
  autores: Set<string>;
  /** os bairros que ela segue (chaveBairro) */
  bairros: Set<string>;
  /** as buscas com aviso: a palavra (sem acento) e a categoria */
  buscas: { texto: string | null; categoria: string | null }[];
  /** quanto de tudo o que ela curtiu é de cada categoria (0 a 1) */
  categorias: Map<string, number>;
  /** as vagas que ela salvou */
  salvas: Set<string>;
};

export const SEM_SINAIS: SinaisDaPessoa = {
  quem: null,
  empresa: false,
  eu: null,
  autores: new Set(),
  bairros: new Set(),
  buscas: [],
  categorias: new Map(),
  salvas: new Set(),
};

/** O anúncio como a conta precisa (o da busca, com a descrição da vaga quando a lista tem). */
export type AnuncioParaRelevancia = {
  id: string;
  tipo: string;
  titulo: string;
  categoria: string;
  bairro: string | null;
  autor_id: string;
  criado_em: string;
  /** 0 = no bairro, 1 = na região, 2 = na cidade, 3 = mais longe (a busca já diz) */
  prioridade: number | null;
  distancia_km: number | null;
  minha_curtida: string | null;
  descricao?: string | null;
  /** as curtidas da vaga (o número e a hora da última), para os pontos "em alta" */
  emAlta?: { total: number; ultima: string } | null;
  /** como quem publicou responde as curtidas (`resposta_de_quem_publica`; só com 5 curtidas ou mais) */
  resposta?: { taxa: number; horas: number | null } | null;
};

/** As categorias do que a pessoa curtiu, cada uma com a parte do total (0 a 1). */
export function categoriasDasCurtidas(curtidas: { categoria: string | null }[]): Map<string, number> {
  const conta = new Map<string, number>();
  for (const c of curtidas) if (c.categoria) conta.set(c.categoria, (conta.get(c.categoria) ?? 0) + 1);
  const total = [...conta.values()].reduce((t, n) => t + n, 0);
  return new Map([...conta].map(([cat, n]) => [cat, total ? n / total : 0]));
}

/** Perto de casa (0 a 30): o bairro, a região e a cidade, ou a distância, o que for melhor. */
function pontosDePerto(a: AnuncioParaRelevancia) {
  const porLugar = a.prioridade === 0 ? 30 : a.prioridade === 1 ? 22 : a.prioridade === 2 ? 12 : 4;
  const d = a.distancia_km;
  const porDistancia = d == null ? 0 : d <= 1.5 ? 30 : d <= 4 ? 24 : d <= 8 ? 17 : d <= 15 ? 10 : d <= 30 ? 4 : 0;
  return Math.max(porLugar, porDistancia);
}

/** O que é novo (0 a 20): pela publicação. */
function pontosDeNovo(criadoEm: string, agora: number) {
  const horas = (agora - Date.parse(criadoEm)) / 3600e3;
  return horas < 24 ? 20 : horas < 48 ? 17 : horas < 24 * 7 ? 12 : horas < 24 * 14 ? 7 : horas < 24 * 30 ? 3 : 0;
}

/** O interesse da pessoa (0 a 25): quem e onde ela segue, as buscas com aviso, as áreas que curte e as salvas. */
function pontosDeInteresse(a: AnuncioParaRelevancia, s: SinaisDaPessoa) {
  let p = 0;
  if (s.autores.has(a.autor_id)) p += 12;
  if (a.bairro && s.bairros.has(chaveBairro(a.bairro))) p += 6;
  const titulo = semAcento(a.titulo);
  if (s.buscas.some((b) => (b.texto && titulo.includes(b.texto)) || (b.categoria && b.categoria === a.categoria)))
    p += 10;
  p += Math.round(10 * (s.categorias.get(a.categoria) ?? 0));
  if (s.salvas.has(a.id)) p += 8;
  return Math.min(25, p);
}

/** Em alta (0 a 15): a vaga que as pessoas curtiram há pouco, mais se já tem 3 curtidas ou mais. */
export function pontosEmAlta(c: { total: number; ultima: string } | null | undefined, agora: number) {
  if (!c || c.total < 1) return 0;
  const horas = (agora - Date.parse(c.ultima)) / 3600e3;
  const recente = horas < 24 ? 10 : horas < 72 ? 6 : horas < 24 * 7 ? 3 : 0;
  return Math.min(15, recente + (c.total >= 3 ? 5 : 0));
}

/**
 * Quem responde (−6 a 6): a vaga de quem responde 7 de cada 10 curtidas em até 2 dias sobe (o mesmo selo de quem
 * responde rápido); a de quem quase não responde desce. Sem o número (menos de 5 curtidas), nada.
 */
export function pontosDeResposta(r: { taxa: number; horas: number | null } | null | undefined) {
  if (!r) return 0;
  if (r.taxa >= 0.7 && r.horas !== null && r.horas <= 48) return 6;
  return r.taxa < 0.3 ? -6 : 0;
}

/** A experiência é de outra área (o mesmo "Outra área" do site). */
function deOutraArea(m: Aderencia) {
  return m.criterios.some((c) => c.funcao && c.ok === false);
}

/**
 * Quanto o anúncio é relevante para esta pessoa (quanto maior, mais em cima). `match`: o % de match
 * com o currículo (só vaga, só de quem tem currículo).
 */
export function relevanciaParaVoce(
  a: AnuncioParaRelevancia,
  s: SinaisDaPessoa,
  match: Aderencia | null,
  agora: number,
) {
  let nota =
    pontosDePerto(a) +
    pontosDeInteresse(a, s) +
    (a.tipo === "vaga" ? pontosEmAlta(a.emAlta, agora) + pontosDeResposta(a.resposta) : 0);
  const novo = pontosDeNovo(a.criado_em, agora);
  if (s.empresa) {
    nota += Math.round(novo * 1.5);
  } else {
    nota += novo;
    if (a.tipo === "vaga") {
      if (match && match.nota !== null) {
        // o currículo: o % de match; de outra área, desce
        nota += deOutraArea(match) ? -15 : Math.round(match.nota * 0.35);
      } else if (s.quem) {
        // sem currículo: a área do que a pessoa faz e procura (a mesma conta do Descobrir)
        nota += Math.round(pontosDaArea(a, s.quem).area * 0.8);
      }
    }
  }
  // já curtiu (ou pediu): está nas Candidaturas, desce; os próprios anúncios descem mais
  if (a.minha_curtida) nota -= 30;
  if (s.eu && a.autor_id === s.eu) nota -= 40;
  return nota;
}

/** Os anúncios do mais relevante para o menos (empate: o mais novo antes). */
export function ordenarPorRelevancia<T extends AnuncioParaRelevancia>(
  anuncios: T[],
  s: SinaisDaPessoa,
  matches: Map<string, Aderencia>,
  agora: number,
): T[] {
  return anuncios
    .map((a) => ({ a, nota: relevanciaParaVoce(a, s, matches.get(a.id) ?? null, agora) }))
    .sort((x, y) => y.nota - x.nota || Date.parse(y.a.criado_em) - Date.parse(x.a.criado_em))
    .map((x) => x.a);
}

/** O que a ordem leva em conta, para a linha embaixo do título (pelo que a pessoa tem). */
export function porQueDaOrdem(s: SinaisDaPessoa, temCurriculo: boolean) {
  if (s.empresa) return "perto de você, o que é novo e o que você segue";
  if (temCurriculo) return "pelo seu currículo, perto de casa, o que você segue e o que é novo";
  return "pelo que você faz e procura, perto de casa, o que você segue e o que é novo";
}
