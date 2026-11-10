"use client";

import { CircleHelp, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ajudaDaPagina } from "@/lib/ajuda-do-painel";

/**
 * O "Como funciona esta página" no pé do menu do painel de quem contrata (empresa, comércio e agência), junto do
 * "Recolher o menu" (com o menu recolhido, só o "?"): abre o que a página faz e as dicas, sem sair dela
 * (src/lib/ajuda-do-painel.ts). No computador abre ao lado do menu; no celular, embaixo. Fecha no X, no Esc, num
 * toque fora ou ao trocar de página.
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
    <div ref={caixa} className="relative" data-nao-imprimir>
      <button
        type="button"
        onClick={() => setAberta((a) => !a)}
        aria-expanded={aberta}
        aria-controls={id}
        title="Como funciona esta página"
        data-menu-link
        className={`flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 text-body-sm font-semibold hover:bg-surface-300 hover:text-ink ${
          aberta ? "bg-surface-300 text-ink" : "text-ink-muted"
        }`}
      >
        <CircleHelp aria-hidden className="size-5 shrink-0" />
        <span data-menu-texto>Como funciona esta página</span>
      </button>
      {aberta && (
        <section
          id={id}
          aria-label={`Ajuda: ${ajuda.titulo}`}
          className="absolute top-full left-0 z-30 mt-2 flex w-[min(24rem,calc(100vw-2rem))] lg:top-auto lg:bottom-0 lg:left-full lg:mt-0 lg:ml-3 flex-col gap-3 rounded-lg border border-line-strong bg-surface-200 p-4 shadow-card"
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
