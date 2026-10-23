"use client";

import { ChevronLeft, ChevronRight, LocateFixed, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { CATEGORIAS, REGIMES, type Categoria } from "@/lib/constantes";
import { nomeDoTempo, TEMPOS } from "@/lib/deslocamento";
import { hrefFiltros, RAIOS, TURNOS, type Filtros, type Ordem, type Turno } from "@/lib/filtros";
import { lembrarBusca } from "@/lib/ultima-busca";
import type { Local } from "@/lib/regioes";
import type { Regime } from "@/lib/tipos";
import { Seletor } from "../ui/campo";
import { ABA_TALENTOS, ABAS_ANUNCIOS, classesAba, classesGrupoAbas, MioloAba } from "./abas";
import { BotaoOndeMora, botaoLugar, PainelOndeMora } from "./onde-mora";
import { noPublike, ONDE_FUNCIONA } from "@/lib/pracas";

// Jeitos de olhar, cada um com a sua cara:
//   O QUE (tipo) ...... abas sublinhadas, em cima da busca (abas.tsx; Talentos é outra página)
//   ONDE (local) ...... botões de contorno com ícone de lugar
//   ÁREA e o resto .... seletores nos filtros da lista (FiltrosLista)

// Os filtros da lista têm a cara de botão secundário pequeno.
// field-sizing: a caixa mede o que está escolhido (não a opção mais comprida da lista), para os
// filtros caberem na linha do título no computador
const seletor =
  "min-h-10 field-sizing-content rounded-md border border-line-strong bg-surface-200 pl-3.5 text-label text-ink transition-colors hover:bg-surface-300";

/** Muda a URL com os filtros novos, sem pular para o topo. */
export function useIrPara(filtros: Filtros) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  /** `substituir`: troca a URL sem criar um passo a mais no "voltar". */
  const ir = (mudancas: Partial<Filtros>, substituir = false) =>
    iniciar(() => {
      const href = hrefFiltros(filtros, mudancas);
      if (substituir) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  return [ir, pendente] as const;
}

export const AVISOS_GPS = {
  sem: "Seu navegador não informa a localização.",
  fora: `Você parece estar fora de ${ONDE_FUNCIONA}. Por enquanto, o Publike funciona só lá.`,
  negado: "Não conseguimos sua localização. Confira a permissão do navegador.",
} as const;

/** Pede a posição ao navegador. Arredonda (~100 m): bom para o mapa e a distância, sem a posição exata na URL. */
export function pedirPosicao(
  achou: (ponto: { lat: number; lng: number }) => void,
  falhou: (motivo: keyof typeof AVISOS_GPS) => void,
) {
  if (!("geolocation" in navigator)) return falhou("sem");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const { latitude: lat, longitude: lng } = coords;
      if (!noPublike({ lat, lng })) return falhou("fora");
      achou({ lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 });
    },
    () => falhou("negado"),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
}

function Carregando() {
  return (
    <div aria-hidden className="absolute -top-3 left-0 h-0.5 w-full overflow-hidden rounded-pill bg-surface-300">
      <div className="h-full w-1/3 animate-pulse rounded-pill bg-terra" />
    </div>
  );
}

/**
 * Faixa que rola de lado (categorias, filtros no celular). A borda esmaece onde
 * ainda tem mais e, com mouse, aparecem setas. Abre já mostrando a opção escolhida.
 */
function FaixaRolavel({
  rotulo,
  ocupado,
  className = "",
  children,
}: {
  rotulo: string;
  ocupado?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const faixa = useRef<HTMLDivElement>(null);
  const [mais, setMais] = useState({ antes: false, depois: false });

  useEffect(() => {
    const el = faixa.current;
    if (!el) return;
    const escolhida = Array.from(el.querySelectorAll<HTMLElement>('[aria-pressed="true"]')).at(-1);
    if (escolhida && escolhida.offsetLeft + escolhida.offsetWidth > el.clientWidth) {
      el.scrollLeft = escolhida.offsetLeft - el.clientWidth / 3;
    }
    const medir = () => {
      const antes = el.scrollLeft > 2;
      const depois = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setMais((m) => (m.antes === antes && m.depois === depois ? m : { antes, depois }));
    };
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const tamanho = new ResizeObserver(medir);
    tamanho.observe(el);
    return () => {
      el.removeEventListener("scroll", medir);
      tamanho.disconnect();
    };
  }, []);

  function rolar(sentido: -1 | 1) {
    const el = faixa.current;
    if (!el) return;
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: sentido * el.clientWidth * 0.7, behavior: suave ? "smooth" : "auto" });
  }

  const borda = (tem: boolean) => (tem ? "4rem" : "0px");
  const mascara = `linear-gradient(to right, transparent, #000 ${borda(mais.antes)}, #000 calc(100% - ${borda(mais.depois)}), transparent)`;
  // as setas só ajudam quem usa mouse; no toque e no teclado a faixa já rola
  const seta =
    "absolute top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-pill border border-line-strong bg-surface-200 text-ink shadow-card transition-colors hover:bg-surface-300 pointer-fine:flex";

  return (
    <div className="relative">
      <div
        ref={faixa}
        role="group"
        aria-label={rotulo}
        aria-busy={ocupado}
        style={{ maskImage: mascara }}
        className={`sem-barra relative -mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:-mx-6 sm:px-6 ${className}`}
      >
        {children}
      </div>
      {mais.antes && (
        <button type="button" tabIndex={-1} aria-hidden onClick={() => rolar(-1)} className={`${seta} -left-2`}>
          <ChevronLeft className="size-4" />
        </button>
      )}
      {mais.depois && (
        <button type="button" tabIndex={-1} aria-hidden onClick={() => rolar(1)} className={`${seta} -right-2`}>
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Os filtros em linhas que quebram (o feed): tudo à vista, nada cortado nas pontas. */
function FiltrosEmLinhas({
  rotulo,
  ocupado,
  children,
}: {
  rotulo: string;
  ocupado?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={rotulo} aria-busy={ocupado} className="flex flex-wrap items-center gap-2">
      {children}
    </div>
  );
}

function BotaoPerto({ ativo, onClick, curto = false }: { ativo: boolean; onClick: () => void; curto?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={curto ? "Perto de mim" : undefined}
      className={`${botaoLugar(ativo)} shrink-0`}
    >
      <LocateFixed aria-hidden className={`size-4 shrink-0 ${ativo ? "text-terra-text" : ""}`} />
      {/* curto (o feed, numa coluna estreita): só o ícone, para o lugar e os atalhos caberem numa linha;
          o nome volta no celular (o lugar tem a linha só para ele) e numa coluna larga */}
      <span className={curto ? "sr-only max-sm:not-sr-only @2xl:not-sr-only" : undefined}>Perto de mim</span>
      {ativo && <X aria-hidden className="-mr-1 size-3.5 shrink-0" />}
    </button>
  );
}

/**
 * A busca do topo da página: tipo, texto, onde mora e perto de mim. Só isso (a área fica nos filtros):
 * as perguntas da primeira visita ficam em cima da lista de anúncios (PerguntasNaLista).
 */
export function BarraBusca({
  filtros,
  local,
  abrirOndeMora = false,
  className = "mt-3 sm:mt-5",
  faixa = false,
  soLugar = false,
  extra = null,
  umaLinha = false,
  cidade,
  contrata = false,
}: {
  filtros: Filtros;
  local: Local | null;
  /** a cidade de quem vê (`cidadeDaVisita`): sem lugar escolhido, o "Onde você mora?" abre nela */
  cidade?: string;
  /** vem de "Informe seu CEP" (?casa=1): já abre o "Onde você mora?" */
  abrirOndeMora?: boolean;
  /** o espaço em cima (na faixa da vitrine, nenhum) */
  className?: string;
  /** na faixa do topo da vitrine: só a busca e o lugar (as abas ficam em cima da lista) */
  faixa?: boolean;
  /** no feed de quem entrou (a busca fica no topo da página): só Onde você mora e Perto de mim */
  soLugar?: boolean;
  /** com soLugar: o que vem na mesma linha dos botões de lugar (no feed, os atalhos e o "Filtros") */
  extra?: ReactNode;
  /** com soLugar: o lugar e o extra numa linha só, sem quebrar (o extra rola de lado) */
  umaLinha?: boolean;
  /** quem contrata: as abas só com o nome */
  contrata?: boolean;
}) {
  const [ir, pendente] = useIrPara(filtros);
  const [ondeMora, setOndeMora] = useState(abrirOndeMora);
  // para o "Voltar para a busca" da página do anúncio
  const enderecoDaBusca = hrefFiltros(filtros);
  useEffect(() => {
    lembrarBusca(window.location.pathname + window.location.search);
  }, [enderecoDaBusca]);
  const painel = useId();
  const [avisoGps, setAvisoGps] = useState<string | null>(null);
  const [texto, setTexto] = useState(filtros.q);

  function buscar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    ir({ q: texto.trim() });
  }

  const perto = filtros.origem === "gps";

  function alternarPerto() {
    // tocar de novo desliga: volta a contar do centro (ou da casa)
    if (perto) return ir({ origem: "centro" });
    setAvisoGps(null);
    pedirPosicao(
      ({ lat, lng }) => ir({ lat, lng, origem: "gps", ordem: "perto" }),
      (motivo) => setAvisoGps(AVISOS_GPS[motivo]),
    );
  }

  // "Onde você mora?" e "Perto de mim": no computador, na linha das abas; no celular, no
  // numa faixa logo abaixo da busca
  const botoesDeLugar = (classes: string) => (
    <div
      role="group"
      aria-label="Onde"
      // na vitrine: com a pergunta "Onde você mora?" em cima da lista, os botões esperam (um convite só)
      className={`items-center gap-2 ${faixa ? "[body:has([data-pergunta-onde-mora])_&]:hidden" : ""} ${classes}`}
    >
      <BotaoOndeMora local={local} aberto={ondeMora} onClick={() => setOndeMora((a) => !a)} controla={painel} />
      <BotaoPerto ativo={perto} onClick={alternarPerto} curto={soLugar} />
    </div>
  );

  return (
    // no feed (soLugar), a largura da coluna decide o "Perto de mim" curto (consulta de contêiner)
    <div className={`relative flex flex-col gap-3 ${soLugar ? "@container" : ""} ${className}`}>
      {pendente && <Carregando />}

      {/* No celular: abas, busca e uma faixa com o lugar (e o painel do bairro).
          No computador: abas e lugar na mesma linha, o painel do bairro e a busca. */}
      <div
        className={`flex flex-col gap-3 sm:flex-row ${
          soLugar
            ? // no feed, o lugar e os filtros numa linha só (os filtros rolam de lado); com o painel
              // do bairro aberto, ele desce para a linha de baixo
              `sm:items-center sm:gap-x-2 ${umaLinha && !ondeMora ? "sm:flex-nowrap" : "sm:flex-wrap"}`
            : "sm:flex-wrap sm:items-end sm:gap-x-4"
        }`}
      >
        {!faixa && !soLugar && (
          <div role="group" aria-label="O que você procura" className={`order-1 ${classesGrupoAbas}`}>
            {ABAS_ANUNCIOS.map((t) => {
              const ativo = filtros.tipo === t.valor;
              return (
                <button
                  key={t.nome}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() =>
                    ir({ tipo: t.valor, tudo: t.valor === null, regime: t.valor === "servico" ? null : filtros.regime })
                  }
                  className={classesAba(ativo)}
                >
                  <MioloAba aba={t} ativo={ativo} semAjuda={contrata} />
                </button>
              );
            })}
            {/* gente que procura trabalho: outra página (não são anúncios) */}
            <Link href={ABA_TALENTOS.href} className={classesAba(false)}>
              <MioloAba aba={ABA_TALENTOS} ativo={false} semAjuda={contrata} />
            </Link>
          </div>
        )}

        {botoesDeLugar(
          // no feed, redondos como os atalhos da mesma linha; numa coluna estreita, o nome do
          // bairro corta antes (o nome inteiro fica no title do botão)
          `min-w-0 ${
            soLugar
              ? `flex flex-wrap sm:order-2 ${umaLinha ? "sm:shrink-0 sm:flex-nowrap" : ""} [&>button]:rounded-pill sm:[&>button]:min-h-8 sm:[&>button]:px-2.5 sm:[&>button]:text-body-sm sm:[&>button]:font-semibold sm:[&>button:first-child]:max-w-36 @2xl:[&>button:first-child]:max-w-64`
              : `hidden sm:flex ${faixa ? "sm:order-5" : "sm:order-2 sm:mb-1.5"}`
          }`,
        )}

        {/* no feed: os atalhos na linha do lugar (no celular, na linha de baixo, depois do painel
            do bairro, que abre logo embaixo do botão); quando não cabem, descem inteiros */}
        {soLugar && extra && <div className={`order-6 min-w-0 sm:order-2 ${umaLinha ? "sm:flex-1" : ""}`}>{extra}</div>}

        {ondeMora && (
          <div className="order-4 sm:order-3 sm:basis-full">
            <PainelOndeMora
              id={painel}
              local={local}
              cidadePadrao={cidade}
              fechar={() => setOndeMora(false)}
              // quem acabou de dizer onde mora quer ver a partir de casa, não de onde está agora
              aoSalvar={() => {
                if (filtros.origem !== "centro") ir({ origem: "centro" }, true);
              }}
            />
          </div>
        )}

        <form
          role="search"
          onSubmit={buscar}
          className={`order-2 ${soLugar ? "hidden" : "flex"} items-center gap-1 rounded-lg border border-line-strong bg-surface-200 p-1 pl-3 shadow-card has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus sm:order-4 sm:basis-full sm:p-1.5 sm:pl-3`}
        >
          <label htmlFor="busca" className="sr-only">
            O que você procura?
          </label>
          <Search aria-hidden className="size-5 shrink-0 text-ink-muted" />
          <input
            id="busca"
            type="search"
            enterKeyHint="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={
              filtros.tipo === "vaga"
                ? "Garçom, vendedor, auxiliar…"
                : filtros.tipo === "servico"
                  ? "Diarista, pedreiro, eletricista…"
                  : "Diarista, garçom, pedreiro…"
            }
            maxLength={80}
            className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-body text-ink outline-none placeholder:text-ink-muted/80 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {texto && (
            <button
              type="button"
              onClick={() => {
                setTexto("");
                ir({ q: "" });
              }}
              className="flex size-9 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300"
            >
              <X aria-hidden className="size-4" />
              <span className="sr-only">Limpar busca</span>
            </button>
          )}
          <button
            type="submit"
            disabled={pendente}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-ink px-5 text-label text-surface-100 transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Buscar
          </button>
        </form>

        {/* celular: os botões de lugar numa faixa (no computador, ficam ao lado da busca) */}
        <div
          className={`order-3 min-w-0 sm:hidden ${soLugar ? "hidden" : ""} ${faixa ? "[body:has([data-pergunta-onde-mora])_&]:hidden" : ""}`}
        >
          <FaixaRolavel rotulo="Lugar">{botoesDeLugar("flex shrink-0")}</FaixaRolavel>
        </div>

        {avisoGps && (
          <p role="status" className="order-5 text-body-sm text-terra-text sm:order-6 sm:basis-full">
            {avisoGps}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Contratação, distância e ordem (e "Só os meus", para quem publica): ficam junto da
 * contagem de resultados. No celular, aparecem ao tocar em "Filtros" (VisaoExplorar).
 */
export function FiltrosLista({
  filtros,
  soMeus = false,
  combina = false,
  quebrar = false,
  semOrdem = false,
  ordemSoNoCelular = false,
  ordemDaLinha = false,
}: {
  filtros: Filtros;
  soMeus?: boolean;
  /** quem tem currículo pode ordenar por "Combina mais" (o % de match) */
  combina?: boolean;
  /** numa coluna estreita (o feed): os filtros quebram em linhas, em vez de uma faixa que rola */
  quebrar?: boolean;
  /** a ordem já está nos atalhos (Mais perto, Novas): sem o seletor repetido */
  semOrdem?: boolean;
  /** a vitrine: no computador, a ordem fica na linha do título, junto do jeito de ver (OrdemDaLista) */
  ordemSoNoCelular?: boolean;
  /** a linha do tempo: Últimas (ela mesma) ou Mais relevantes (abre a lista nessa ordem) */
  ordemDaLinha?: boolean;
}) {
  const [ir, pendente] = useIrPara(filtros);
  const Faixa = quebrar ? FiltrosEmLinhas : FaixaRolavel;
  return (
    // "end-safe": juntos à direita quando cabem; sem espaço, começam da esquerda e rolam (nenhum fica escondido)
    <Faixa rotulo="Filtros da lista" ocupado={pendente} className="items-center lg:mx-0 lg:justify-end-safe lg:px-0">
      {/* quem publica: ver na busca (lista e mapa) só os próprios anúncios; vem primeiro, porque muda o que a lista mostra */}
      {soMeus && (
        <>
          <BotaoSoMeus filtros={filtros} />
          <span aria-hidden className="my-1.5 w-px shrink-0 bg-line-strong" />
        </>
      )}
      <Seletor
        aria-label="Área"
        value={filtros.categoria ?? ""}
        onChange={(e) => ir({ categoria: (e.target.value || null) as Categoria | null })}
        className={seletor}
        envoltorio="shrink-0"
      >
        <option value="">Área: todas</option>
        {CATEGORIAS.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.nome}
          </option>
        ))}
      </Seletor>
      {filtros.tipo !== "servico" && (
        <Seletor
          aria-label="Tipo de contratação"
          value={filtros.regime ?? ""}
          onChange={(e) => ir({ regime: (e.target.value || null) as Regime | null })}
          className={seletor}
          envoltorio="shrink-0"
        >
          <option value="">Contratação: todas</option>
          {Object.entries(REGIMES).map(([valor, r]) => (
            <option key={valor} value={valor}>
              {r.nome}
            </option>
          ))}
        </Seletor>
      )}
      {filtros.tipo === "vaga" && (
        <Seletor
          aria-label="Horário"
          value={filtros.turno ?? ""}
          onChange={(e) => ir({ turno: (e.target.value || null) as Turno | null })}
          className={seletor}
          envoltorio="shrink-0"
        >
          <option value="">Horário: qualquer</option>
          {TURNOS.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.nome}
            </option>
          ))}
        </Seletor>
      )}
      <Seletor
        aria-label="Distância ou tempo de ônibus"
        value={filtros.tempo ? `t${filtros.tempo}` : String(filtros.raio)}
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith("t")) ir({ tempo: Number(v.slice(1)) });
          else ir({ raio: Number(v), tempo: null });
        }}
        className={seletor}
        envoltorio="shrink-0"
      >
        <optgroup label="Tempo de ônibus">
          {TEMPOS.map((t) => (
            <option key={t} value={`t${t}`}>
              {nomeDoTempo(t)}
            </option>
          ))}
        </optgroup>
        <optgroup label="Distância">
          {RAIOS.map((r) => (
            <option key={r} value={r}>
              Até {r} km
            </option>
          ))}
        </optgroup>
      </Seletor>
      {ordemDaLinha && (
        <Seletor
          aria-label="Ordem"
          value={filtros.ordem === "relevantes" ? "relevantes" : "ultimas"}
          onChange={(e) => ir({ ordem: e.target.value === "relevantes" ? "relevantes" : "perto" })}
          className={seletor}
          envoltorio="shrink-0"
        >
          <option value="ultimas">Últimas</option>
          <option value="relevantes">Mais relevantes</option>
        </Seletor>
      )}
      {!semOrdem && (
        <SeletorOrdem
          filtros={filtros}
          combina={combina}
          ir={ir}
          envoltorio={ordemSoNoCelular ? "shrink-0 lg:hidden" : "shrink-0"}
        />
      )}
    </Faixa>
  );
}

