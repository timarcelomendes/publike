"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { pedirEntrar } from "./folha-de-entrar";

/**
 * Para quem está sem conta, no cartão da vaga, no lugar do % de match (11/11/2026: chamar para entrar, "quer ver se
 * combina com você?"): o número embaçado; o toque abre a folha de entrar e, de volta à mesma lista, cada vaga mostra o
 * % de verdade (com o currículo preenchido). O número embaçado não é de ninguém: só o desenho do selo.
 */
export function SeloMatchFechado({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      data-funil="match"
      title="Entre para ver o quanto esta vaga combina com você"
      onClick={() => {
        const proximo = `${window.location.pathname}${window.location.search}`;
        if (!pedirEntrar({ proximo, titulo: "Veja o quanto cada vaga combina com você" })) {
          router.push(`/entrar?next=${encodeURIComponent(proximo)}`);
        }
      }}
      className={`relative z-10 inline-flex min-h-9 shrink-0 items-center gap-1 rounded-pill border border-cerrado-text px-2.5 text-caption whitespace-nowrap text-cerrado-text uppercase transition-colors hover:bg-cerrado hover:text-on-cerrado ${className}`}
    >
      <Lock aria-hidden className="size-3.5" />
      <span aria-hidden className="blur-[3px] select-none">
        87
      </span>
      <span aria-hidden>% de match</span>
      <span className="sr-only">Entre e veja o seu % de match nesta vaga</span>
    </button>
  );
}
