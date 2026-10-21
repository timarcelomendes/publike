"use client";

import { Briefcase, Layers, MessageSquareText, SlidersHorizontal, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { escolherAbaDaHome } from "@/lib/acoes/home";

export const EVENTO_FILTROS = "publike-filtros-linha";

type Aba = "tudo" | "vaga" | "servico" | "recado";

const ABAS: { valor: Aba; nome: string; icone: LucideIcon }[] = [
  { valor: "tudo", nome: "Tudo", icone: Layers },
  { valor: "vaga", nome: "Vagas", icone: Briefcase },
  { valor: "servico", nome: "Serviços", icone: Wrench },
  { valor: "recado", nome: "Recados", icone: MessageSquareText },
];

/**
 * As abas da linha do tempo, sublinhadas como as outras abas do site: cada uma mostra quantas
 * novidades chegaram desde a última visita. Ficam presas no alto ao rolar. À direita (no celular,
 * embaixo), Filtros; o painel dos filtros abre logo embaixo, numa linha só que rola de lado.
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

  const botaoFiltros = (classe: string) => (
    <button
      type="button"
      aria-expanded={aberto}
      aria-controls={id}
      onClick={() => setAberto((a) => !a)}
      className={`min-h-[38px] shrink-0 items-center gap-1.5 rounded-pill whitespace-nowrap border border-line-strong bg-surface-200 px-3 text-label text-ink hover:bg-surface-300 ${classe}`}
    >
      <SlidersHorizontal aria-hidden className="size-4" />
      Filtros
      {mudados > 0 ? (
        <span className="rounded-pill bg-ink px-1.5 text-caption text-surface-100">
          {mudados}
          <span className="sr-only"> {mudados === 1 ? "mudado" : "mudados"}</span>
        </span>
      ) : (
        <span className="font-medium text-ink-muted">{textoDoRaio}</span>
      )}
    </button>
  );

  return (
    <>
      <div className="sticky top-16 z-30 -mx-4 bg-surface-100 px-4 sm:mx-0 sm:px-0">
        <nav aria-label="O que ver na linha do tempo" className="flex items-end border-b border-line sm:gap-6 lg:gap-4 2xl:gap-6">
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
                className={`relative -mb-px flex flex-1 flex-col items-center gap-0.5 border-b-[3px] px-1 pt-2.5 pb-2 text-[13px] leading-4 font-semibold whitespace-nowrap transition-colors sm:flex-initial sm:flex-row sm:gap-2 sm:px-0.5 sm:pt-3 sm:pb-3 sm:text-[15px] sm:leading-5 ${
                  atual ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                <span className="relative">
                  <Icone aria-hidden className="size-5 text-terra-text sm:size-[18px]" />
                  {n && (
                    // no celular, o número fica no canto do ícone
                    <span className="absolute -top-2 left-3.5 min-w-[18px] rounded-pill bg-terra-soft px-1.5 text-center text-[11px] leading-4 font-bold text-terra-text tabular-nums sm:hidden">
                      {n}
                    </span>
                  )}
                </span>
                {nome}
                {n && (
                  <span className="hidden min-w-[22px] rounded-pill bg-terra-soft px-[7px] py-0.5 text-center text-[12px] leading-4 font-bold text-terra-text tabular-nums sm:inline-block">
                    {n}
                  </span>
                )}
                {n && <span className="sr-only"> ({n} novidades)</span>}
              </Link>
            );
          })}
          {botaoFiltros("mb-2 ml-auto hidden self-center sm:inline-flex")}
        </nav>
      </div>
      {/* no celular, o Filtros fica embaixo das abas, à direita */}
      <div className="mt-2.5 flex justify-end sm:hidden">{botaoFiltros("inline-flex")}</div>
      <div
        id={id}
        className={aberto ? "mt-3 rounded-lg border border-line bg-surface-200 p-3 shadow-card sm:p-4" : "hidden"}
      >
        {filtros}
      </div>
    </>
  );
}
