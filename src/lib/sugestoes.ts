// Sugestões, erros, elogios e melhorias (página /sugerir e quadro do admin).

export type TipoSugestao = "erro" | "sugestao" | "elogio" | "melhoria";
export type StatusSugestao = "novo" | "analise" | "fazendo" | "feito" | "descartado";

export const TIPOS_SUGESTAO: { valor: TipoSugestao; nome: string; ajuda: string; exemplo: string }[] = [
  {
    valor: "erro",
    nome: "Erro",
    ajuda: "Algo não funcionou",
    exemplo: "O que aconteceu? O que você estava tentando fazer?",
  },
  { valor: "sugestao", nome: "Sugestão", ajuda: "Uma ideia nova", exemplo: "Qual é a ideia? Como ela ajudaria você?" },
  {
    valor: "melhoria",
    nome: "Melhoria",
    ajuda: "Algo que pode ficar melhor",
    exemplo: "O que pode melhorar? Onde fica isso no site?",
  },
  {
    valor: "elogio",
    nome: "Elogio",
    ajuda: "Algo que deu certo",
    exemplo: "O que você gostou? Conseguiu um trabalho ou contratou alguém?",
  },
];

export const COLUNAS_SUGESTAO: { valor: StatusSugestao; nome: string }[] = [
  { valor: "novo", nome: "Novo" },
  { valor: "analise", nome: "Em análise" },
  { valor: "fazendo", nome: "Fazendo" },
  { valor: "feito", nome: "Feito" },
  { valor: "descartado", nome: "Descartado" },
];

export function ehTipoSugestao(v: unknown): v is TipoSugestao {
  return typeof v === "string" && TIPOS_SUGESTAO.some((t) => t.valor === v);
}

export function ehStatusSugestao(v: unknown): v is StatusSugestao {
  return typeof v === "string" && COLUNAS_SUGESTAO.some((c) => c.valor === v);
}

export function nomeDoTipo(v: string) {
  return TIPOS_SUGESTAO.find((t) => t.valor === v)?.nome ?? v;
}
