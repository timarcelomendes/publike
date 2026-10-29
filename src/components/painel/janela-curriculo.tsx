"use client";

import { FileText, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { classesBotao } from "../ui/botao";

/**
 * "Ver currículo completo": abre o currículo numa janela por cima da ficha (no celular, de baixo
 * para cima), para a ficha não esticar. Fecha no X, no Esc ou tocando fora.
 */
export function JanelaDoCurriculo({ nome, children }: { nome: string; children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta && !d.open) d.showModal();
    if (!aberta && d.open) d.close();
  }, [aberta]);
  return (
    <>
      <button type="button" onClick={() => setAberta(true)} className={classesBotao("secundario", "sm", "self-start")}>
        <FileText aria-hidden />
        Ver currículo completo
      </button>
      <dialog
        ref={ref}
        aria-labelledby="titulo-janela-curriculo"
        onClose={() => setAberta(false)}
        onClick={(e) => e.target === e.currentTarget && setAberta(false)}
        className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-lg border border-line-strong bg-surface-200 p-0 text-ink shadow-raised backdrop:bg-veu sm:m-auto sm:max-h-[88dvh] sm:w-[40rem] sm:rounded-lg"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface-200 px-5 py-3">
          <h2 id="titulo-janela-curriculo" className="truncate text-h3">
            Currículo de {nome}
          </h2>
          <button
            type="button"
            onClick={() => setAberta(false)}
            aria-label="Fechar"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{aberta && children}</div>
      </dialog>
    </>
  );
}
