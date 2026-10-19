"use client";

import { ChevronLeft, ChevronRight, LocateFixed, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { REGIAO } from "@/lib/config";
import { CATEGORIAS, REGIMES } from "@/lib/constantes";
import { nomeDoTempo, TEMPOS } from "@/lib/deslocamento";
import { hrefFiltros, RAIOS, TURNOS, type Filtros, type Ordem, type Turno } from "@/lib/filtros";
import { lembrarBusca } from "@/lib/ultima-busca";
import type { Local } from "@/lib/regioes";
import type { Regime } from "@/lib/tipos";
import { Seletor } from "../ui/campo";
import { ABA_TALENTOS, ABAS_ANUNCIOS, classesAba, classesGrupoAbas, MioloAba } from "./abas";
import { BotaoOndeMora, botaoLugar, PainelOndeMora } from "./onde-mora";

// Três jeitos de olhar, cada um com a sua cara:
//   O QUE (tipo) ...... abas sublinhadas, em cima da busca (abas.tsx; Talentos é outra página)
//   ONDE (local) ...... botões de contorno com ícone de lugar
//   CATEGORIA ......... pílulas de filtro (a escolhida fica escura e ganha um ×)

const chip = (ativo: boolean) =>
  `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
    ativo ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-300 text-ink hover:border-line-strong"
  }`;

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
  fora: "Você parece estar fora de Goiânia e região. Mostrando a partir do centro de Goiânia.",
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
      if (lat < REGIAO.latMin || lat > REGIAO.latMax || lng < REGIAO.lngMin || lng > REGIAO.lngMax)
        return falhou("fora");
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

function BotaoPerto({ ativo, onClick }: { ativo: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} className={`${botaoLugar(ativo)} shrink-0`}>
      <LocateFixed aria-hidden className={`size-4 shrink-0 ${ativo ? "text-terra-text" : ""}`} />
      Perto de mim
      {ativo && <X aria-hidden className="-mr-1 size-3.5 shrink-0" />}
    </button>
  );
}

/**
 * A busca do topo da página: tipo, texto, onde mora, perto de mim e categorias. Só isso:
 * as perguntas da primeira visita ficam em cima da lista de anúncios (PerguntasNaLista).
 */
export function BarraBusca({
  filtros,
  local,
  abrirOndeMora = false,
}: {
  filtros: Filtros;
  local: Local | null;
  /** vem de "Informe seu CEP" (?casa=1): já abre o "Onde você mora?" */
  abrirOndeMora?: boolean;
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
  // começo da faixa das categorias (uma linha a menos antes dos anúncios)
  const botoesDeLugar = (classes: string) => (
    <div role="group" aria-label="Onde" className={`items-center gap-2 ${classes}`}>
      <BotaoOndeMora local={local} aberto={ondeMora} onClick={() => setOndeMora((a) => !a)} controla={painel} />
      <BotaoPerto ativo={perto} onClick={alternarPerto} />
    </div>
  );

  return (
    <div className="relative mt-3 flex flex-col gap-3 sm:mt-5">
      {pendente && <Carregando />}

      {/* No celular: abas, busca e uma faixa só com o lugar e as categorias (e o painel do bairro).
          No computador: abas e lugar na mesma linha, o painel do bairro, a busca e as categorias. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-4">
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
                <MioloAba aba={t} ativo={ativo} />
              </button>
            );
          })}
          {/* gente que procura trabalho: outra página (não são anúncios) */}
          <Link href={ABA_TALENTOS.href} className={classesAba(false)}>
            <MioloAba aba={ABA_TALENTOS} ativo={false} />
          </Link>
        </div>

        {botoesDeLugar("hidden min-w-0 sm:order-2 sm:mb-1.5 sm:flex")}

        {ondeMora && (
          <div className="order-4 sm:order-3 sm:basis-full">
            <PainelOndeMora
              id={painel}
              local={local}
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
          className="order-2 flex items-center gap-1 rounded-lg border border-line-strong bg-surface-200 p-1 pl-3 shadow-card has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus sm:order-4 sm:basis-full sm:p-1.5 sm:pl-3"
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

        <div className="order-3 min-w-0 sm:order-5 sm:basis-full">
          <FaixaRolavel rotulo="Lugar e categoria">
            {botoesDeLugar("flex shrink-0 sm:hidden")}
            <span aria-hidden className="my-1.5 w-px shrink-0 bg-line-strong sm:hidden" />
            <div role="group" aria-label="Categoria" className="flex shrink-0 gap-2">
              {CATEGORIAS.map(({ slug, nome, icone: Icone }) => {
                const ativa = filtros.categoria === slug;
                return (
                  <button
                    key={slug}
                    type="button"
                    aria-pressed={ativa}
                    // tocar de novo tira o filtro
                    onClick={() => ir({ categoria: ativa ? null : slug })}
                    className={chip(ativa)}
                  >
                    <Icone aria-hidden className="size-4" />
                    {nome}
                    {ativa && <X aria-hidden className="-mr-1 size-3.5" />}
                  </button>
                );
              })}
            </div>
          </FaixaRolavel>
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
}: {
  filtros: Filtros;
  soMeus?: boolean;
  /** quem tem currículo pode ordenar por "Combina mais" (o % de match) */
  combina?: boolean;
}) {
  const [ir, pendente] = useIrPara(filtros);
  return (
    <FaixaRolavel rotulo="Filtros da lista" ocupado={pendente} className="items-center lg:mx-0 lg:justify-end lg:px-0">
      {/* quem publica: ver na busca (lista e mapa) só os próprios anúncios; vem primeiro, porque muda o que a lista mostra */}
      {soMeus && (
        <>
          <BotaoSoMeus filtros={filtros} />
          <span aria-hidden className="my-1.5 w-px shrink-0 bg-line-strong" />
        </>
      )}
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
      <Seletor
        aria-label="Ordem"
        value={filtros.ordem === "combina" && !combina ? "perto" : filtros.ordem}
        onChange={(e) => ir({ ordem: e.target.value as Ordem })}
        className={seletor}
        envoltorio="shrink-0"
      >
        <option value="perto">Mais perto</option>
        <option value="recentes">Mais recentes</option>
        {combina && <option value="combina">Combina mais</option>}
      </Seletor>
    </FaixaRolavel>
  );
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