function SeletorOrdem({
  filtros,
  combina,
  ir,
  envoltorio,
}: {
  filtros: Filtros;
  combina: boolean;
  ir: (mudancas: Partial<Filtros>) => void;
  envoltorio: string;
}) {
  return (
    <Seletor
      aria-label="Ordem"
      value={filtros.ordem === "combina" && !combina ? "perto" : filtros.ordem}
      onChange={(e) => ir({ ordem: e.target.value as Ordem })}
      className={seletor}
      envoltorio={envoltorio}
    >
      <option value="perto">Mais perto</option>
      <option value="recentes">Mais recentes</option>
      <option value="relevantes">Mais relevantes</option>
      {combina && <option value="combina">Combina mais</option>}
    </Seletor>
  );
}

/**
 * A ordem da lista sozinha, para a linha do título no computador (na vitrine, junto do jeito de
 * ver): a linha das abas fica só com os filtros e cabe inteira. No celular, ela fica nos filtros.
 */
export function OrdemDaLista({ filtros, combina = false }: { filtros: Filtros; combina?: boolean }) {
  const [ir] = useIrPara(filtros);
  return <SeletorOrdem filtros={filtros} combina={combina} ir={ir} envoltorio="shrink-0" />;
}

/** "Só os meus": quem publicou vê na busca (lista e mapa) só os próprios anúncios. Fica junto dos filtros. */
function BotaoSoMeus({ filtros }: { filtros: Filtros }) {
  const [ir, pendente] = useIrPara(filtros);
  return (
    <button
      type="button"
      aria-pressed={filtros.meus}
      disabled={pendente}
      onClick={() => ir({ meus: !filtros.meus })}
      className={`${botaoLugar(filtros.meus)} shrink-0 disabled:opacity-60`}
    >
      <UserRound aria-hidden className={`size-4 shrink-0 ${filtros.meus ? "text-terra-text" : ""}`} />
      Só os meus
      {filtros.meus && <X aria-hidden className="-mr-1 size-3.5 shrink-0" />}
    </button>
  );
}
