"use client";

import { ArrowRight, Briefcase, HandHelping, UserPlus, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { JornadaAjuda } from "@/lib/ajuda";
import type { Intencao } from "@/lib/intencao";

const ICONES: Record<Intencao, LucideIcon> = {
  trabalho: Briefcase,
  contratar_servico: Wrench,
  oferecer_servico: HandHelping,
  contratar_pessoa: UserPlus,
};

/** O passo a passo de cada perfil (abas), do começo ao fim, com o atalho de cada passo. */
export function JornadasAjuda({ jornadas, inicial }: { jornadas: JornadaAjuda[]; inicial: Intencao }) {
  const [atual, setAtual] = useState<Intencao>(inicial);
  const base = useId();
  const abas = useRef<(HTMLButtonElement | null)[]>([]);
  const jornada = jornadas.find((j) => j.id === atual) ?? jornadas[0];

  // setas trocam de aba (padrão de abas acessíveis)
  function teclas(e: KeyboardEvent, i: number) {
    const passo =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const proximo = (i + passo + jornadas.length) % jornadas.length;
    setAtual(jornadas[proximo].id);
    abas.current[proximo]?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Escolha o seu caso" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {jornadas.map((j, i) => {
          const Icone = ICONES[j.id];
          const ativo = j.id === atual;
          return (
            <button
              key={j.id}
              ref={(el) => {
                abas.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-aba-${j.id}`}
              aria-selected={ativo}
              aria-controls={`${base}-painel`}
              tabIndex={ativo ? 0 : -1}
              onClick={() => setAtual(j.id)}
              onKeyDown={(e) => teclas(e, i)}
              className={`flex min-h-12 items-center gap-2 rounded-md border px-3 py-2 text-left text-label transition-colors ${
                ativo
                  ? "border-ink bg-ink text-surface-100"
                  : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
              }`}
            >
              <Icone aria-hidden className={`size-5 shrink-0 ${ativo ? "" : "text-terra-text"}`} />
              {j.perfil}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${base}-painel`}
        aria-labelledby={`${base}-aba-${jornada.id}`}
        className="flex flex-col gap-5"
      >
        <p className="max-w-2xl text-body-lg">{jornada.resumo}</p>
        <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {jornada.passos.map((p, i) => (
            <li key={p.titulo} className="flex gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-ink font-display text-label text-surface-100 tabular-nums"
              >
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="text-label">
                  <span className="sr-only">Passo {i + 1}: </span>
                  {p.titulo}
                </h3>
                <p className="text-body-sm text-ink-muted">{p.texto}</p>
                {p.link && (
                  <Link
                    href={p.link.href}
                    className="mt-1 inline-flex min-h-9 items-center gap-1 self-start text-label text-terra-text underline-offset-2 hover:underline"
                  >
                    {p.link.texto}
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
