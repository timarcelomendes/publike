"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Uma faixa que rola de lado (as colunas do quadro da vaga) com o sinal de que há mais: a borda some aos poucos e uma
 * seta leva às próximas colunas (pedido do Marcelo, 10/11/2026). Sem nada escondido, não aparece nada.
 */
export function RolagemDeLado({
  children,
  className,
  ocupado,
  rotulo = "colunas",
}: {
  children: ReactNode;
  className: string;
  ocupado?: boolean;
  /** o que rola, para o leitor de tela ("Ver as próximas colunas") */
  rotulo?: string;
}) {
  const faixa = useRef<HTMLDivElement>(null);
  const [lados, setLados] = useState({ esquerda: false, direita: false });

  useEffect(() => {
    const el = faixa.current;
    if (!el) return;
    const medir = () => {
      const resto = el.scrollWidth - el.clientWidth - el.scrollLeft;
      setLados((l) => {
        const novo = { esquerda: el.scrollLeft > 8, direita: resto > 8 };
        return l.esquerda === novo.esquerda && l.direita === novo.direita ? l : novo;
      });
    };
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", medir);
      ro.disconnect();
    };
  }, []);

  const rolar = (sentido: 1 | -1) => {
    const el = faixa.current;
    if (!el) return;
    const coluna = el.firstElementChild instanceof HTMLElement ? el.firstElementChild.offsetWidth + 12 : 280;
    el.scrollBy({ left: sentido * coluna, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div ref={faixa} aria-busy={ocupado} className={className}>
        {children}
      </div>
      {lados.esquerda && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-surface-100 to-transparent"
          />
          <button
            type="button"
            onClick={() => rolar(-1)}
            aria-label={`Ver as ${rotulo} anteriores`}
            className="absolute top-14 left-1 hidden size-10 items-center justify-center rounded-pill border border-line-strong bg-surface-200 text-ink shadow-card hover:bg-surface-300 sm:flex"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
        </>
      )}
      {lados.direita && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-surface-100 to-transparent"
          />
          <button
            type="button"
            onClick={() => rolar(1)}
            aria-label={`Ver as próximas ${rotulo}`}
            className="absolute top-14 right-1 flex h-10 items-center gap-1 rounded-pill border border-line-strong bg-surface-200 px-3 text-label text-ink shadow-card hover:bg-surface-300"
          >
            <span className="hidden sm:inline">Mais {rotulo}</span>
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </>
      )}
    </div>
  );
}
