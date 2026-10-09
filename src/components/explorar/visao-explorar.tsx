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

/**
 * Lista e mapa lado a lado no computador; no celular, um botão alterna entre os dois.
 * Cabeçalho: contagem e origem à esquerda; filtros da lista à direita (embaixo, no celular).
 */
export function VisaoExplorar({
  titulo,
  subtitulo,
  filtrosLista,
  lista,
  pontos,
  filtros,
}: {
  titulo: ReactNode;
  subtitulo: ReactNode;
  filtrosLista: ReactNode;
  lista: ReactNode;
  pontos: PontoMapa[];
  filtros: Filtros;
}) {
  const telaGrande = useTelaGrande();
  const [modo, setModo] = useState<"lista" | "mapa">("lista");
  const mostrarMapa = telaGrande || modo === "mapa";
  const naLista = modo === "lista";

  return (
    <div>
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 lg:gap-x-6">
        <div className="col-start-1 row-start-1">{titulo}</div>
        <button
          type="button"
          onClick={() => setModo(naLista ? "mapa" : "lista")}
          className="col-start-2 row-start-1 inline-flex min-h-10 items-center gap-2 rounded-pill border border-line-strong bg-surface-200 px-4 text-label text-ink transition-colors hover:bg-surface-300 lg:hidden"
        >
          {naLista ? <IconeMapa aria-hidden className="size-4" /> : <List aria-hidden className="size-4" />}
          {naLista ? "Ver mapa" : "Ver lista"}
        </button>
        <div className="col-span-2 row-start-2 lg:col-span-1">{subtitulo}</div>
        {/* a faixa dos filtros tem 4px de folga (contorno do foco): -mb-1 alinha com a linha de baixo */}
        <div className="col-span-2 row-start-3 mt-2 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:-mb-1 lg:mt-0 lg:self-end">
          {filtrosLista}
        </div>
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
