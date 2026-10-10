"use client";

import { Columns2, LayoutGrid, List, Map as IconeMapa, Rows3, type LucideIcon } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
import type { Filtros } from "@/lib/filtros";
import { MapaAnuncios, type OrigemMapa, type PontoMapa } from "../mapa/mapa-anuncios";

const TELA_GRANDE = "(min-width: 1024px)";

/**
 * Jeitos de ver a busca:
 *   lista ........ uma linha por anúncio: título, lugar, valor e curtir
 *   grade ........ cartões pequenos, muitos por linha (só título, lugar e valor)
 *   blocos ....... os cartões completos, sem mapa
 *   mapa ......... só o mapa, grande
 *   blocos-mapa .. cartões e mapa juntos (lado a lado no computador; no celular, o mapa em cima)
 * A escolha fica guardada neste navegador.
 */
export type Visao = "lista" | "grade" | "blocos" | "mapa" | "blocos-mapa";

const VISOES: { valor: Visao; nome: string; icone: LucideIcon }[] = [
  { valor: "lista", nome: "Lista", icone: List },
  { valor: "grade", nome: "Grade", icone: LayoutGrid },
  { valor: "blocos", nome: "Blocos", icone: Rows3 },
  { valor: "mapa", nome: "Mapa", icone: IconeMapa },
  { valor: "blocos-mapa", nome: "Blocos + mapa", icone: Columns2 },
];

const CHAVE = "publike_visao";
const EVENTO = "publike-visao";

function lerGuardada(): Visao | null {
  try {
    const v = window.localStorage.getItem(CHAVE);
    return VISOES.some((x) => x.valor === v) ? (v as Visao) : null;
  } catch {
    return null;
  }
}

function guardar(v: Visao) {
  try {
    window.localStorage.setItem(CHAVE, v);
  } catch {
    // sem armazenamento (aba anônima): vale só até recarregar
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: v }));
}

let escolhidaAgora: Visao | null = null;

/** A visão escolhida (ou a padrão: blocos + mapa no computador, blocos no celular). */
function useVisao(): Visao {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(TELA_GRANDE);
      const mudou = (e: Event) => {
        if (e instanceof CustomEvent) escolhidaAgora = e.detail as Visao;
        avisar();
      };
      mq.addEventListener("change", avisar);
      window.addEventListener(EVENTO, mudou);
      window.addEventListener("storage", avisar);
      return () => {
        mq.removeEventListener("change", avisar);
        window.removeEventListener(EVENTO, mudou);
        window.removeEventListener("storage", avisar);
      };
    },
    () => escolhidaAgora ?? lerGuardada() ?? (window.matchMedia(TELA_GRANDE).matches ? "blocos-mapa" : "blocos"),
    () => "blocos",
  );
}

function SeletorVisao({ visao }: { visao: Visao }) {
  return (
    <div
      role="radiogroup"
      aria-label="Como ver"
      className="inline-flex shrink-0 rounded-pill border border-line-strong bg-surface-200 p-0.5"
    >
      {VISOES.map(({ valor, nome, icone: Icone }) => {
        const ativo = valor === visao;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            title={nome}
            onClick={() => guardar(valor)}
            className={`inline-flex min-h-9 min-w-8 items-center justify-center gap-1.5 rounded-pill px-2 sm:min-w-9 sm:px-2.5 text-label transition-colors ${
              ativo ? "bg-ink text-surface-100" : "text-ink-muted hover:bg-surface-300 hover:text-ink"
            }`}
          >
            <Icone aria-hidden className="size-4" />
            <span className={ativo ? "hidden xl:inline" : "sr-only"}>{nome}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A busca em grade, blocos, mapa ou blocos + mapa.
 * Cabeçalho: contagem, jeito de ver e origem; filtros da lista à direita (embaixo, no celular).
 * Os cartões leem `data-visao` (grupo `visao`) para ficarem compactos na grade.
 */
export function VisaoExplorar({
  titulo,
  subtitulo,
  filtrosLista,
  lista,
  pontos,
  origem = null,
  filtros,
}: {
  titulo: ReactNode;
  subtitulo: ReactNode;
  filtrosLista: ReactNode;
  lista: ReactNode;
  pontos: PontoMapa[];
  origem?: OrigemMapa;
  filtros: Filtros;
}) {
  const visao = useVisao();
  const comMapa = visao === "mapa" || visao === "blocos-mapa";
  const comLista = visao !== "mapa";

  return (
    <div>
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 lg:gap-x-6">
        <div className="col-start-1 row-start-1">{titulo}</div>
        <div className="col-start-2 row-start-1 lg:hidden">
          <SeletorVisao visao={visao} />
        </div>
        <div className="col-span-2 row-start-2 lg:col-span-1">{subtitulo}</div>
        {/* a faixa dos filtros tem 4px de folga (contorno do foco): -mb-1 alinha com a linha de baixo */}
        <div className="col-span-2 row-start-3 mt-2 flex items-center gap-3 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:-mb-1 lg:mt-0 lg:self-end">
          <div className="min-w-0 flex-1">{filtrosLista}</div>
          <div className="hidden shrink-0 lg:block">
            <SeletorVisao visao={visao} />
          </div>
        </div>
      </div>

      <div
        data-visao={visao}
        className={`group/visao ${visao === "blocos-mapa" ? "flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-6" : ""}`}
      >
        {comMapa && (
          <div className={visao === "blocos-mapa" ? "lg:order-2" : ""}>
            <div
              className={
                visao === "mapa"
                  ? "h-[calc(100dvh-14rem)] min-h-96"
                  : "h-80 lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)]"
              }
            >
              <MapaAnuncios pontos={pontos} filtros={filtros} origem={origem} />
            </div>
          </div>
        )}
        {comLista && <div className={visao === "blocos-mapa" ? "lg:order-1" : ""}>{lista}</div>}
      </div>
    </div>
  );
}
