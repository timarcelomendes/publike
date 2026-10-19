import type { TipoAnuncio } from "./tipos";

/**
 * "O que você quer fazer no Publike?": a resposta guia a home (as mesmas abas da busca).
 *   trabalho ............ a busca abre em Vagas
 *   contratar_servico ... a busca abre em Serviços
 *   oferecer_servico .... convite para montar a vitrine em "Meus serviços"
 *   contratar_pessoa .... abre a aba Talentos; na home, o convite para publicar a vaga
 *   talento ............. abre o currículo, com o caminho para aparecer na aba Talentos
 *                         (em destaque na pergunta); na home, a busca abre em Vagas
 * Logado: fica na conta. Sem login: só nesta visita. A pergunta e a resposta (com o
 * "Mudar" e o próximo passo) ficam no meio dos anúncios da home (PerguntasNaLista).
 * Não é um filtro: quem filtra são as abas.
 */
export const INTENCOES = [
  {
    valor: "trabalho",
    nome: "Procuro trabalho",
    curto: "Procuro trabalho",
    ajuda: "Carteira, diária ou freelance",
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
    ajuda: "Mostre o que faz e ache clientes",
  },
  {
    valor: "contratar_pessoa",
    nome: "Procuro funcionário",
    curto: "Procuro funcionário",
    ajuda: "Veja talentos e publique a vaga",
  },
  {
    valor: "talento",
    nome: "Cadastrar meu currículo",
    curto: "Cadastrar meu currículo",
    ajuda: "Entre na aba Talentos: as empresas da região acham você e convidam para vagas",
  },
] as const;

/** A resposta que ocupa a linha inteira, com o selo "Novo": o cadastro na aba Talentos. */
export const INTENCAO_EM_DESTAQUE = "talento";

export type Intencao = (typeof INTENCOES)[number]["valor"];

/** A resposta dita para a própria pessoa, na linha do próximo passo. */
export const VOCE: Record<Intencao, string> = {
  trabalho: "Você procura trabalho",
  contratar_servico: "Você quer contratar um serviço",
  oferecer_servico: "Você oferece serviços",
  contratar_pessoa: "Você procura funcionário",
  talento: "Você quer aparecer para as empresas",
};

export const COOKIE_INTENCAO = "publike_intencao";

export function lerIntencao(valor: string | undefined | null): Intencao | null {
  return INTENCOES.some((i) => i.valor === valor) ? (valor as Intencao) : null;
}

/**
 * As respostas que abrem outra página: quem procura funcionário vai para a aba Talentos; quem
 * quer aparecer nela, para o currículo (com o passo a passo no alto).
 */
export const PAGINA_DA_INTENCAO: Partial<Record<Intencao, string>> = {
  contratar_pessoa: "/talentos",
  talento: "/perfil/curriculo?para=talentos",
};

/** A aba que a busca abre para cada resposta (null = Tudo). */
export function tipoDaIntencao(intencao: Intencao | null): TipoAnuncio | null {
  if (intencao === "trabalho" || intencao === "talento") return "vaga";
  if (intencao === "contratar_servico") return "servico";
  return null;
}
