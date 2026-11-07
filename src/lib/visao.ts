// Os jeitos de ver a busca (lista, grade, blocos, mapa, blocos + mapa e lista + detalhes): o que o servidor e o
// navegador dividem. As telas ficam em `src/components/explorar/visao-explorar.tsx`.

export type Visao = "lista" | "grade" | "blocos" | "mapa" | "blocos-mapa" | "lista-detalhes";

export const VALORES_VISAO: Visao[] = ["lista", "grade", "blocos", "mapa", "blocos-mapa", "lista-detalhes"];

/** No celular só há Blocos e Mapa (lista e grade apertam demais os cartões numa tela pequena). */
export const VISOES_CELULAR: Visao[] = ["blocos", "mapa"];

/** O jeito de ver das listas (a vitrine e as listas de quem entrou), no navegador e num cookie. */
export const CHAVE_VISAO = "publike_visao";

/**
 * O jeito de ver da busca por palavra de quem entrou (começa na Lista no computador). Fica no
 * navegador e num cookie com o mesmo nome: assim a página já vem do servidor no jeito certo, sem
 * trocar depois de abrir.
 */
export const CHAVE_VISAO_BUSCA = "publike_visao_busca";

/**
 * Lista + detalhes (a lista à esquerda e a vaga aberta à direita, sem sair da página): só para quem
 * ainda não entrou, no computador. Para quem entrou (ou numa tela que não tem), vira a Lista.
 */
export function semDetalhes(v: Visao, comDetalhes: boolean): Visao {
  return v === "lista-detalhes" && !comDetalhes ? "lista" : v;
}

export function ehVisao(v: unknown): v is Visao {
  return VALORES_VISAO.includes(v as Visao);
}
