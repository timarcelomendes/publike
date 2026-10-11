import type { TipoAnuncio } from "./tipos";

/**
 * "O que você quer fazer no Publike?": a resposta guia a home.
 *   trabalho ............ a busca abre em Vagas
 *   contratar_servico ... a busca abre em Serviços
 *   oferecer_servico .... convite para montar a vitrine em "Meus serviços"
 *   contratar_pessoa .... convite para publicar a vaga
 * Logado: fica na conta. Sem login: só nesta visita. O botão ao lado do bairro
 * mostra a resposta e abre o "Mudar".
 */
export const INTENCOES = [
  {
    valor: "trabalho",
    nome: "Procuro trabalho",
    curto: "Procuro trabalho",
    ajuda: "Vagas com carteira, diárias e freelances",
  },
  {
    valor: "contratar_servico",
    nome: "Quero contratar um serviço",
    curto: "Contratar serviço",
    ajuda: "Diarista, pedreiro, eletricista…",
  },
  {
    valor: "oferecer_servico",
    nome: "Ofereço serviços",
    curto: "Ofereço serviços",
    ajuda: "Mostre o que você faz e ache clientes",
  },
  {
    valor: "contratar_pessoa",
    nome: "Quero contratar alguém",
    curto: "Contratar alguém",
    ajuda: "Publique a vaga de graça",
  },
] as const;

export type Intencao = (typeof INTENCOES)[number]["valor"];

/** A resposta dita para a própria pessoa, na linha acima da busca. */
export const VOCE: Record<Intencao, string> = {
  trabalho: "Você procura trabalho",
  contratar_servico: "Você quer contratar um serviço",
  oferecer_servico: "Você oferece serviços",
  contratar_pessoa: "Você quer contratar alguém",
};

export const COOKIE_INTENCAO = "publike_intencao";

export function lerIntencao(valor: string | undefined | null): Intencao | null {
  return INTENCOES.some((i) => i.valor === valor) ? (valor as Intencao) : null;
}

/** A aba que a busca abre para cada resposta (null = Tudo). */
export function tipoDaIntencao(intencao: Intencao | null): TipoAnuncio | null {
  if (intencao === "trabalho") return "vaga";
  if (intencao === "contratar_servico") return "servico";
  return null;
}
