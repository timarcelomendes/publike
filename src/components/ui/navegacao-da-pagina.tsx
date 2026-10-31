"use client";

import { useEffect, useState } from "react";

export type AssuntoDaPagina = { id: string; nome: string; numero?: number | null };

/**
 * A navegação entre os assuntos de uma página longa: uma linha que fica presa embaixo do cabeçalho do site,
 * com um link para cada parte. A parte que está na tela fica marcada. No celular, a linha rola de lado.
 * Cada parte precisa do `id` e de `scroll-mt-32` (para o título não ficar embaixo da linha).
 */
export function NavegacaoDaPagina({ assuntos, rotulo }: { assuntos: AssuntoDaPagina[]; rotulo: string }) {
  const [atual, setAtual] = useState<string | null>(assuntos[0]?.id ?? null);

  useEffect(() => {
    const partes = assuntos.map((a) => document.getElementById(a.id)).filter((el): el is HTMLElement => Boolean(el));
    if (!partes.length || typeof IntersectionObserver === "undefined") return;
    const visiveis = new Map<string, boolean>();
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) visiveis.set(e.target.id, e.isIntersecting);
        // a primeira parte (na ordem da página) que aparece na faixa de cima da tela
        const primeira = assuntos.find((a) => visiveis.get(a.id));
        if (primeira) setAtual(primeira.id);
      },
      { rootMargin: "-128px 0px -55% 0px" },
    );
    partes.forEach((p) => obs.observe(p));
    return () => obs.disconnect();
  }, [assuntos]);

  if (assuntos.length < 2) return null;
  return (
    <nav
      aria-label={rotulo}
      className="sticky top-16 z-30 -mx-4 border-b border-line bg-surface-100/95 px-4 backdrop-blur-md sm:mx-0 sm:rounded-md sm:border sm:px-2"
    >
      <ul className="flex gap-1 overflow-x-auto py-1.5">
        {assuntos.map((a) => {
          const ativo = a.id === atual;
          return (
            <li key={a.id} className="shrink-0">
              <a
                href={`#${a.id}`}
                aria-current={ativo ? "location" : undefined}
                onClick={() => setAtual(a.id)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill px-3 text-label transition-colors ${
                  ativo ? "bg-ink text-surface-100" : "text-ink-muted hover:bg-surface-300 hover:text-ink"
                }`}
              >
                {a.nome}
                {a.numero != null && a.numero > 0 && (
                  <span className={`tabular-nums ${ativo ? "text-surface-100/80" : "text-ink-muted"}`}>
                    {a.numero > 999 ? "999+" : a.numero}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
