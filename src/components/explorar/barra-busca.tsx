"use client";

import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LocateFixed,
  Search,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { REGIAO } from "@/lib/config";
import { CATEGORIAS, REGIMES } from "@/lib/constantes";
import { nomeDoTempo, TEMPOS } from "@/lib/deslocamento";
import { hrefFiltros, RAIOS, type Filtros } from "@/lib/filtros";
import type { Local } from "@/lib/regioes";
import type { Regime, TipoAnuncio } from "@/lib/tipos";
import { Seletor } from "../ui/campo";
import { BotaoOndeMora, botaoLugar, PainelOndeMora } from "./onde-mora";

// Três jeitos de olhar, cada um com a sua cara:
//   O QUE (tipo) ...... abas sublinhadas, em cima da busca
//   ONDE (local) ...... botões de contorno com ícone de lugar
//   CATEGORIA ......... pílulas de filtro (a escolhida fica escura e ganha um ×)
const TIPOS: { valor: TipoAnuncio | null; nome: string; ajuda: string; icone: LucideIcon }[] = [
  { valor: null, nome: "Tudo", ajuda: "Vagas e serviços", icone: LayoutGrid },
  { valor: "vaga", nome: "Vagas", ajuda: "Para trabalhar", icone: Briefcase },
  { valor: "servico", nome: "Serviços", ajuda: "Para contratar", icone: Wrench },
];

const chip = (ativo: boolean) =>
  `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
    ativo ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-300 text-ink hover:border-line-strong"
  }`;

// Os filtros da lista têm a cara de botão secundário pequeno.
const seletor =
  "min-h-10 rounded-md border border-line-strong bg-surface-200 pl-3.5 text-label text-ink transition-colors hover:bg-surface-300";

/** Muda a URL com os filtros novos, sem pular para o topo. */
function useIrPara(filtros: Filtros) {
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

/** Já pedimos a localização nesta visita (não pede de novo a cada página). */
const LOCALIZACAO_PEDIDA = "publike_localizacao_pedida";

const AVISOS_GPS = {
  sem: "Seu navegador não informa a localização.",
  fora: "Você parece estar fora de Goiânia e região. Mostrando a partir do centro de Goiânia.",
  negado: "Não conseguimos sua localização. Confira a permissão do navegador.",
} as const;

/** Pede a posição ao navegador. Arredonda (~100 m): bom para o mapa e a distância, sem a posição exata na URL. */
function pedirPosicao(
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

/** A busca do topo da página: tipo, onde mora, texto, perto de mim e categorias. */
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
  const painel = useId();
  const [avisoGps, setAvisoGps] = useState<string | null>(null);
  const [texto, setTexto] = useState(filtros.q);

  function buscar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    ir({ q: texto.trim() });
  }

  function irParaPosicao({ lat, lng }: { lat: number; lng: number }, substituir = false) {
    ir({ lat, lng, origem: "gps", ordem: "perto" }, substituir);
  }

  function pertoDeMim() {
    setAvisoGps(null);
    pedirPosicao(irParaPosicao, (motivo) => setAvisoGps(AVISOS_GPS[motivo]));
  }

  const perto = filtros.origem === "gps";

  // Ao entrar, pede a localização uma vez por visita, para mostrar os anúncios
  // a partir de onde a pessoa está. Não pede se ela já escolheu um local (casa,
  // bairro ou área do mapa): dá para trocar depois em "Onde você mora?",
  // "Perto de mim" ou no mapa.
  const irAoEntrar = useEffectEvent((ponto: { lat: number; lng: number }) => irParaPosicao(ponto, true));
  // (nem quando a pessoa veio de "Informe seu CEP": ela quer dizer onde mora)
  const podePedir = !local && filtros.origem === "centro" && !abrirOndeMora;
  useEffect(() => {
    if (!podePedir) return;
    try {
      if (window.sessionStorage.getItem(LOCALIZACAO_PEDIDA)) return;
      window.sessionStorage.setItem(LOCALIZACAO_PEDIDA, "1");
    } catch {
      // sem armazenamento: pede só desta vez
    }
    // negou ou está longe: fica tudo como está, sem aviso (ninguém tocou em nada)
    pedirPosicao(irAoEntrar, () => {});
  }, [podePedir]);

  function alternarPerto() {
    // tocar de novo desliga: volta a contar do centro (ou da casa)
    if (perto) ir({ origem: "centro" });
    else pertoDeMim();
  }

  return (
    <div className="relative mt-6 flex flex-col gap-3 sm:mt-8">
      {pendente && <Carregando />}

      {/* No celular: abas, busca, lugar. No computador: abas e lugar na mesma linha, busca embaixo. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-4">
        <div
          role="group"
          aria-label="O que você procura"
          className="order-1 grid grid-cols-3 border-b border-line sm:flex sm:flex-1 sm:gap-1"
        >
          {TIPOS.map((t) => {
            const ativo = filtros.tipo === t.valor;
            const Icone = t.icone;
            return (
              <button
                key={t.nome}
                type="button"
                aria-pressed={ativo}
                onClick={() => ir({ tipo: t.valor, regime: t.valor === "servico" ? null : filtros.regime })}
                className={`-mb-px flex min-h-12 items-center justify-center gap-2 border-b-[3px] px-2 pb-2.5 pt-1 transition-colors sm:justify-start sm:px-3 ${
                  ativo
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink"
                }`}
              >
                <Icone aria-hidden className={`size-5 shrink-0 ${ativo ? "text-terra-text" : ""}`} />
                <span className="flex flex-col text-left leading-tight">
                  <span className="text-label sm:text-body sm:font-semibold">{t.nome}</span>
                  <span className="hidden text-caption text-ink-muted sm:block">{t.ajuda}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div role="group" aria-label="Onde" className="order-3 flex min-w-0 items-center gap-2 sm:order-2 sm:mb-1.5">
          <BotaoOndeMora local={local} aberto={ondeMora} onClick={() => setOndeMora((a) => !a)} controla={painel} />
          <BotaoPerto ativo={perto} onClick={alternarPerto} />
        </div>

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
          className="order-2 flex items-center gap-1 rounded-lg border border-line-strong bg-surface-200 p-1.5 pl-3 shadow-card has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus sm:order-4 sm:basis-full"
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

        {avisoGps && (
          <p role="status" className="order-5 text-body-sm text-terra-text sm:basis-full">
            {avisoGps}
          </p>
        )}
      </div>

      <FaixaRolavel rotulo="Categoria">
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
