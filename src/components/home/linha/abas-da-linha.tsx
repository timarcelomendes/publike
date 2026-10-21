"use client";

import { Briefcase, Layers, SlidersHorizontal, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { escolherAbaDaHome } from "@/lib/acoes/home";

export const EVENTO_FILTROS = "publike-filtros-linha";

type Aba = "tudo" | "vaga" | "servico";

const ABAS: { valor: Aba; nome: string; icone: LucideIcon }[] = [
  { valor: "tudo", nome: "Tudo", icone: Layers },
  { valor: "vaga", nome: "Vagas", icone: Briefcase },
  { valor: "servico", nome: "Serviços", icone: Wrench },
];

/**
 * As abas da linha do tempo, encaixadas na borda de baixo do topo: a escolhida tem a cor da
 * página e "se abre" para a linha. Cada uma mostra quantas novidades chegaram desde a última
 * visita. Ficam presas no alto ao rolar. À direita (no computador), Filtros; o painel dos filtros
 * abre logo embaixo (no celular, o botão fica dentro da busca do topo e avisa por evento).
 */
export function AbasDaLinha({
  aba,
  numeros,
  hrefs,
  mudados,
  abrirFiltros = false,
  textoDoRaio,
  filtros,
}: {
  aba: Aba;
  numeros: Record<Aba, string | null>;
  hrefs: Record<Aba, string>;
  mudados: number;
  /** já abre o painel dos filtros (vem de "Informe seu CEP") */
  abrirFiltros?: boolean;
  textoDoRaio: string;
  /** os filtros da lista (FiltrosLista) e o "Limpar filtros" */
  filtros: ReactNode;
}) {
  const [aberto, setAberto] = useState(mudados > 0 || abrirFiltros);
  const id = useId();
  useEffect(() => {
    const alternar = () => setAberto((a) => !a);
    window.addEventListener(EVENTO_FILTROS, alternar);
    return () => window.removeEventListener(EVENTO_FILTROS, alternar);
  }, []);

  return (
    <>
      <div className="sticky top-16 z-30 -mt-px rounded-b-[22px] bg-hero px-3 sm:rounded-b-[28px] sm:px-12">
        <nav aria-label="O que ver na linha do tempo" className="flex items-end gap-1 pt-2 sm:gap-1 sm:pt-0">
          {ABAS.map(({ valor, nome, icone: Icone }) => {
            const atual = valor === aba;
            const n = numeros[valor];
            return (
              <Link
                key={valor}
                href={hrefs[valor]}
                scroll={false}
                aria-current={atual ? "page" : undefined}
                onClick={() => {
                  escolherAbaDaHome(valor).catch(() => {});
                }}
                className={`aba-encaixada flex flex-1 flex-col items-center gap-0.5 rounded-t-[14px] px-1 pt-2.5 pb-2.5 text-[13px] leading-4 font-semibold whitespace-nowrap transition-colors [--folga:10px] sm:flex-initial sm:flex-row sm:gap-2.5 sm:rounded-t-[18px] sm:px-5 sm:pt-[15px] sm:pb-4 sm:text-[15px] sm:leading-5 sm:[--folga:16px] ${
                  atual
                    ? "font-bold text-ink"
                    : "bg-[rgb(251_247_239/0.06)] text-on-hero-muted hover:bg-[rgb(251_247_239/0.1)] hover:text-on-hero"
                }`}
              >
                <span className="relative">
                  <Icone aria-hidden className={`size-5 sm:size-[18px] ${atual ? "text-terra-text" : ""}`} />
                  {n && (
                    // no celular, o número fica no canto do ícone
                    <span
                      className={`absolute -top-2 left-3 min-w-[18px] rounded-pill px-1.5 text-center text-[11px] leading-[14px] font-bold tabular-nums sm:hidden ${
                        atual ? "bg-ink text-surface-100" : "bg-[rgb(251_247_239/0.16)] text-on-hero"
                      }`}
                    >
                      {n}
                    </span>
                  )}
                </span>
                {nome}
                {n && (
                  <span
                    className={`hidden min-w-[22px] rounded-pill px-[7px] py-0.5 text-center text-[12px] leading-4 font-bold tabular-nums sm:inline-block ${
                      atual ? "bg-ink text-surface-100" : "bg-[rgb(251_247_239/0.14)] text-on-hero"
                    }`}
                  >
                    {n}
                  </span>
                )}
                {n && <span className="sr-only"> ({n} novidades)</span>}
              </Link>
            );
          })}
          <button
            type="button"
            aria-expanded={aberto}
            aria-controls={id}
            onClick={() => setAberto((a) => !a)}
            className="mb-2 ml-auto hidden min-h-[38px] items-center gap-2 self-center rounded-pill border border-hero-line px-3.5 text-[14px] font-semibold text-on-hero hover:bg-[rgb(251_247_239/0.08)] sm:inline-flex"
          >
            <SlidersHorizontal aria-hidden className="size-4" />
            Filtros
            {mudados > 0 ? (
              <span className="rounded-pill bg-on-hero px-1.5 text-caption text-hero">
                {mudados}
                <span className="sr-only"> {mudados === 1 ? "mudado" : "mudados"}</span>
              </span>
            ) : (
              <span className="font-medium text-on-hero-muted">{textoDoRaio}</span>
            )}
          </button>
        </nav>
      </div>
      <div
        id={id}
        className={
          aberto
            ? "mt-4 flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-3 shadow-card sm:p-4"
            : "hidden"
        }
      >
        {filtros}
      </div>
    </>
  );
}

/** O botão Filtros dentro da busca do topo, no celular: abre o mesmo painel das abas. */
export function BotaoFiltrosDaLinha({ mudados }: { mudados: number }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENTO_FILTROS))}
      className="relative grid size-[38px] shrink-0 place-items-center rounded-[12px] bg-surface-300 text-ink"
    >
      <SlidersHorizontal aria-hidden className="size-[18px]" />
      <span className="sr-only">Filtros</span>
      {mudados > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] rounded-pill bg-ink px-1 text-center text-[11px] leading-[18px] font-bold text-surface-100">
          {mudados}
        </span>
      )}
    </button>
  );
}
