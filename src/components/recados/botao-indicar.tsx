"use client";

import { Check, Link2, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { SITE_URL } from "@/lib/config";

/**
 * Indicar: manda o link do recado. No celular, abre o compartilhar do aparelho; no computador,
 * um quadro com "Mandar no WhatsApp" e "Copiar link".
 */
export function BotaoIndicar({ recadoId, autor }: { recadoId: string; autor: string }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const id = useId();
  const quadro = useRef<HTMLDivElement>(null);
  const url = `${SITE_URL}/recado/${recadoId}`;
  const texto = `Olha esse recado de ${autor} no Publike:`;

  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    const fora = (e: PointerEvent) => {
      if (quadro.current && !quadro.current.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("pointerdown", fora);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("pointerdown", fora);
    };
  }, [aberto]);

  async function indicar() {
    const toque = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (toque && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Recado no Publike", text: texto, url });
        return;
      } catch (e) {
        // cancelou: não faz nada; outro erro: abre o quadro
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    setCopiado(false);
    setAberto((a) => !a);
  }

  return (
    <div ref={quadro} className="relative z-10">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={indicar}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-pill px-3 text-label text-ink hover:bg-surface-100"
      >
        <Share2 aria-hidden className="size-[18px]" />
        Indicar
      </button>
      {aberto && (
        <div
          id={id}
          className="absolute bottom-11 left-0 z-30 flex w-60 flex-col rounded-lg border border-line bg-surface-200 p-1.5 text-ink shadow-raised"
        >
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setAberto(false)}
            className="flex min-h-11 items-center gap-2.5 rounded-md px-3 text-label hover:bg-surface-300"
          >
            <MessageCircle aria-hidden className="size-[18px]" />
            Mandar no WhatsApp
          </a>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopiado(true);
              } catch {
                setCopiado(false);
              }
            }}
            className="flex min-h-11 items-center gap-2.5 rounded-md px-3 text-left text-label hover:bg-surface-300"
          >
            {copiado ? <Check aria-hidden className="size-[18px]" /> : <Link2 aria-hidden className="size-[18px]" />}
            <span aria-live="polite">{copiado ? "Link copiado" : "Copiar link"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
