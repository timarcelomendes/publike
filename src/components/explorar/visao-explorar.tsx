"use client";

import { Columns2, LayoutGrid, List, Map as IconeMapa, Rows3, SlidersHorizontal, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { filtrosMudados, hrefFiltros, SEM_FILTROS, type Filtros } from "@/lib/filtros";
import { CHAVE_VISAO_BUSCA, VISOES_CELULAR, type Visao } from "@/lib/visao";
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
export type { Visao };

const VISOES: { valor: Visao; nome: string; icone: LucideIcon }[] = [
  { valor: "lista", nome: "Lista", icone: List },
  { valor: "grade", nome: "Grade", icone: LayoutGrid },
  { valor: "blocos", nome: "Blocos", icone: Rows3 },
  { valor: "mapa", nome: "Mapa", icone: IconeMapa },
  { valor: "blocos-mapa", nome: "Blocos + mapa", icone: Columns2 },
];

// No feed (Blocos + mapa), o mapa vai para uma coluna própria da página, de cima a baixo
// (ColunaDoMapa, posta pela moldura da home): a busca, os filtros e a lista ficam na coluna
// da esquerda, todos da mesma largura.
let colunaDoMapa: HTMLElement | null = null;
const avisosDaColuna = new Set<() => void>();
function registrarColuna(el: HTMLElement | null) {
  colunaDoMapa = el;
  // depois do commit: avisar (e o portal mudar) no meio dele quebra o React ("Unexpected Fiber popped")
  queueMicrotask(() => avisosDaColuna.forEach((avisar) => avisar()));
}

/** O lugar do mapa (e do que vai em cima dele) ao lado da coluna da lista, na moldura da home. */
export function ColunaDoMapa({ className }: { className?: string }) {
  return <div ref={registrarColuna} className={className} />;
}

function useColunaDoMapa() {
  return useSyncExternalStore(
    (avisar) => {
      avisosDaColuna.add(avisar);
      return () => {
        avisosDaColuna.delete(avisar);
      };
    },
    () => colunaDoMapa,
    () => null,
  );
}

const CHAVE = "publike_visao";
const EVENTO = "publike-visao";

function lerGuardada(chave: string): Visao | null {
  try {
    const v = window.localStorage.getItem(chave);
    return VISOES.some((x) => x.valor === v) ? (v as Visao) : null;
  } catch {
    return null;
  }
}

function guardar(v: Visao, chave: string) {
  try {
    window.localStorage.setItem(chave, v);
  } catch {
    // sem armazenamento (aba anônima): vale só até recarregar
  }
  // a da busca vai também num cookie: a próxima busca já vem do servidor no jeito escolhido
  if (chave === CHAVE_VISAO_BUSCA)
    document.cookie = `${chave}=${v}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { v, chave } }));
}

const escolhidaAgora = new Map<string, Visao>();

/**
 * A visão escolhida (ou a padrão: blocos + mapa no computador, blocos no celular). `padrao`:
 * outra para quem nunca escolheu (no feed de quem entrou, Blocos). `chave`: onde fica guardada.
 * `inicial`: a que o servidor já desenhou (a busca sabe a escolhida pelo cookie); sem ela, Blocos.
 */
export function useVisao(padrao?: Visao, chave = CHAVE, inicial: Visao = "blocos"): Visao {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(TELA_GRANDE);
      const mudou = (e: Event) => {
        if (e instanceof CustomEvent && e.detail?.chave) escolhidaAgora.set(e.detail.chave, e.detail.v as Visao);
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
      const v = escolhidaAgora.get(chave) ?? lerGuardada(chave) ?? padrao ?? (grande ? "blocos-mapa" : "blocos");
      return grande || VISOES_CELULAR.includes(v) ? v : "blocos";
    },
    () => inicial,
  );
}

/** 40 px de altura no total (34 + o respiro e a borda do grupo): a mesma dos seletores ao lado. */
function SeletorVisao({
  visao,
  chave,
  celular = false,
  nomeDoAtivo = false,
}: {
  visao: Visao;
  chave: string;
  celular?: boolean;
  /** o nome do jeito escolhido sempre à mostra (no painel dos filtros do feed) */
  nomeDoAtivo?: boolean;
}) {
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
            onClick={() => guardar(valor, chave)}
            className={`inline-flex min-h-[34px] min-w-8 items-center justify-center gap-1.5 rounded-pill px-2 sm:min-w-9 sm:px-2.5 text-label transition-colors ${
              ativo ? "bg-ink text-surface-100" : "text-ink-muted hover:bg-surface-300 hover:text-ink"
            }`}
          >
            <Icone aria-hidden className="size-4" />
            {/* no celular são só duas: os nomes cabem e explicam melhor que o ícone */}
            <span className={celular || (ativo && nomeDoAtivo) ? "" : ativo ? "hidden 2xl:inline" : "sr-only"}>
              {nome}
            </span>
          </button>
        );
      })}
    </div>
  );
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
  ordemFora = false,
  acimaDoMapa = null,
  busca = false,
  inicial,
  abas = null,
  ordem = null,
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
  /** a ordem fica nos atalhos de cima (o feed): não conta como filtro mudado */
  ordemFora?: boolean;
  /** com Blocos + mapa: um bloco em cima do mapa, na coluna dele (no feed, quem contrata perto) */
  acimaDoMapa?: ReactNode;
  /** a busca por palavra de quem entrou: o jeito de ver fica guardado à parte (começa na Lista) */
  busca?: boolean;
  /** o jeito que o servidor já desenhou (a busca: o escolhido, pelo cookie) */
  inicial?: Visao;
  /** na vitrine: Tudo, Vagas, Serviços e Talentos (no computador, na linha dos filtros) */
  abas?: ReactNode;
  /** na vitrine, no computador: a ordem na linha do título, junto do jeito de ver */
  ordem?: ReactNode;
}) {
  const chave = busca ? CHAVE_VISAO_BUSCA : CHAVE;
  const visao = useVisao(padrao, chave, inicial);
  const colunaFora = useColunaDoMapa();
  // o mapa na coluna própria da página (feed, com Blocos + mapa ou com a Lista, que é estreita e deixaria a
  // coluna vazia): aqui fica só a lista
  const mapaFora = (visao === "blocos-mapa" || visao === "lista") && compacto && colunaFora ? colunaFora : null;
  const comMapa = visao === "mapa" || visao === "blocos-mapa" || mapaFora !== null;
  const comLista = visao !== "mapa";
  const mudados = filtrosMudados(filtros, ordemFora);
  const [filtrosAbertos, setFiltrosAbertos] = useState(mudados > 0);
  const alternarFiltros = () => setFiltrosAbertos((a) => !a);
  // a parte do mapa na tela (com o mapa à mostra): a lista mostra só o que está nela
  const [area, setArea] = useState<Limites | null>(null);
  const idFiltros = useId();
  const botaoFiltros = (classes: string) => (
    <button
      type="button"
      aria-expanded={filtrosAbertos}
      aria-controls={idFiltros}
      onClick={alternarFiltros}
      className={`inline-flex shrink-0 items-center gap-1.5 border text-label transition-colors ${classes} ${
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
  );

  return (
    <div>
      {compacto ? (
        // numa coluna estreita (o feed), discreto: a contagem e de onde a lista conta, com o
        // "Filtros" ao lado; os filtros e o jeito de ver abrem num painel logo embaixo
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 [&_h2]:text-body-lg [&_h2]:font-semibold [&_h2]:text-ink">
              {titulo}
              {subtitulo}
            </div>
            {botaoFiltros("min-h-10 rounded-pill px-4 sm:min-h-8 sm:px-3 sm:text-body-sm sm:font-semibold")}
          </div>
          <div
            id={idFiltros}
            className={
              filtrosAbertos
                ? "flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-3 shadow-card sm:p-4"
                : "hidden"
            }
          >
            <div className="min-w-0">{filtrosLista}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
              <span className="text-label text-ink-muted">Ver como</span>
              <div className="shrink-0 lg:hidden">
                <SeletorVisao visao={visao} chave={chave} celular />
              </div>
              <div className="hidden shrink-0 lg:block">
                <SeletorVisao visao={visao} chave={chave} nomeDoAtivo />
              </div>
              {mudados > 0 && (
                <Link
                  href={hrefFiltros(filtros, SEM_FILTROS)}
                  scroll={false}
                  className="ml-auto inline-flex min-h-9 items-center text-label text-ink underline underline-offset-2 hover:text-terra-text"
                >
                  Limpar filtros
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Celular: as abas; o título e o jeito de ver; a origem e o botão "Filtros"; os filtros, se
          abertos. Computador: as abas e os filtros numa linha só (sem espaço, os filtros rolam de lado,
          com as setas; nada desce para outra linha); embaixo, o título e a origem, com o jeito de ver à
          direita. Uma grade só, sem repetir nada: cada parte muda de lugar no computador. */}
          <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-4 lg:gap-y-1">
            {abas && <div className="col-span-2 row-start-1 mb-4 min-w-0 lg:col-span-1 lg:mb-3">{abas}</div>}
            <div className="col-start-1 row-start-2 lg:col-span-2">{titulo}</div>
            <div className="col-start-2 row-start-2 lg:hidden">
              <SeletorVisao visao={visao} chave={chave} celular />
            </div>
            <div className="col-span-2 row-start-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">{subtitulo}</div>
              {botaoFiltros("min-h-9 rounded-md px-3 lg:hidden")}
            </div>
            <div className="hidden lg:col-start-3 lg:row-span-2 lg:row-start-2 lg:flex lg:items-center lg:gap-3">
              {ordem}
              <SeletorVisao visao={visao} chave={chave} />
            </div>
            <div
              id={idFiltros}
              className={`col-span-2 row-start-4 mt-2 min-w-0 lg:col-start-2 lg:row-start-1 lg:mt-0 lg:mb-3 lg:block ${
                filtrosAbertos ? "block" : "hidden"
              }`}
            >
              {filtrosLista}
            </div>
          </div>
        </>
      )}

      <div
        data-visao={visao}
        className={`group/visao ${visao === "blocos-mapa" && !mapaFora ? "flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-6" : ""}`}
      >
        {/* Blocos + mapa no computador: a coluna do mapa estica até a altura dos cartões, e o mapa
            ocupa essa altura (no máximo a da tela, preso no topo ao rolar). Assim a borda de baixo
            do mapa bate com a dos cartões quando a lista é curta. */}
        {mapaFora &&
          createPortal(
            <>
              {acimaDoMapa}
              <div className="sticky top-20 h-[calc(100dvh-7rem)] min-h-80">
                <MapaAnuncios pontos={pontos} filtros={filtros} origem={origem} aoMudarArea={setArea} />
              </div>
            </>,
            mapaFora,
          )}
        {comMapa && !mapaFora && (
          <div className={visao !== "blocos-mapa" ? "" : acimaDoMapa ? "flex flex-col gap-4 lg:order-2" : "lg:order-2"}>
            {/* no feed, com Blocos + mapa: "Contratando perto" fica em cima do mapa, na largura dele */}
            {visao === "blocos-mapa" && acimaDoMapa}
            <div
              className={
                visao === "mapa"
                  ? "h-[calc(100dvh-14rem)] min-h-96"
                  : acimaDoMapa
                    ? "h-80 lg:sticky lg:top-20 lg:h-auto lg:max-h-[calc(100dvh-7rem)] lg:min-h-80 lg:flex-1"
                    : "h-80 lg:sticky lg:top-20 lg:h-full lg:max-h-[calc(100dvh-7rem)] lg:min-h-80"
              }
            >
              <MapaAnuncios pontos={pontos} filtros={filtros} origem={origem} aoMudarArea={setArea} />
            </div>
          </div>
        )}
        {comLista && (
          <div className={visao === "blocos-mapa" && !mapaFora ? "lg:order-1" : ""}>
            <AreaDoMapa value={comMapa ? area : null}>{lista}</AreaDoMapa>
          </div>
        )}
      </div>
    </div>
  );
}
