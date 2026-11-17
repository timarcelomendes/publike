import "server-only";

/**
 * Espera `p` até `ms` milissegundos; passou disso (ou deu erro), null: o bloco fica de fora desta vez (17/11/2026,
 * "deixe a performance invejável"). Para o que vem junto com a página, sem Suspense próprio: num Suspense, o bloco que
 * terminava depois aparecia em cima do resto e o empurrava para baixo (o pulo que o Admin › Velocidade mede). Comece
 * `p` cedo, antes das outras esperas da página, para ele ter o tempo delas.
 */
export async function comPrazo<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let espera: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p.catch(() => null),
      new Promise<null>((ok) => {
        espera = setTimeout(() => ok(null), ms);
      }),
    ]);
  } finally {
    clearTimeout(espera);
  }
}
