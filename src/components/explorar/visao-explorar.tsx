"use client";

import { List, Map as IconeMapa } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import type { Filtros } from "@/lib/filtros";
import { MapaAnuncios, type PontoMapa } from "../mapa/mapa-anuncios";

const TELA_GRANDE = "(min-width: 1024px)";

function useTelaGrande() {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(TELA_GRANDE);
      mq.addEventListener("change", avisar);
      return () => mq.removeEventListener("change", avisar);
    },
    () => window.matchMedia(TELA_GRANDE).matches,
    () => false,
  );
}

/** Lista e mapa lado a lado no computador; no celular, alterna entre os dois. */
export function VisaoExplorar({
  lista,
  pontos,
  filtros,
}: {
  lista: ReactNode;
  pontos: PontoMapa[];
  filtros: Filtros;
}) {
  const telaGrande = useTelaGrande();
  const [modo, setModo] = useState<"lista" | "mapa">("lista");
  const mostrarMapa = telaGrande || modo === "mapa";

  const aba = (ativo: boolean) =>
    `inline-flex min-h-10 items-center gap-2 rounded-pill px-4 text-label transition-colors ${
      ativo ? "bg-ink text-surface-100" : "text-ink hover:bg-surface-300"
    }`;

  return (
    <div>
      <div role="group" aria-label="Ver como" className="mb-4 inline-flex rounded-pill border border-line bg-surface-200 p-1 lg:hidden">
        <button type="button" aria-pressed={modo === "lista"} onClick={() => setModo("lista")} className={aba(modo === "lista")}>
          <List aria-hidden className="size-4" />
          Lista
        </button>
        <button type="button" aria-pressed={modo === "mapa"} onClick={() => setModo("mapa")} className={aba(modo === "mapa")}>
          <IconeMapa aria-hidden className="size-4" />
          Mapa
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-6">
        <div className={modo === "mapa" ? "hidden lg:block" : ""}>{lista}</div>
        <div className={modo === "lista" ? "hidden lg:block" : ""}>
          <div className="h-[65dvh] lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)]">
            {mostrarMapa && <MapaAnuncios pontos={pontos} filtros={filtros} />}
          </div>
        </div>
      </div>
    </div>
  );
}
