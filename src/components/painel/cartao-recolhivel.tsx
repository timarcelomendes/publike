"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

/**
 * O cartão da vaga em Vagas, contraído por padrão: o alto (estado, título, dados e as 4 etapas numa linha) fica
 * sempre à vista; a seta abre as caixas das etapas. `aberto`: já abre.
 */
export function CartaoRecolhivel({
  titulo,
  resumo,
  aberto: inicial = false,
  children,
}: {
  /** o título da vaga, para o leitor de tela dizer qual cartão abre */
  titulo: string;
  resumo: ReactNode;
  aberto?: boolean;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(inicial);
  const id = useId();
  return (
    <>
      <div className="relative pr-12">
        {resumo}
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={id}
          aria-label={`${aberto ? "Esconder" : "Mostrar"} as etapas de ${titulo}`}
          onClick={() => setAberto((a) => !a)}
          className="absolute top-0 right-0 inline-flex size-10 items-center justify-center rounded-pill border border-line-strong bg-surface-200 text-ink transition-colors hover:bg-surface-300"
        >
          <ChevronDown aria-hidden className={`size-5 transition-transform ${aberto ? "rotate-180" : ""}`} />
        </button>
      </div>
      <div id={id} hidden={!aberto}>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </>
  );
}
