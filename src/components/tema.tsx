"use client";

import { Check, Moon, Sun, SunMoon, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CHAVE_TEMA, COR_BARRA, EVENTO_TEMA, TEMAS, type Tema } from "@/lib/tema";

const ESCURO = "(prefers-color-scheme: dark)";

const OPCOES: Record<Tema, { nome: string; icone: LucideIcon; dica?: string }> = {
  claro: { nome: "Claro", icone: Sun },
  auto: { nome: "Automático", icone: SunMoon, dica: "igual ao do aparelho" },
  escuro: { nome: "Escuro", icone: Moon },
};

function temaAtual(): Tema {
  const t = document.documentElement.dataset.tema;
  return t === "escuro" || t === "auto" ? t : "claro";
}

function acompanhar(avisar: () => void) {
  const consulta = window.matchMedia(ESCURO);
  consulta.addEventListener("change", avisar);
  window.addEventListener(EVENTO_TEMA, avisar);
  return () => {
    consulta.removeEventListener("change", avisar);
    window.removeEventListener(EVENTO_TEMA, avisar);
  };
}

function ficaEscuro(t: Tema) {
  return t === "escuro" || (t === "auto" && window.matchMedia(ESCURO).matches);
}

/** A escolha da pessoa (claro, automático ou escuro). */
export function useTema(): Tema {
  return useSyncExternalStore(acompanhar, temaAtual, () => "claro");
}

/** true quando o site está escuro agora (escolheu escuro, ou automático com o aparelho no escuro). */
export function useTemaEscuro() {
  return useSyncExternalStore(
    acompanhar,
    () => ficaEscuro(temaAtual()),
    () => false,
  );
}

/** A barra do navegador (celular) acompanha o tema. */
function pintarBarra() {
  const cor = ficaEscuro(temaAtual()) ? COR_BARRA.escuro : COR_BARRA.claro;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", cor));
}

export function definirTema(t: Tema) {
  document.documentElement.dataset.tema = t;
  try {
    if (t === "claro") localStorage.removeItem(CHAVE_TEMA);
    else localStorage.setItem(CHAVE_TEMA, t);
  } catch {
    // sem localStorage (aba anônima): vale só nesta página
  }
  pintarBarra();
  window.dispatchEvent(new Event(EVENTO_TEMA));
}

/** Botão do cabeçalho: escolhe entre claro, automático e escuro. */
export function BotaoTema() {
  const tema = useTema();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const Icone = OPCOES[tema].icone;

  // a cor da barra do navegador, ao abrir e quando o aparelho troca (no automático)
  useEffect(() => acompanhar(pintarBarra), []);
  useEffect(() => pintarBarra(), [tema]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls="menu-tema"
        aria-label={`Tema: ${OPCOES[tema].nome}`}
        title="Claro, automático ou escuro"
        onClick={() => setAberto((v) => !v)}
        className="flex size-11 items-center justify-center rounded-pill text-ink-muted transition-colors hover:bg-surface-300 hover:text-ink"
      >
        <Icone aria-hidden className="size-5" />
      </button>
      {aberto && (
        <div
          id="menu-tema"
          role="radiogroup"
          aria-label="Tema"
          className="absolute top-full right-0 z-50 mt-2 w-60 rounded-md border border-line bg-surface-200 p-2 shadow-raised"
        >
          <p className="px-3 pt-1 pb-2 text-label">Tema</p>
          {TEMAS.map((t) => {
            const { nome, icone: I, dica } = OPCOES[t];
            const marcado = t === tema;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={marcado}
                onClick={() => {
                  definirTema(t);
                  setAberto(false);
                }}
                className={`flex min-h-11 w-full items-center gap-3 rounded-sm px-3 text-left text-body-sm hover:bg-surface-300 ${
                  marcado ? "text-ink" : "text-ink-muted"
                }`}
              >
                <I aria-hidden className="size-[18px]" />
                <span className="flex-1">
                  {nome}
                  {dica && <span className="block text-caption text-ink-muted">{dica}</span>}
                </span>
                {marcado && <Check aria-hidden className="size-4 text-cerrado-text" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
