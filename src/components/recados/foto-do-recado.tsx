"use client";

import { Maximize2, X } from "lucide-react";
import { useRef } from "react";

/**
 * A foto do recado. Na linha do tempo ela aparece cortada (até 280 px de altura); um toque abre a
 * foto inteira por cima da página. Fecha com o X, com um toque em qualquer lugar ou com o Esc.
 */
export function FotoDoRecado({ src, autor }: { src: string; autor: string }) {
  const janela = useRef<HTMLDialogElement>(null);
  const fechar = () => janela.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => janela.current?.showModal()}
        className="relative z-10 mt-2.5 block w-fit max-w-full cursor-zoom-in overflow-hidden rounded-[12px] bg-surface-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" className="block max-h-[280px] w-auto max-w-full object-cover" />
        <span className="sr-only">Ver a foto inteira</span>
        {/* o sinal de que dá para abrir */}
        <span
          aria-hidden
          className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-pill bg-[rgb(23_19_15/0.6)] text-on-hero"
        >
          <Maximize2 className="size-4" />
        </span>
      </button>

      <dialog
        ref={janela}
        aria-label={`Foto do recado de ${autor}`}
        // qualquer toque fecha (menos no X, que fecha sozinho)
        onClick={fechar}
        className="m-0 h-dvh max-h-none w-screen max-w-none cursor-zoom-out bg-transparent p-0 backdrop:bg-[rgb(23_19_15/0.9)]"
      >
        <div className="flex h-full w-full items-center justify-center p-3 pt-16 sm:p-10 sm:pt-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`Foto do recado de ${autor}`}
            className="max-h-full max-w-full rounded-[12px] object-contain shadow-raised"
          />
        </div>
        <button
          type="button"
          autoFocus
          onClick={(e) => {
            e.stopPropagation();
            fechar();
          }}
          className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-3 grid size-11 cursor-pointer place-items-center rounded-pill bg-[rgb(255_255_255/0.14)] text-on-hero hover:bg-[rgb(255_255_255/0.24)] focus-visible:outline-2 focus-visible:outline-on-hero"
        >
          <X aria-hidden className="size-6" />
          <span className="sr-only">Fechar a foto</span>
        </button>
      </dialog>
    </>
  );
}
