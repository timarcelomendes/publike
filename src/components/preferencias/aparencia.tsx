"use client";

import { Moon, Sun, SunMoon, type LucideIcon } from "lucide-react";
import { TEMAS, type Tema } from "@/lib/tema";
import { definirTema, useTema } from "../tema";

const OPCOES: Record<Tema, { nome: string; ajuda: string; icone: LucideIcon }> = {
  claro: { nome: "Claro", ajuda: "Fundo claro", icone: Sun },
  auto: { nome: "Automático", ajuda: "Igual ao do aparelho", icone: SunMoon },
  escuro: { nome: "Escuro", ajuda: "Fundo escuro", icone: Moon },
};

/**
 * Preferências › Aparência: o mesmo tema do menu da conta (claro, automático ou escuro), que vale para o aparelho
 * (fica no navegador, como no menu).
 */
export function EscolherAparencia() {
  const tema = useTema();
  return (
    <div className="rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
      <p id="aparencia-da-pagina" className="text-label">
        Tema
      </p>
      <p className="mt-0.5 text-body-sm text-ink-muted">A escolha vale para este aparelho.</p>
      <div role="radiogroup" aria-labelledby="aparencia-da-pagina" className="mt-3 grid grid-cols-3 gap-2">
        {TEMAS.map((t) => {
          const { nome, ajuda, icone: Icone } = OPCOES[t];
          const marcado = t === tema;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={marcado}
              onClick={() => definirTema(t)}
              className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-md border px-2 text-center ${
                marcado ? "border-ink bg-surface-300 text-ink" : "border-line text-ink-muted hover:bg-surface-300"
              }`}
            >
              <Icone aria-hidden className="size-5" />
              <span className="text-label">{nome}</span>
              <span className="text-caption max-sm:sr-only">{ajuda}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
