"use client";

import { ChevronLeft, ChevronRight, LocateFixed, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { REGIAO } from "@/lib/config";
import { CATEGORIAS, REGIMES } from "@/lib/constantes";
import { hrefFiltros, RAIOS, type Filtros } from "@/lib/filtros";
import type { Local } from "@/lib/regioes";
import type { Regime, TipoAnuncio } from "@/lib/tipos";
import { Seletor } from "../ui/campo";
import { BotaoOndeMora, PainelOndeMora } from "./onde-mora";

const TIPOS: { valor: TipoAnuncio | null; nome: string }[] = [
  { valor: null, nome: "Tudo" },
  { valor: "vaga", nome: "Vagas" },
  { valor: "servico", nome: "Serviços" },
];

const chip = (ativo: boolean) =>
  `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
    ativo ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-300 text-ink hover:border-line-strong"
  }`;

/** Abas do tipo de anúncio: pílula com a opção escolhida em ink. */
const aba = (ativo: boolean) =>
  `inline-flex min-h-10 items-center rounded-pill px-3.5 text-label transition-colors sm:px-4 ${
    ativo ? "bg-ink text-surface-100" : "text-ink hover:bg-surface-300"
  }`;

// Os filtros da lista têm a cara de botão secundário pequeno.
const seletor =
  "min-h-10 rounded-md border border-line-strong bg-surface-200 pl-3.5 text-label text-ink transition-colors hover:bg-surface-300";

/** Muda a URL com os filtros novos, sem pular para o topo. */
function useIrPara(filtros: Filtros) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const ir = (mudancas: Partial<Filtros>) =>
    iniciar(() => router.push(hrefFiltros(filtros, mudancas), { scroll: false }));
  return [ir, pendente] as const;
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
  const seta = "absolute top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-pill border border-line-strong bg-surface-200 text-ink shadow-card transition-colors hover:bg-surface-300 pointer-fine:flex";

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

function BotaoPerto({ ativo, onClick, className }: { ativo: boolean; onClick: () => void; className: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`${className} min-h-10 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
        ativo ? "border-ink bg-ink text-surface-100" : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
      }`}
    >
      <LocateFixed aria-hidden className="size-4" />
      Perto de mim
    </button>
  );
}

/** A busca do topo da página: tipo, onde mora, texto, perto de mim e categorias. */
export function BarraBusca({ filtros, local }: { filtros: Filtros; local: Local | null }) {
  const [ir, pendente] = useIrPara(filtros);
  const [ondeMora, setOndeMora] = useState(false);
  const painel = useId();
  const [avisoGps, setAvisoGps] = useState<string | null>(null);
  const [texto, setTexto] = useState(filtros.q);

  function buscar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    ir({ q: texto.trim() });
  }

  function pertoDeMim() {
    setAvisoGps(null);
    if (!("geolocation" in navigator)) {
      setAvisoGps("Seu navegador não informa a localização.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;
        if (lat < REGIAO.latMin || lat > REGIAO.latMax || lng < REGIAO.lngMin || lng > REGIAO.lngMax) {
          setAvisoGps("Você parece estar fora de Goiânia e região. Mostrando a partir do centro de Goiânia.");
          return;
        }
        // arredonda (~1 km): a busca não precisa da posição exata
        ir({ lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, origem: "gps", ordem: "perto" });
      },
      () => setAvisoGps("Não conseguimos sua localização. Confira a permissão do navegador."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  const perto = filtros.origem === "gps";

  return (
    <div className="relative mt-6 flex flex-col gap-3 sm:mt-8">
      {pendente && <Carregando />}

      <div className="flex items-center justify-between gap-2">
        <div role="group" aria-label="Tipo de anúncio" className="inline-flex shrink-0 rounded-pill border border-line bg-surface-200 p-1">
          {TIPOS.map((t) => (
            <button
              key={t.nome}
              type="button"
              aria-pressed={filtros.tipo === t.valor}
              onClick={() => ir({ tipo: t.valor, regime: t.valor === "servico" ? null : filtros.regime })}
              className={aba(filtros.tipo === t.valor)}
            >
              {t.nome}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <BotaoOndeMora local={local} aberto={ondeMora} onClick={() => setOndeMora((a) => !a)} controla={painel} />
          {/* no celular, "Perto de mim" vai para o começo das categorias (falta espaço aqui) */}
          <BotaoPerto ativo={perto} onClick={pertoDeMim} className="hidden sm:inline-flex" />
        </div>
      </div>

      {ondeMora && <PainelOndeMora id={painel} local={local} fechar={() => setOndeMora(false)} />}

      <form
        role="search"
        onSubmit={buscar}
        className="flex items-center gap-1 rounded-lg border border-line-strong bg-surface-200 p-1.5 pl-3 shadow-card has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus"
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
          placeholder="Diarista, garçom, pedreiro…"
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
      {avisoGps && (
        <p role="status" className="text-body-sm text-terra-text">
          {avisoGps}
        </p>
      )}

      <FaixaRolavel rotulo="Categoria">
        <BotaoPerto ativo={perto} onClick={pertoDeMim} className="inline-flex sm:hidden" />
        <button
          type="button"
          aria-pressed={filtros.categoria === null}
          onClick={() => ir({ categoria: null })}
          className={chip(filtros.categoria === null)}
        >
          Todas
        </button>
        {CATEGORIAS.map(({ slug, nome, icone: Icone }) => (
          <button
            key={slug}
            type="button"
            aria-pressed={filtros.categoria === slug}
            onClick={() => ir({ categoria: filtros.categoria === slug ? null : slug })}
            className={chip(filtros.categoria === slug)}
          >
            <Icone aria-hidden className="size-4" />
            {nome}
          </button>
        ))}
      </FaixaRolavel>
    </div>
  );
}

/** Contratação, distância e ordem: ficam junto da contagem de resultados. */
export function FiltrosLista({ filtros }: { filtros: Filtros }) {
  const [ir, pendente] = useIrPara(filtros);
  return (
    <FaixaRolavel rotulo="Filtros da lista" ocupado={pendente} className="items-center lg:mx-0 lg:justify-end lg:px-0">
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
      <Seletor
        aria-label="Distância"
        value={filtros.raio}
        onChange={(e) => ir({ raio: Number(e.target.value) })}
        className={seletor}
        envoltorio="shrink-0"
      >
        {RAIOS.map((r) => (
          <option key={r} value={r}>
            Até {r} km
          </option>
        ))}
      </Seletor>
      <Seletor
        aria-label="Ordem"
        value={filtros.ordem}
        onChange={(e) => ir({ ordem: e.target.value === "recentes" ? "recentes" : "perto" })}
        className={seletor}
        envoltorio="shrink-0"
      >
        <option value="perto">Mais perto</option>
        <option value="recentes">Mais recentes</option>
      </Seletor>
    </FaixaRolavel>
  );
}
