"use client";

import { useRouter } from "next/navigation";
import { pedirEntrar } from "./folha-de-entrar";

// Para quem está sem conta, no cartão da vaga, no lugar do % de match (11/11/2026: chamar para entrar, "quer ver se
// combina com você?"): "?%"; o toque abre a folha de entrar e, de volta à mesma lista, cada vaga mostra o % de verdade
// (com o currículo preenchido). Sem cadeado: é grátis, e o cadeado dava a ideia de que era pago.

const DICA = "Entre grátis e veja o quanto esta vaga combina com você";

function useEntrarParaVer() {
  const router = useRouter();
  return () => {
    const proximo = `${window.location.pathname}${window.location.search}`;
    const pediu = pedirEntrar({
      proximo,
      titulo: "Veja o quanto cada vaga combina com você",
      texto: "É grátis. Depois de entrar, cada vaga mostra o % de match com o seu currículo.",
    });
    if (!pediu) router.push(`/entrar?next=${encodeURIComponent(proximo)}`);
  };
}

/** Na grade e na lista: o selo "?% de match", com o contorno do selo de match. */
export function SeloMatchFechado({ className = "" }: { className?: string }) {
  const entrar = useEntrarParaVer();
  return (
    <button
      type="button"
      data-funil="match"
      title={DICA}
      onClick={entrar}
      className={`relative z-10 inline-flex min-h-9 shrink-0 items-center rounded-pill border border-cerrado-text px-2.5 text-caption whitespace-nowrap text-cerrado-text uppercase transition-colors hover:bg-cerrado hover:text-on-cerrado ${className}`}
    >
      <span aria-hidden>?% de match</span>
      <span className="sr-only">{DICA}</span>
    </button>
  );
}

/**
 * Em Blocos, no anel do canto do cartão: o arco embaçado e "?%" no meio. Ao passar o mouse, o arco fica nítido; o
 * toque abre a folha de entrar.
 */
export function AnelMatchFechado() {
  const entrar = useEntrarParaVer();
  const raio = 20;
  const volta = 2 * Math.PI * raio;
  return (
    <button
      type="button"
      data-funil="match"
      title={DICA}
      onClick={entrar}
      className="group/anel relative z-10 inline-flex size-12 shrink-0 rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 size-12" aria-hidden>
        <circle cx="24" cy="24" r={raio} fill="none" stroke="var(--pk-surface-300)" strokeWidth="4.5" />
      </svg>
      {/* o arco de um número que não é de ninguém, embaçado: só o desenho (o filtro no <svg>, que o Safari aceita) */}
      <svg
        viewBox="0 0 48 48"
        className="absolute inset-0 size-12 -rotate-90 opacity-60 blur-[1.5px] transition-[filter,opacity] duration-200 group-hover/anel:opacity-90 group-hover/anel:blur-none motion-reduce:transition-none"
        aria-hidden
      >
        <circle
          cx="24"
          cy="24"
          r={raio}
          fill="none"
          stroke="var(--pk-cerrado)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray={volta}
          strokeDashoffset={volta * 0.3}
        />
      </svg>
      <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display text-[15px] font-bold text-ink">?%</span>
        <span className="mt-0.5 text-[8px] font-semibold text-ink-muted uppercase">match</span>
      </span>
      <span className="sr-only">{DICA}</span>
    </button>
  );
}
