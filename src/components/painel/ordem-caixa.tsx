"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Seletor } from "../ui/campo";

/** A ordem da lista de Candidatos (troca a URL, mantendo a etapa e a vaga). */
export function OrdemDaCaixa({
  ordens,
  ordem,
  base,
}: {
  ordens: readonly { valor: string; nome: string }[];
  ordem: string;
  /** a URL da página sem a ordem (com a etapa e a vaga) */
  base: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <Seletor
      id="ordem-caixa"
      aria-label="Ordem"
      value={ordem}
      disabled={pendente}
      onChange={(e) => {
        const url = new URL(base, location.origin);
        if (e.target.value) url.searchParams.set("ordem", e.target.value);
        else url.searchParams.delete("ordem");
        iniciar(() => router.push(`${url.pathname}${url.search}`, { scroll: false }));
      }}
      envoltorio="min-w-0 shrink-0 self-start sm:self-auto"
      className="field-sizing-content min-h-10 max-w-full rounded-pill border border-line-strong bg-surface-200 pl-4 text-label text-ink transition-colors hover:bg-surface-300 disabled:opacity-60"
    >
      {ordens.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.nome}
        </option>
      ))}
    </Seletor>
  );
}
