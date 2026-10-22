"use client";

import { ChevronLeft, ChevronRight, MapPinned } from "lucide-react";
import { Fragment, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { dentro, useAreaDoMapa } from "./area-do-mapa";

// Quantos por página, pelo tamanho da tela: 4 no celular, até 12 no computador grande
// (sempre linhas cheias: 2 colunas no tablet, 3 no computador).
const TAMANHOS: [string, number][] = [
  ["(min-width: 1280px)", 12],
  ["(min-width: 1024px)", 9],
  ["(min-width: 640px)", 6],
];
const NO_CELULAR = 4;

function usePorPagina() {
  return useSyncExternalStore(
    (avisar) => {
      const mqs = TAMANHOS.map(([q]) => window.matchMedia(q));
      for (const mq of mqs) mq.addEventListener("change", avisar);
      return () => {
        for (const mq of mqs) mq.removeEventListener("change", avisar);
      };
    },
    () => TAMANHOS.find(([q]) => window.matchMedia(q).matches)?.[1] ?? NO_CELULAR,
    () => 12,
  );
}

/**
 * Os cartões da busca, em páginas (4 no celular, até 12 no computador). Com o mapa na tela, só os que estão na parte do mapa à
 * mostra (mexeu no mapa, a lista acompanha e volta para a primeira página).
 */
export function ListaPaginada({
  itens,
  cartoes,
  depois,
  className,
}: {
  itens: { id: string; lat: number; lng: number }[];
  /** os cartões, na mesma ordem dos itens */
  cartoes: ReactNode[];
  /** o que vem no fim da lista (avisos), na última página */
  depois?: ReactNode;
  className: string;
}) {
  const area = useAreaDoMapa();
  const porPagina = usePorPagina();
  const topo = useRef<HTMLDivElement>(null);
  // a página volta para a primeira quando a área muda (a chave é a área)
  const chaveArea = `${porPagina}:${area ? area.map((n) => n.toFixed(4)).join(",") : "toda"}`;
  const [pagina, setPagina] = useState({ area: chaveArea, n: 1 });
  const atual = pagina.area === chaveArea ? pagina.n : 1;

  const visiveis = useMemo(
    () => itens.map((it, i) => ({ ...it, i })).filter((it) => !area || dentro(area, it.lat, it.lng)),
    [itens, area],
  );
  const total = visiveis.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const n = Math.min(atual, paginas);
  const desta = visiveis.slice((n - 1) * porPagina, n * porPagina);
  const foraDaArea = itens.length - total;

  function ir(p: number) {
    setPagina({ area: chaveArea, n: p });
    topo.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <div ref={topo} className="flex scroll-mt-24 flex-col gap-4">
      {area && foraDaArea > 0 && (
        <p className="flex items-center gap-2 text-body-sm text-ink-muted" aria-live="polite">
          <MapPinned aria-hidden className="size-4 shrink-0" />
          {total === 0
            ? "Nenhum anúncio nesta parte do mapa. Afaste o mapa ou toque em Buscar nesta área."
            : `${total} ${total === 1 ? "anúncio" : "anúncios"} nesta parte do mapa (${foraDaArea} fora dela).`}
        </p>
      )}
      {desta.length > 0 && (
        <div className={className}>
          {desta.map((it) => (
            <Fragment key={it.id}>{cartoes[it.i]}</Fragment>
          ))}
          {n === paginas && depois}
        </div>
      )}
      {paginas > 1 && (
        <nav
          aria-label="Páginas da busca"
          data-pode-olhar
          className="flex flex-wrap items-center justify-center gap-2 pt-2"
        >
          <button
            type="button"
            onClick={() => ir(n - 1)}
            disabled={n === 1}
            className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-pill border border-line-strong bg-surface-200 px-3 text-label text-ink hover:bg-surface-300 disabled:opacity-40"
          >
            <ChevronLeft aria-hidden className="size-4" />
            <span className="max-sm:sr-only">Anterior</span>
          </button>
          {numeros(n, paginas).map((p, i) =>
            p === null ? (
              <span key={`r${i}`} className="px-1 text-ink-muted">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => ir(p)}
                aria-current={p === n ? "page" : undefined}
                aria-label={`Página ${p}`}
                className={`inline-flex size-10 items-center justify-center rounded-pill text-label tabular-nums ${
                  p === n
                    ? "bg-ink text-surface-100"
                    : "border border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
                }`}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => ir(n + 1)}
            disabled={n === paginas}
            className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-pill border border-line-strong bg-surface-200 px-3 text-label text-ink hover:bg-surface-300 disabled:opacity-40"
          >
            <span className="max-sm:sr-only">Próxima</span>
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </nav>
      )}
    </div>
  );
}

/** 1 … 4 5 6 … 10: a primeira, a última e as vizinhas da atual. */
function numeros(atual: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const meio = [atual - 1, atual, atual + 1].filter((p) => p > 1 && p < total);
  const lista: (number | null)[] = [1];
  if (meio[0] > 2) lista.push(null);
  lista.push(...meio);
  if (meio[meio.length - 1] < total - 1) lista.push(null);
  lista.push(total);
  return lista;
}
