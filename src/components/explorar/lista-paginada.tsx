"use client";

import { ChevronLeft, ChevronRight, MapPinned } from "lucide-react";
import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { dentro, useAreaDoMapa } from "./area-do-mapa";

const POR_PAGINA = 12;

/**
 * Os cartões da busca, de 12 em 12. Com o mapa na tela, só os que estão na parte do mapa à
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
  const topo = useRef<HTMLDivElement>(null);
  // a página volta para a primeira quando a área muda (a chave é a área)
  const chaveArea = area ? area.map((n) => n.toFixed(4)).join(",") : "toda";
  const [pagina, setPagina] = useState({ area: chaveArea, n: 1 });
  const atual = pagina.area === chaveArea ? pagina.n : 1;

  const visiveis = useMemo(
    () => itens.map((it, i) => ({ ...it, i })).filter((it) => !area || dentro(area, it.lat, it.lng)),
    [itens, area],
  );
  const total = visiveis.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const n = Math.min(atual, paginas);
  const desta = visiveis.slice((n - 1) * POR_PAGINA, n * POR_PAGINA);
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
        <nav aria-label="Páginas da busca" className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => ir(n - 1)}
            disabled={n === 1}
            className="inline-flex min-h-10 items-center gap-1 rounded-pill border border-line-strong bg-surface-200 px-3 text-label text-ink hover:bg-surface-300 disabled:opacity-40"
          >
            <ChevronLeft aria-hidden className="size-4" />
            Anterior
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
            className="inline-flex min-h-10 items-center gap-1 rounded-pill border border-line-strong bg-surface-200 px-3 text-label text-ink hover:bg-surface-300 disabled:opacity-40"
          >
            Próxima
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
