"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Uma faixa de vagas que desliza de lado (claude/plano-carrossel-na-vaga.md): no celular, com o dedo, e o próximo
 * cartão aparece pela metade; no computador, 4 por vez, com "Anteriores" e "Próximas", apagados nas pontas (quando
 * tudo cabe, sem os botões). O teclado passa pelos cartões com o Tab. Cada filho é um <li> (FaixaItem).
 */
export function FaixaDeVagas({
  titulo,
  subtitulo,
  verTodas,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  /** "Ver todas", ao lado do título */
  verTodas?: { href: string; rotulo: string } | null;
  children: ReactNode;
}) {
  const id = useId();
  const lista = useRef<HTMLUListElement>(null);
  const [pontas, setPontas] = useState({ voltar: false, avancar: false });

  const medir = useCallback(() => {
    const l = lista.current;
    if (!l) return;
    setPontas({ voltar: l.scrollLeft > 4, avancar: l.scrollLeft + l.clientWidth < l.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const l = lista.current;
    if (!l) return;
    medir();
    l.addEventListener("scroll", medir, { passive: true });
    const tamanho = new ResizeObserver(medir);
    tamanho.observe(l);
    return () => {
      l.removeEventListener("scroll", medir);
      tamanho.disconnect();
    };
  }, [medir]);

  function passar(lado: 1 | -1) {
    const l = lista.current;
    if (!l) return;
    const calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // quase uma tela inteira: o último cartão visto continua à vista, para não perder o fio
    l.scrollBy({ left: lado * Math.max(l.clientWidth - 48, 200), behavior: calmo ? "auto" : "smooth" });
  }

  const botao =
    "flex size-10 items-center justify-center rounded-pill border border-line-strong bg-surface-200 text-ink transition-colors hover:bg-surface-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface-200";
  const temBotoes = pontas.voltar || pontas.avancar;

  return (
    <section aria-labelledby={`${id}-titulo`} className="mt-10 border-t border-line pt-8">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-titulo`} className="text-h2">
            {titulo}
          </h2>
          {subtitulo && <p className="mt-0.5 text-body-sm text-ink-muted">{subtitulo}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {verTodas && (
            <Link
              href={verTodas.href}
              className="text-label text-terra-text underline underline-offset-2 hover:text-ink"
            >
              {verTodas.rotulo}
            </Link>
          )}
          {temBotoes && (
            <div className="hidden gap-2 sm:flex">
              <button
                type="button"
                className={botao}
                onClick={() => passar(-1)}
                disabled={!pontas.voltar}
                aria-controls={`${id}-lista`}
                aria-label="Anteriores"
              >
                <ChevronLeft aria-hidden className="size-5" />
              </button>
              <button
                type="button"
                className={botao}
                onClick={() => passar(1)}
                disabled={!pontas.avancar}
                aria-controls={`${id}-lista`}
                aria-label="Próximas"
              >
                <ChevronRight aria-hidden className="size-5" />
              </button>
            </div>
          )}
        </div>
      </div>
      <ul
        ref={lista}
        id={`${id}-lista`}
        className="sem-barra -mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pt-1 pb-3 sm:mx-0 sm:scroll-px-0 sm:px-0 motion-safe:scroll-smooth"
      >
        {children}
      </ul>
    </section>
  );
}

/** Um cartão da faixa: no celular, 16rem (o próximo aparece pela metade); 2 por vez no tablet e 4 no computador. */
export function FaixaItem({ children }: { children: ReactNode }) {
  return <li className="w-64 shrink-0 snap-start sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-3rem)/4)]">{children}</li>;
}
