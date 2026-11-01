"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

// Uma dica de primeira vez (claude/plano-fluxo-contratar.md, parte 8): "Entendi" esconde neste aparelho (a chave no
// localStorage). No servidor, escondida; sem o armazenamento do navegador, aparece e fecha até recarregar.

function ouvir(avisar: () => void) {
  window.addEventListener("storage", avisar);
  return () => window.removeEventListener("storage", avisar);
}

export function DicaUmaVez({ chave, children }: { chave: string; children: ReactNode }) {
  const vista = useSyncExternalStore(
    ouvir,
    () => {
      try {
        return Boolean(localStorage.getItem(chave));
      } catch {
        return false;
      }
    },
    () => true,
  );
  const [fechada, setFechada] = useState(false);
  if (vista || fechada) return null;
  return (
    <div
      role="note"
      className="flex w-full flex-col gap-2 rounded-md border border-line bg-surface-200 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
    >
      <p className="flex-1 text-body-sm text-ink-muted">
        <span className="font-semibold text-ink">Dica:</span> {children}
      </p>
      <button
        type="button"
        onClick={() => {
          setFechada(true);
          try {
            localStorage.setItem(chave, "1");
          } catch {}
        }}
        className="inline-flex min-h-10 shrink-0 items-center self-start rounded-md border border-line-strong px-3.5 text-label hover:bg-surface-300"
      >
        Entendi
      </button>
    </div>
  );
}
