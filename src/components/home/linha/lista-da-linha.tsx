"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

/** De quantos em quantos itens a linha cresce no "Ver mais". */
const PASSO = 20;

/**
 * A linha mostra 20 itens e o "Ver mais" traz mais 20. `partes` vem do servidor já na ordem
 * (separadores de dia, a marca e os itens); `contam` diz quais partes são itens.
 */
export function ListaDaLinha({ partes, contam }: { partes: ReactNode[]; contam: boolean[] }) {
  const [ate, setAte] = useState(PASSO);
  let itens = 0;
  let corte = partes.length;
  for (let i = 0; i < partes.length; i++) {
    if (!contam[i]) continue;
    itens++;
    if (itens > ate) {
      corte = i;
      break;
    }
  }
  // um separador de dia (ou a marca) sozinho no fim não serve: corta antes dele
  while (corte > 0 && corte < partes.length && !contam[corte - 1]) corte--;
  return (
    <>
      {partes.slice(0, corte)}
      {corte < partes.length && (
        <div className="flex justify-center pt-2 sm:pl-[112px]">
          <button
            type="button"
            onClick={() => setAte((n) => n + PASSO)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-line-strong bg-surface-200 px-5 text-label hover:bg-surface-300"
          >
            Ver mais
            <ChevronDown aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}
