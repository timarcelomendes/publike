"use client";

import { Columns2, LayoutGrid, List, Map as IconeMapa, Rows3, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { RAIO_PADRAO, type Filtros } from "@/lib/filtros";
import { MapaAnuncios, type OrigemMapa, type PontoMapa } from "../mapa/mapa-anuncios";
import { AreaDoMapa, type Limites } from "./area-do-mapa";

const TELA_GRANDE = "(min-width: 1024px)";

/**
 * Jeitos de ver a busca:
 *   lista ........ uma linha por anúncio: título, lugar, valor e curtir
 *   grade ........ cartões pequenos, muitos por linha (só título, lugar e valor)
 *   blocos ....... os cartões completos, sem mapa
 *   mapa ......... só o mapa, grande
 *   blocos-mapa .. cartões e mapa lado a lado (só no computador)
 * A escolha fica guardada neste navegador. No celular só há Blocos e Mapa: lista e grade
 * apertam demais os cartões numa tela pequena, e o mapa em cima dos blocos empurra a lista
 * para baixo. Quem escolheu outra no computador vê Blocos no celular.
 */
export type Visao = "lista" | "grade" | "blocos" | "mapa" | "blocos-mapa";

const VISOES: { valor: Visao; nome: string; icone: LucideIcon }[] = [
  { valor: "lista", nome: "Lista", icone: List },
  { valor: "grade", nome: "Grade", icone: LayoutGrid },
  { valor: "blocos", nome: "Blocos", icone: Rows3 },
  { valor: "mapa", nome: "Mapa", icone: IconeMapa },
  { valor: "blocos-mapa", nome: "Blocos + mapa", icone: Columns2 },
];

/** As visões do celular (tela menor que a do computador). */
const VISOES_CELULAR: Visao[] = ["blocos", "mapa"];

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

/**
 * A visão escolhida (ou a padrão: blocos + mapa no computador, blocos no celular). `padrao`:
 * outra para quem nunca escolheu (no feed de quem entrou, Blocos).
 */
export function useVisao(padrao?: Visao): Visao {
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
    () => {
      const grande = window.matchMedia(TELA_GRANDE).matches;
      const v = escolhidaAgora ?? lerGuardada() ?? padrao ?? (grande ? "blocos-mapa" : "blocos");
      return grande || VISOES_CELULAR.includes(v) ? v : "blocos";
    },
    () => "blocos",
  );
}

