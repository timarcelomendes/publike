"use client";

import { PenLine } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { EscreverRecado } from "../../recados/escrever-recado";

/**
 * No celular e no tablet, a busca e o "Recado" numa linha só (a primeira vaga sobe na tela): o
 * campo do recado abre ao tocar no botão. No computador, a busca fica no cabeçalho e o campo do
 * recado aparece sempre.
 */
export function BuscaERecado({ busca, recado }: { busca: ReactNode; recado: ComponentProps<typeof EscreverRecado> }) {
  const [aberto, setAberto] = useState(false);
  const [focar, setFocar] = useState(0);
  const id = useId();
  return (
    <>
      <div className="flex items-center gap-2 lg:hidden">
        <div className="min-w-0 flex-1">{busca}</div>
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={id}
          onClick={() => {
            if (!aberto) setFocar((n) => n + 1);
            setAberto(!aberto);
          }}
          className={`inline-flex h-12 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
            aberto ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-200 text-ink hover:bg-surface-300"
          }`}
        >
          <PenLine aria-hidden className="size-[18px]" />
          Recado
          <span className="sr-only">: escrever um recado para quem está perto</span>
        </button>
      </div>
      <div id={id} className={aberto ? "" : "max-lg:hidden"}>
        <EscreverRecado {...recado} focar={focar} />
      </div>
    </>
  );
}
