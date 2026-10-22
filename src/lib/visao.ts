// Os jeitos de ver a busca (lista, grade, blocos, mapa e blocos + mapa): o que o servidor e o
// navegador dividem. As telas ficam em `src/components/explorar/visao-explorar.tsx`.

export type Visao = "lista" | "grade" | "blocos" | "mapa" | "blocos-mapa";

export const VALORES_VISAO: Visao[] = ["lista", "grade", "blocos", "mapa", "blocos-mapa"];

/** No celular só há Blocos e Mapa (lista e grade apertam demais os cartões numa tela pequena). */
export const VISOES_CELULAR: Visao[] = ["blocos", "mapa"];

/**
 * O jeito de ver da busca por palavra de quem entrou (começa na Lista no computador). Fica no
 * navegador e num cookie com o mesmo nome: assim a página já vem do servidor no jeito certo, sem
 * trocar depois de abrir.
 */
export const CHAVE_VISAO_BUSCA = "publike_visao_busca";

export function ehVisao(v: unknown): v is Visao {
  return VALORES_VISAO.includes(v as Visao);
}
