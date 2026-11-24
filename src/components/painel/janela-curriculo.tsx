"use client";

import { FileText, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { classesBotao } from "../ui/botao";

/**
 * "Ver currículo completo": abre o currículo numa janela por cima da ficha (no celular, de baixo
 * para cima), para a ficha não esticar. Fecha no X, no Esc ou tocando fora. `rotulo` e `titulo`
 * trocam o texto do botão e o título da janela (na tela do currículo, a pessoa vê o próprio).
 */
export function JanelaDoCurriculo({
  nome,
  rotulo = "Ver currículo completo",
  titulo,
  destaque = false,
  children,
}: {
  nome: string;
  /** escuro e maior, no alto da ficha (24/11/2026; Marcelo: "E destaque") */
  destaque?: boolean;
  rotulo?: string;
  titulo?: string;
  children: ReactNode;
}) {
  const [aberta, setAberta] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  // a tela do currículo tem duas (a da coluna do lado e a do celular): cada uma com o seu id
  const idTitulo = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta && !d.open) d.showModal();
    if (!aberta && d.open) d.close();
  }, [aberta]);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className={
          destaque
            ? // sem misturar com as cores do classesBotao (as classes brigariam): escuro, com o tamanho normal
              "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 self-start rounded-md border border-ink bg-ink px-3 text-label sm:px-4 whitespace-nowrap text-surface-100 transition-colors hover:opacity-90 [&_svg]:size-[18px] [&_svg]:shrink-0"
            : classesBotao("secundario", "sm", "self-start")
        }
      >
        <FileText aria-hidden />
        {/* no celular, ao lado do nome, só o ícone (o nome não aperta); o texto fica para o leitor de tela */}
        <span className={destaque ? "max-sm:sr-only" : undefined}>{rotulo}</span>
      </button>
      <dialog
        ref={ref}
        aria-labelledby={idTitulo}
        onClose={() => setAberta(false)}
        onClick={(e) => e.target === e.currentTarget && setAberta(false)}
        className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-lg border border-line-strong bg-surface-200 p-0 text-ink shadow-raised backdrop:bg-veu sm:m-auto sm:max-h-[88dvh] sm:w-[40rem] sm:rounded-lg"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface-200 px-5 py-3">
          <h2 id={idTitulo} className="truncate text-h3">
            {titulo ?? `Currículo de ${nome}`}
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
