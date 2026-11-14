import { vagasDoQuadro } from "./impulso";

// O destaque das vagas impulsionadas fora das páginas de vagas da cidade (claude/plano-destaque-das-vagas-impulsionadas.md;
// 14/11/2026, Marcelo: "Os dois juntos", "ok"): o quadro no alto e o espaço patrocinado no meio da lista. A lista não
// muda de ordem: a vaga patrocinada sobe para o espaço dela, e as outras seguem na mesma ordem entre si.

/** O quadro da busca e da linha do tempo: uma linha de 2 (a coluna da lista ao lado do mapa tem 2 cartões). */
export const QUADRO_DA_LISTA = 2;
/** Um espaço patrocinado a cada 8 vagas da lista (o 8º, o 16º e o 24º lugar). */
export const PATROCINADA_A_CADA = 8;
/** No máximo, quantos espaços patrocinados numa lista. */
export const PATROCINADAS_NA_LISTA = 3;
/** Por tela, até 2 vagas de cada cliente, somando o quadro e a lista (a regra do quadro). */
const DO_MESMO_CLIENTE = 2;

export type Destaques<T> = {
  /** as do quadro, no alto */
  quadro: T[];
  /** a lista com as patrocinadas nos espaços delas */
  lista: T[];
  /** os ids das patrocinadas da lista (o cartão leva o selo e o código do destaque) */
  patrocinadas: Set<string>;
};

/**
 * Escolhe, entre as vagas da própria lista (só as que passaram no filtro de quem vê: combinar é obrigatório), as do
 * quadro e as dos espaços patrocinados. A vaga do quadro continua no lugar dela na lista, como na página de vagas; a
 * patrocinada sai do lugar dela, mais abaixo, e entra no espaço. Sem vaga que caiba, o espaço não existe.
 */
export function destaquesDaLista<T extends { id: string; autor_id: string }>(
  lista: T[],
  impulsionada: (a: T) => boolean,
  agora: number,
  quadroCabe = QUADRO_DA_LISTA,
): Destaques<T> {
  const elegiveis = lista.filter(impulsionada);
  if (!elegiveis.length) return { quadro: [], lista, patrocinadas: new Set() };
  const quadro = vagasDoQuadro(elegiveis, agora, quadroCabe);
  const noQuadro = new Set(quadro.map((a) => a.id));
  const porCliente = new Map<string, number>();
  for (const a of quadro) porCliente.set(a.autor_id, (porCliente.get(a.autor_id) ?? 0) + 1);
  // as outras, na ordem da hora (a mesma rotação do quadro)
  const resto = vagasDoQuadro(elegiveis, agora, elegiveis.length).filter((a) => !noQuadro.has(a.id));
  const lugar = new Map(lista.map((a, i) => [a.id, i] as const));

  const escolhidas: { vaga: T; espaco: number }[] = [];
  let anterior: string | null = null;
  for (let k = 1; k <= PATROCINADAS_NA_LISTA; k++) {
    const espaco = PATROCINADA_A_CADA * k - 1;
    if (espaco >= lista.length) break;
    // só sobe quem está mais abaixo do espaço (quem já está acima já é visto), sem repetir o cliente do espaço de antes
    const v = resto.find(
      (a) =>
        !escolhidas.some((e) => e.vaga.id === a.id) &&
        (lugar.get(a.id) ?? 0) > espaco &&
        a.autor_id !== anterior &&
        (porCliente.get(a.autor_id) ?? 0) < DO_MESMO_CLIENTE,
    );
    if (!v) continue;
    escolhidas.push({ vaga: v, espaco });
    porCliente.set(v.autor_id, (porCliente.get(v.autor_id) ?? 0) + 1);
    anterior = v.autor_id;
  }
  if (!escolhidas.length) return { quadro, lista, patrocinadas: new Set() };

  const sobem = new Set(escolhidas.map((e) => e.vaga.id));
  const nova = lista.filter((a) => !sobem.has(a.id));
  for (const e of escolhidas) nova.splice(Math.min(e.espaco, nova.length), 0, e.vaga);
  return { quadro, lista: nova, patrocinadas: sobem };
}
