"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

// O banner da página de carreiras (claude/plano-pagina-de-vagas.md, parte 4): a chamada da empresa grande, por cima
// das fotos, com uma linha embaixo. Com mais de uma foto, elas passam sozinhas (a cada 6 s; param com o mouse em
// cima, com o foco num botão ou para quem pediu menos movimento) e as setas e os pontos trocam na hora. Sem fotos, o
// fundo é a cor da marca.

const INTERVALO = 6000;

export function BannerDaEmpresa({
  fotos,
  chamada,
  subchamada,
  cor,
  textoSobreCor,
}: {
  fotos: string[];
  chamada: string;
  subchamada: string | null;
  /** a cor da marca (null: a cor do Publike) */
  cor: string | null;
  /** a cor do texto em cima da cor da marca, sem foto */
  textoSobreCor: string;
}) {
  const [atual, setAtual] = useState(0);
  const [parado, setParado] = useState(false);
  const varias = fotos.length > 1;

  useEffect(() => {
    if (!varias || parado) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setAtual((i) => (i + 1) % fotos.length), INTERVALO);
    return () => window.clearInterval(t);
  }, [varias, parado, fotos.length]);

  const fundo = cor ?? "#1f1a14";
  const comFoto = fotos.length > 0;
  return (
    <section
      aria-roledescription={varias ? "carrossel" : undefined}
      aria-label="Banner"
      onMouseEnter={() => setParado(true)}
      onMouseLeave={() => setParado(false)}
      onFocusCapture={() => setParado(true)}
      onBlurCapture={() => setParado(false)}
      className="relative isolate flex min-h-60 overflow-hidden sm:min-h-80"
      style={{ background: fundo }}
    >
      {/* as fotos são de quem publicou (Storage público), sem o otimizador de imagens */}
      {fotos.map((f, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={f}
          src={f}
          alt=""
          aria-hidden={i !== atual}
          className={`absolute inset-0 -z-20 h-full w-full object-cover transition-opacity duration-700 motion-reduce:transition-none ${
            i === atual ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      {/* a cor da marca escurece o lado do texto: a chamada fica legível em qualquer foto */}
      {comFoto && (
        <span
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background: `linear-gradient(90deg, ${fundo}f2 0%, ${fundo}cc 38%, ${fundo}33 75%, transparent 100%)`,
          }}
        />
      )}
      <div
        className={`flex max-w-2xl flex-col justify-center gap-3 px-6 py-10 ${varias ? "sm:px-20" : "sm:px-12"}`}
        style={{ color: comFoto ? "#ffffff" : textoSobreCor }}
      >
        <p className="font-display text-[clamp(1.75rem,4.2vw,2.75rem)] leading-[1.08] font-bold text-balance">
          {chamada}
        </p>
        <span aria-hidden className="h-1 w-14 rounded-pill bg-current opacity-80" />
        {subchamada && <p className="max-w-[46ch] text-body-lg opacity-95">{subchamada}</p>}
      </div>
      {varias && (
        <>
          <button
            type="button"
            onClick={() => setAtual((i) => (i - 1 + fotos.length) % fotos.length)}
            aria-label="Foto anterior"
            className="absolute top-1/2 left-3 hidden size-10 -translate-y-1/2 place-items-center rounded-pill bg-white/85 text-[#1f1a14] shadow-card hover:bg-white sm:grid"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setAtual((i) => (i + 1) % fotos.length)}
            aria-label="Próxima foto"
            className="absolute top-1/2 right-3 hidden size-10 -translate-y-1/2 place-items-center rounded-pill bg-white/85 text-[#1f1a14] shadow-card hover:bg-white sm:grid"
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
          <div className="absolute right-0 bottom-3 left-0 flex justify-center gap-1">
            {fotos.map((f, i) => (
              <button
                key={f}
                type="button"
                onClick={() => setAtual(i)}
                aria-label={`Foto ${i + 1} de ${fotos.length}`}
                aria-current={i === atual ? "true" : undefined}
                className="grid size-6 place-items-center"
              >
                <span
                  aria-hidden
                  className={`h-1.5 rounded-pill bg-white shadow-card transition-all ${i === atual ? "w-5" : "w-1.5 opacity-70"}`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
