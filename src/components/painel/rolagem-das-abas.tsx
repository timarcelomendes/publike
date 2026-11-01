"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * As abas da vaga numa linha que rola de lado: abre com a aba atual à vista (no meio, quando não cabe) e mostra
 * um degradê no lado em que ainda há abas escondidas.
 */
export function RolagemDasAbas({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  const nav = useRef<HTMLElement>(null);
  const [antes, setAntes] = useState(false);
  const [depois, setDepois] = useState(false);
  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    const ativa = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (ativa) {
      const caixa = el.getBoundingClientRect();
      const aba = ativa.getBoundingClientRect();
      // só de lado: scrollIntoView também rolaria a página
      if (aba.left < caixa.left || aba.right > caixa.right)
        el.scrollLeft += aba.left - caixa.left - (caixa.width - aba.width) / 2;
    }
    const medir = () => {
      setAntes(el.scrollLeft > 4);
      setDepois(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    return () => {
      el.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
    };
  }, []);
  return (
    <div className="relative">
      <nav ref={nav} aria-label={rotulo} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {children}
      </nav>
      {antes && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-4 w-12 bg-gradient-to-r from-surface-100 to-transparent sm:left-0"
        />
      )}
      {depois && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -right-4 w-12 bg-gradient-to-l from-surface-100 to-transparent sm:right-0"
        />
      )}
    </div>
  );
}
