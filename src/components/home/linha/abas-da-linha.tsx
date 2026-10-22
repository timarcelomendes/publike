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
 * novidades chegaram desde a última visita. Ficam presas no alto ao rolar. À direita, Filtros (no
 * celular, o ícone ao lado da busca); o painel dos filtros abre logo embaixo, numa linha só que rola de lado.
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

  // numa coluna estreita (no computador, a do meio da home tem 544px), os números das abas podem não caber
  // junto dos ícones: com muitos, as abas ficam só com o nome (a conta, em px, é por cima)
  const larguraDosNumeros =
    Object.values(numeros).reduce((soma, n) => soma + (n ? 8 + Math.max(22, 14 + 8 * n.length) : 0), 0) +
    (mudados > 0 ? 26 : 0);
  const semIcone = larguraDosNumeros > 92;

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
        // numa coluna estreita, só "Filtros" (o raio fica para o leitor de tela): não cabe junto das abas
        <span className="font-medium text-ink-muted @max-[720px]:sr-only">{textoDoRaio}</span>
      )}
    </button>
  );

  return (
    <>
      <div className="sticky top-16 z-30 -mx-4 bg-surface-100 px-4 sm:mx-0 sm:px-0">
        {/* @container: a largura da coluna decide o que cabe (sem espaço, saem o raio do Filtros e, com muitos
            números, os ícones das abas; se ainda faltar, as abas rolam de lado: o Filtros nunca sai da coluna) */}
        <nav aria-label="O que ver na linha do tempo" className="@container flex items-end border-b border-line">
          <div className="sem-barra -mb-px flex min-w-0 flex-1 items-end overflow-x-auto pb-px sm:gap-3 sm:@min-[600px]:gap-4 sm:@min-[760px]:gap-6">
            {/* o contorno do foco fica por dentro de cada aba: a faixa rola de lado e cortaria o de fora */}
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
                  className={`relative -mb-px flex flex-1 flex-col items-center gap-0.5 border-b-[3px] px-1 pt-2.5 pb-2 text-[13px] leading-4 font-semibold whitespace-nowrap transition-colors sm:flex-initial sm:flex-row sm:gap-2 sm:px-0.5 sm:pt-3 sm:pb-3 sm:text-[15px] sm:leading-5 focus-visible:-outline-offset-2 ${
                    atual ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  <span className={`relative ${semIcone ? "sm:@max-[600px]:hidden" : ""}`}>
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
                  {n && <span className="sr-only"> ({n === "1" ? "1 novidade" : `${n} novidades`})</span>}
                </Link>
              );
            })}
          </div>
          {botaoFiltros("mb-2 ml-3 hidden self-center sm:inline-flex")}
        </nav>
      </div>
      {/* no celular, o Filtros é o ícone ao lado da busca (BuscaERecado), que avisa por EVENTO_FILTROS */}
      <div
        id={id}
        className={aberto ? "mt-3 rounded-lg border border-line bg-surface-200 p-3 shadow-card sm:p-4" : "hidden"}
      >
        {filtros}
      </div>
    </>
  );
}
