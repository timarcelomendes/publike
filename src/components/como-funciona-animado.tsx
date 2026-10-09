"use client";

import { useRef } from "react";
import { CartaoDemo, useEtapasDemo, type Etapa } from "./demo-match";
import { PASSOS } from "./passos";

const PASSO_DA_ETAPA: Record<Etapa, number> = { curtir: 0, curtido: 1, match: 2 };

/**
 * Página inicial: os três passos ao lado do anúncio de exemplo. Quando a seção
 * aparece na tela, o anúncio é curtido e dá match, e o passo da vez acende.
 */
export function ComoFuncionaAnimado() {
  const area = useRef<HTMLDivElement>(null);
  const etapa = useEtapasDemo(area);
  const ativo = PASSO_DA_ETAPA[etapa];

  return (
    <div ref={area} className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
      <ol className="flex flex-col gap-2 lg:col-span-6">
        {PASSOS.map(({ icone: Icone, titulo, texto, cor, cheio }, i) => (
          <li
            key={titulo}
            aria-current={i === ativo ? "step" : undefined}
            className={`flex gap-4 rounded-lg border p-4 transition-colors duration-300 sm:p-5 ${
              i === ativo ? "border-line bg-surface-200 shadow-card" : "border-transparent"
            }`}
          >
            <span className={`flex size-11 shrink-0 items-center justify-center rounded-pill ${cor}`}>
              <Icone aria-hidden className="size-5" fill={cheio ? "currentColor" : "none"} />
            </span>
            <div>
              <h3 className="text-h3">{titulo}</h3>
              <p className="mt-1 text-body-sm text-ink-muted">{texto}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex justify-center lg:col-span-5 lg:col-start-8">
        <div className="w-full max-w-sm">
          <CartaoDemo etapa={etapa} />
        </div>
      </div>
    </div>
  );
}
