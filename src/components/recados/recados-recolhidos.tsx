"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

/** "Mais 3 recados": no Tudo, depois de 2 recados seguidos, o resto fica recolhido até tocar. */
export function RecadosRecolhidos({
  quantos,
  grade,
  children,
}: {
  quantos: number;
  /** a grade da linha (hora, nó, objeto): o botão fica na coluna dos objetos */
  grade: string;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  if (aberto) return <>{children}</>;
  return (
    <div className={`${grade} items-center`}>
      <span className="hidden sm:block" />
      <span className="hidden sm:block" />
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-pill bg-tom-recado px-4 text-label text-ink hover:brightness-[0.97]"
      >
        Mais {quantos} {quantos === 1 ? "recado" : "recados"}
        <ChevronDown aria-hidden className="size-4" />
      </button>
    </div>
  );
}