function SeletorVisao({ visao, celular = false }: { visao: Visao; celular?: boolean }) {
  return (
    <div
      role="radiogroup"
      aria-label="Como ver"
      className="inline-flex shrink-0 rounded-pill border border-line-strong bg-surface-200 p-0.5"
    >
      {VISOES.filter((v) => !celular || VISOES_CELULAR.includes(v.valor)).map(({ valor, nome, icone: Icone }) => {
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
            {/* no celular são só duas: os nomes cabem e explicam melhor que o ícone */}
            <span className={celular ? "" : ativo ? "hidden 2xl:inline" : "sr-only"}>{nome}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Quantos filtros da lista fogem do padrão (contratação, horário, área, distância ou tempo, ordem, só os meus). */
function filtrosMudados(f: Filtros) {
  return [f.regime, f.turno, f.categoria, f.tempo || f.raio !== RAIO_PADRAO, f.ordem !== "perto", f.meus].filter(
    Boolean,
  ).length;
}

/**
 * A busca em grade, blocos, mapa ou blocos + mapa.
 * Cabeçalho: contagem, jeito de ver e origem; filtros da lista à direita. No celular, os
 * filtros ficam atrás do botão "Filtros" (abertos quando algum foge do padrão): uma linha
 * a menos antes dos anúncios.
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
  padrao,
  compacto = false,
}: {
  titulo: ReactNode;
  subtitulo: ReactNode;
  filtrosLista: ReactNode;
  lista: ReactNode;
  pontos: PontoMapa[];
  origem?: OrigemMapa;
  filtros: Filtros;
  /** o jeito de ver de quem nunca escolheu */
  padrao?: Visao;
  /** numa coluna estreita (o feed): os filtros ficam atrás do botão também no computador */
  compacto?: boolean;
}) {
  const visao = useVisao(padrao);
  const comMapa = visao === "mapa" || visao === "blocos-mapa";
  const comLista = visao !== "mapa";
  const mudados = filtrosMudados(filtros);
  const [filtrosAbertos, setFiltrosAbertos] = useState(mudados > 0);
  // a parte do mapa na tela (com o mapa à mostra): a lista mostra só o que está nela
  const [area, setArea] = useState<Limites | null>(null);
  const idFiltros = useId();

  return (
    <div>
      {compacto ? (
        // numa coluna estreita (o feed), discreto: o título e a origem numa linha, com "Filtros";
        // os filtros e o jeito de ver (lista, grade, mapa) abrem embaixo
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 [&_h2]:text-label [&_h2]:text-ink">
              {titulo}
              {subtitulo}
            </div>
            <button
              type="button"
              aria-expanded={filtrosAbertos}
              aria-controls={idFiltros}
              onClick={() => setFiltrosAbertos((a) => !a)}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-label transition-colors ${
                filtrosAbertos
                  ? "border-ink bg-surface-300 text-ink"
                  : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
              }`}
            >
              <SlidersHorizontal aria-hidden className="size-4" />
              Filtros
              {mudados > 0 && (
                <span className="rounded-pill bg-ink px-1.5 text-caption text-surface-100">
                  {mudados}
                  <span className="sr-only"> {mudados === 1 ? "mudado" : "mudados"}</span>
                </span>
              )}
            </button>
          </div>
          <div id={idFiltros} className={filtrosAbertos ? "flex flex-wrap items-center gap-3" : "hidden"}>
            <div className="shrink-0 lg:hidden">
              <SeletorVisao visao={visao} celular />
            </div>
            <div className="hidden shrink-0 lg:block">
              <SeletorVisao visao={visao} />
            </div>
            <div className="w-full min-w-0">{filtrosLista}</div>
          </div>
        </div>
      ) : (
        <>
          {/* Celular: título e jeito de ver; a origem e o botão "Filtros"; os filtros, se abertos.
          Computador: título à esquerda e, na mesma linha, os filtros e o jeito de ver; sem espaço
          para os dois, os filtros descem para a linha de baixo (nada fica cortado). A origem vem
          por último, na largura toda. */}
          <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 lg:flex lg:flex-wrap lg:gap-x-4 lg:gap-y-3">
            <div className="col-start-1 row-start-1 lg:shrink-0">{titulo}</div>
            <div className="col-start-2 row-start-1 lg:hidden">
              <SeletorVisao visao={visao} celular />
            </div>
            <div className="col-span-2 row-start-2 flex items-center justify-between gap-3 lg:order-last lg:-mt-1 lg:w-full">
              <div className="min-w-0 flex-1">{subtitulo}</div>
              <button
                type="button"
                aria-expanded={filtrosAbertos}
                aria-controls={idFiltros}
                onClick={() => setFiltrosAbertos((a) => !a)}
                className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-label transition-colors lg:hidden ${
                  filtrosAbertos
                    ? "border-ink bg-surface-300 text-ink"
                    : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
                }`}
              >
                <SlidersHorizontal aria-hidden className="size-4" />
                Filtros
                {mudados > 0 && (
                  <span className="rounded-pill bg-ink px-1.5 text-caption text-surface-100">
                    {mudados}
                    <span className="sr-only"> {mudados === 1 ? "mudado" : "mudados"}</span>
                  </span>
                )}
              </button>
            </div>
            <div
              id={idFiltros}
              className={`col-span-2 row-start-3 mt-2 items-center gap-3 lg:mt-0 lg:ml-auto lg:flex lg:justify-end ${
                filtrosAbertos ? "flex" : "hidden"
              }`}
            >
              <div className="min-w-0 flex-1 lg:flex-initial">{filtrosLista}</div>
              <div className="hidden shrink-0 lg:block">
                <SeletorVisao visao={visao} />
              </div>
            </div>
          </div>
        </>
      )}

      <div
        data-visao={visao}
        className={`group/visao ${visao === "blocos-mapa" ? "flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-6" : ""}`}
      >
        {/* Blocos + mapa no computador: a coluna do mapa estica até a altura dos cartões, e o mapa
            ocupa essa altura (no máximo a da tela, preso no topo ao rolar). Assim a borda de baixo
            do mapa bate com a dos cartões quando a lista é curta. */}
        {comMapa && (
          <div className={visao === "blocos-mapa" ? "lg:order-2" : ""}>
            <div
              className={
                visao === "mapa"
                  ? "h-[calc(100dvh-14rem)] min-h-96"
                  : "h-80 lg:sticky lg:top-20 lg:h-full lg:max-h-[calc(100dvh-7rem)] lg:min-h-80"
              }
            >
              <MapaAnuncios pontos={pontos} filtros={filtros} origem={origem} aoMudarArea={setArea} />
            </div>
          </div>
        )}
        {comLista && (
          <div className={visao === "blocos-mapa" ? "lg:order-1" : ""}>
            <AreaDoMapa value={comMapa ? area : null}>{lista}</AreaDoMapa>
          </div>
        )}
      </div>
    </div>
  );
}
