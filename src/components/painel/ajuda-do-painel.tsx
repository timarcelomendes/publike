"use client";

import { CircleHelp, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ajudaDaPagina } from "@/lib/ajuda-do-painel";

/**
 * O "?" (só o ícone, "Como funciona esta página") no alto de cada página do painel de quem contrata (empresa, comércio e agência): abre o que a página faz e
 * as dicas, sem sair dela (src/lib/ajuda-do-painel.ts). Fecha no X, no Esc, num toque fora ou ao trocar de página.
 */
export function AjudaDoPainel({ agencia }: { agencia: boolean }) {
  const caminho = usePathname();
  const ajuda = ajudaDaPagina(caminho, agencia);
  const [aberta, setAberta] = useState(false);
  const [deQual, setDeQual] = useState(caminho);
  const caixa = useRef<HTMLDivElement>(null);
  const id = useId();
  // trocou de página: fecha (sem efeito, durante a renderização)
  if (deQual !== caminho) {
    setDeQual(caminho);
    setAberta(false);
  }

  useEffect(() => {
    if (!aberta) return;
    const fora = (e: PointerEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberta(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberta(false);
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberta]);

  if (!ajuda) return null;
  return (
    <div ref={caixa} className="relative mb-2 flex justify-end" data-nao-imprimir>
      <button
        type="button"
        onClick={() => setAberta((a) => !a)}
        aria-expanded={aberta}
        aria-controls={id}
        aria-label="Como funciona esta página"
        title="Como funciona esta página"
        className={`inline-flex size-10 items-center justify-center rounded-pill border bg-surface-200 hover:border-line-strong hover:text-ink ${
          aberta ? "border-line-strong text-ink" : "border-line text-ink-muted"
        }`}
      >
        <CircleHelp aria-hidden className="size-5" />
      </button>
      {aberta && (
        <section
          id={id}
          aria-label={`Ajuda: ${ajuda.titulo}`}
          className="absolute top-12 right-0 z-30 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 rounded-lg border border-line-strong bg-surface-200 p-4 shadow-card"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-h3">{ajuda.titulo}</h2>
            <button
              type="button"
              onClick={() => setAberta(false)}
              aria-label="Fechar a ajuda"
              className="-mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <p className="text-body-sm">{ajuda.texto}</p>
          {ajuda.dicas.length > 0 && (
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body-sm text-ink-muted">
              {ajuda.dicas.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          <Link href="/ajuda" className="self-start text-label underline underline-offset-2">
            Mais dúvidas na Ajuda
          </Link>
        </section>
      )}
    </div>
  );
}
