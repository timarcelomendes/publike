"use client";

import { PenLine } from "lucide-react";
import { useId } from "react";

/** O texto do convite, pelo uso da conta: quem procura trabalho, quem presta serviço ou quem contrata. */
export type TextoDoConvite = { pedido: string; exemplo: string; quemVe: string };

/**
 * O convite para deixar o primeiro recado: um balão que aponta para o campo do recado (no
 * computador, embaixo dele; no celular, para o botão "Recado" da linha de cima).
 */
export function ConviteRecado({
  texto,
  aoEscrever,
  aoFechar,
}: {
  texto: TextoDoConvite;
  aoEscrever: () => void;
  aoFechar: () => void;
}) {
  const titulo = useId();
  return (
    <section
      aria-labelledby={titulo}
      className="relative rounded-lg bg-terra-soft px-4 pt-3.5 pb-3 text-ink max-lg:mt-1 lg:mb-1"
    >
      {/* a seta: para o "Recado" no celular (em cima, à direita); para o campo no computador (embaixo) */}
      <span
        aria-hidden
        className="absolute -top-1.5 right-12 size-3 rotate-45 bg-terra-soft lg:top-auto lg:right-auto lg:-bottom-1.5 lg:left-16"
      />
      <h3 id={titulo} className="flex items-center gap-2 text-label">
        <PenLine aria-hidden className="size-4 shrink-0 text-terra-text" />
        Deixe um recado no seu bairro
      </h3>
      <p className="mt-1 text-body-sm">
        {texto.pedido} Ex.: <i>“{texto.exemplo}”</i> {texto.quemVe}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={aoFechar}
          className="inline-flex min-h-9 items-center rounded-pill px-3 text-label text-ink-muted hover:bg-surface-200/60 hover:text-ink"
        >
          Agora não
        </button>
        <button
          type="button"
          onClick={aoEscrever}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-pill bg-ink px-4 text-label text-surface-100 hover:opacity-90"
        >
          <PenLine aria-hidden className="size-4" />
          Escrever meu recado
        </button>
      </div>
    </section>
  );
}
