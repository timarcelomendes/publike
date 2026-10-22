"use client";

import { usePathname, useSearchParams } from "next/navigation";

/** O campo da busca do cabeçalho (quem entrou). */
export function EntradaDaBusca({ valor = "" }: { valor?: string }) {
  return (
    <input
      type="search"
      name="q"
      enterKeyHint="search"
      placeholder="Garçom, diarista, auxiliar…"
      maxLength={80}
      defaultValue={valor}
      className="min-w-0 flex-1 bg-transparent text-body-sm text-ink outline-none placeholder:text-ink-muted"
    />
  );
}

/** Na página inicial com uma busca (?q=mecânico), o campo já mostra a palavra: dá para ver e mudar o que buscou. */
export function EntradaComABusca() {
  const caminho = usePathname();
  const q = useSearchParams().get("q")?.trim().slice(0, 80) ?? "";
  const valor = caminho === "/" ? q : "";
  // a chave troca o campo quando a busca muda (o valor inicial só vale na montagem)
  return <EntradaDaBusca key={valor} valor={valor} />;
}
