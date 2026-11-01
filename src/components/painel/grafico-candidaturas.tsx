"use client";

import { useRef, useState, type KeyboardEvent } from "react";

export type ColunaDoGrafico = {
  /** "qua., 15 de out." (ou "semana de 13 de out.") */
  rotulo: string;
  /** "15/10", embaixo do gráfico */
  curto: string;
  n: number;
};

/**
 * As candidaturas da vaga ao longo do tempo (a aba Números da vaga): uma coluna por dia (ou por semana, na vaga
 * antiga), da publicação até hoje. Passar o mouse ou o foco (setas do teclado) numa coluna mostra o dia e quantas;
 * o pico leva o número em cima; a tabela embaixo tem os mesmos números para quem não vê o gráfico.
 */
export function GraficoDeCandidaturas({
  colunas,
  unidade,
  ultimaEhHoje,
}: {
  colunas: ColunaDoGrafico[];
  unidade: "dia" | "semana";
  ultimaEhHoje: boolean;
}) {
  const [aberta, setAberta] = useState<number | null>(null);
  // uma coluna só recebe o Tab; as setas andam entre elas
  const [foco, setFoco] = useState(colunas.length - 1);
  const itens = useRef<(HTMLLIElement | null)[]>([]);
  const maior = Math.max(1, ...colunas.map((c) => c.n));
  const pico = colunas.findIndex((c) => c.n === maior);
  const titulo = unidade === "dia" ? "Candidaturas por dia" : "Candidaturas por semana";
  const qtas = (n: number) => (n === 1 ? "1 candidatura" : `${n} candidaturas`);

  function ir(i: number) {
    const j = Math.max(0, Math.min(colunas.length - 1, i));
    setFoco(j);
    itens.current[j]?.focus();
  }
  function tecla(e: KeyboardEvent) {
    const para = { ArrowLeft: foco - 1, ArrowRight: foco + 1, Home: 0, End: colunas.length - 1 }[e.key];
    if (para === undefined) return;
    e.preventDefault();
    ir(para);
  }

  const meio = Math.floor((colunas.length - 1) / 2);
  return (
    <figure className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5">
      <figcaption className="text-h3">{titulo}</figcaption>
      <ol
        aria-label={titulo}
        onKeyDown={tecla}
        onPointerLeave={() => setAberta(null)}
        className="flex h-40 items-stretch gap-0.5 border-b border-line"
      >
        {colunas.map((c, i) => {
          const borda = i < 3 ? "left-0" : i > colunas.length - 4 ? "right-0" : "left-1/2 -translate-x-1/2";
          return (
            <li
              key={i}
              ref={(el) => {
                itens.current[i] = el;
              }}
              tabIndex={i === foco ? 0 : -1}
              aria-label={`${c.rotulo}: ${qtas(c.n)}`}
              onPointerEnter={() => setAberta(i)}
              onFocus={() => {
                setFoco(i);
                setAberta(i);
              }}
              onBlur={() => setAberta(null)}
              className="flex min-w-0 flex-1 cursor-default flex-col items-center justify-end rounded-t-[4px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {/* o pico leva o número; os outros, no balão */}
              {i === pico && c.n > 0 && (
                <span aria-hidden className="mb-1 text-caption text-ink">
                  {c.n}
                </span>
              )}
              <span
                aria-hidden
                className={`relative w-full max-w-6 rounded-t-[4px] transition-colors ${
                  aberta === i ? "bg-ink" : "bg-ink-muted"
                }`}
                style={{ height: c.n ? `${(c.n / maior) * 82}%` : 0 }}
              >
                {aberta === i && (
                  <span
                    className={`pointer-events-none absolute bottom-full z-10 mb-1.5 flex flex-col rounded-md border border-line bg-surface-200 px-2.5 py-1.5 whitespace-nowrap shadow-raised ${borda}`}
                  >
                    <span className="text-label text-ink">{qtas(c.n)}</span>
                    <span className="text-caption text-ink-muted">{c.rotulo}</span>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div aria-hidden className="relative flex justify-between text-caption text-ink-muted">
        <span>{colunas[0]?.curto}</span>
        {colunas.length > 6 && <span className="absolute left-1/2 -translate-x-1/2">{colunas[meio]?.curto}</span>}
        <span>{ultimaEhHoje ? (unidade === "dia" ? "hoje" : "esta semana") : colunas.at(-1)?.curto}</span>
      </div>
      <details className="text-body-sm">
        <summary className="inline-flex min-h-10 cursor-pointer items-center text-ink-muted underline underline-offset-2 hover:text-ink">
          Ver os números em tabela
        </summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead className="text-caption text-ink-muted">
            <tr className="border-b border-line">
              <th className="py-1.5 font-normal">{unidade === "dia" ? "Dia" : "Semana"}</th>
              <th className="py-1.5 text-right font-normal">Candidaturas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {colunas
              .filter((c) => c.n > 0)
              .map((c, i) => (
                <tr key={i}>
                  <td className="py-1.5">{c.rotulo}</td>
                  <td className="py-1.5 text-right">{c.n}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <p className="mt-1 text-caption text-ink-muted">
          {unidade === "dia" ? "Os dias sem candidatura ficam de fora." : "As semanas sem candidatura ficam de fora."}
        </p>
      </details>
    </figure>
  );
}
