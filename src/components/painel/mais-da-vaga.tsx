"use client";

import { ChevronDown, Download, Eye, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

/** O "Mais" do cabeçalho da vaga: o que se usa de vez em quando, fora do caminho. */
export function MaisDaVaga({ id, noAr }: { id: string; noAr: boolean }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const idMenu = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const item =
    "flex min-h-11 items-center gap-2.5 rounded-sm px-3 text-label text-ink hover:bg-surface-300 [&_svg]:size-[18px] [&_svg]:text-ink-muted";
  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idMenu}
        onClick={() => setAberto((a) => !a)}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong bg-surface-200 px-3.5 text-label hover:bg-surface-300"
      >
        Mais
        <ChevronDown aria-hidden className={`size-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div
          id={idMenu}
          className="absolute right-0 z-30 mt-2 flex w-64 flex-col rounded-md border border-line bg-surface-200 p-1.5 shadow-card"
        >
          {noAr && (
            <Link href={`/painel/anuncio/${id}/convidar`} className={item} onClick={() => setAberto(false)}>
              <UserPlus aria-hidden />
              Chamar candidato de fora
            </Link>
          )}
          <Link href={`/anuncio/${id}`} className={item} onClick={() => setAberto(false)}>
            <Eye aria-hidden />
            Ver como o candidato vê
          </Link>
          <a href={`/painel/anuncio/${id}/planilha`} className={item} onClick={() => setAberto(false)}>
            <Download aria-hidden />
            Baixar a planilha
          </a>
        </div>
      )}
    </div>
  );
}
