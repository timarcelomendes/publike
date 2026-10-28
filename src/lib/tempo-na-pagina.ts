// Tempo na página (migração 20261208120000_tempo_na_pagina.sql): o navegador conta quanto tempo cada página
// ficou na tela (`ContarTempo`, src/components/contar-tempo.tsx) e avisa por /api/tempo; o banco soma por
// dia e por página, sem saber quem. Aqui, a página que conta (o caminho com [nome] no lugar do que muda) e
// as regras que o navegador, a rota e o banco seguem (`privado.pagina_do_tempo`: mudou uma, mude a outra).

/** A página "não encontrada" (o 404), de qualquer endereço. */
export const PAGINA_NAO_ENCONTRADA = "(não encontrada)";

/** Sem tocar, rolar, digitar nem mover o mouse por 2 minutos, o tempo para de contar. */
export const OCIOSO_MS = 2 * 60 * 1000;

/** No máximo 30 minutos por vez na página. */
export const MAXIMO_SEGUNDOS = 30 * 60;

// fora da conta, como no proxy (o admin e as rotas internas), e o painel da equipe
const FORA = /^\/(admin|api|auth|embed|email|versao|pagina-que-nao-existe)(\/|$)|^\/equipe$/;
const PARTE_FIXA = /^[a-z]+(-[a-z]+)*$/;
const PARTE_QUE_MUDA = /^\[[a-z]{1,20}\]$/;

function decodificar(parte: string) {
  try {
    return decodeURIComponent(parte);
  } catch {
    return parte;
  }
}

/**
 * A página para contar o tempo: o caminho com [nome] no lugar de cada parte que vem da rota (`useParams`:
 * "/anuncio/[id]", "/vagas/[cidade]") e [id] no que sobrar com número, código ou maiúscula. O endereço
 * inteiro nunca sai do navegador. Fora da conta (admin, rotas internas, /equipe): null.
 */
export function chaveDaPagina(
  caminho: string,
  params?: Record<string, string | string[] | undefined> | null,
): string | null {
  if (!caminho.startsWith("/") || FORA.test(caminho)) return null;
  const nomes = new Map<string, string>();
  for (const [nome, valor] of Object.entries(params ?? {})) {
    if (!/^[a-z]{1,20}$/i.test(nome)) continue;
    for (const v of Array.isArray(valor) ? valor : valor ? [valor] : []) nomes.set(v, nome.toLowerCase());
  }
  const partes = caminho
    .split("/")
    .filter(Boolean)
    .map((parte) => {
      const nome = nomes.get(parte) ?? nomes.get(decodificar(parte));
      if (nome) return `[${nome}]`;
      return PARTE_FIXA.test(parte) ? parte : "[id]";
    });
  if (partes.length > 6) return null;
  return `/${partes.join("/")}`;
}

/** A página que a rota e o banco aceitam (a mesma regra de `privado.pagina_do_tempo`). */
export function paginaValida(pagina: string) {
  if (pagina === "/" || pagina === PAGINA_NAO_ENCONTRADA) return true;
  if (pagina.length > 120 || FORA.test(pagina)) return false;
  const partes = pagina.split("/").slice(1);
  return (
    pagina.startsWith("/") &&
    partes.length >= 1 &&
    partes.length <= 6 &&
    partes.every((p) => PARTE_FIXA.test(p) || PARTE_QUE_MUDA.test(p))
  );
}

/** O aviso do navegador: a página, os segundos que ela já tinha avisado (de) e os de agora (ate). */
export function lerAvisoDeTempo(corpo: unknown): { pagina: string; de: number; ate: number } | null {
  const { pagina, de, ate } = (corpo ?? {}) as { pagina?: unknown; de?: unknown; ate?: unknown };
  if (typeof pagina !== "string" || !paginaValida(pagina)) return null;
  if (typeof de !== "number" || typeof ate !== "number" || !Number.isInteger(de) || !Number.isInteger(ate)) {
    return null;
  }
  if (de < 0 || ate <= de || ate > MAXIMO_SEGUNDOS) return null;
  return { pagina, de, ate };
}
