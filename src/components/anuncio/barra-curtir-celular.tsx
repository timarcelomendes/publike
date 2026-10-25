"use client";

import { Heart, PartyPopper } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * No celular, lendo a descrição, o Curtir fica à vista: quando o quadro "Quer se candidatar?" sai
 * da tela, uma barra fixa aparece em cima da barra de baixo e some quando o quadro volta. O botão
 * rola até o quadro (que tem a mensagem e as perguntas), em vez de curtir direto. No computador
 * (lg), o quadro já fica fixo na coluna ao lado: a barra não aparece.
 */
export function BarraCurtirCelular({
  alvo,
  titulo,
  valor,
  status,
  servico,
}: {
  /** o id do quadro do celular */
  alvo: string;
  titulo: string;
  valor: string;
  /** a curtida de quem vê (null: ainda não curtiu) */
  status: string | null;
  servico: boolean;
}) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const quadro = document.getElementById(alvo);
    if (!quadro) return;
    const observador = new IntersectionObserver(([e]) => setVisivel(!e.isIntersecting), {
      // a barra de baixo e a própria barra tapam o fim da tela
      rootMargin: "0px 0px -128px 0px",
    });
    observador.observe(quadro);
    return () => observador.disconnect();
  }, [alvo]);

  // o botão do Chat sobe para não ficar por cima da barra
  useEffect(() => {
    const raiz = document.documentElement;
    if (visivel) raiz.dataset.barraCurtir = "1";
    else delete raiz.dataset.barraCurtir;
    return () => {
      delete raiz.dataset.barraCurtir;
    };
  }, [visivel]);

  // dispensada ou desfeita: o quadro explica, e não há o que fazer pela barra
  if (status !== null && status !== "pendente" && status !== "match") return null;

  function irAoQuadro() {
    const quadro = document.getElementById(alvo);
    if (!quadro) return;
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    quadro.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "center" });
  }

  const rotulo =
    status === "match" ? "Deu match" : status === "pendente" ? (servico ? "Pedido enviado" : "Você curtiu") : null;

  return (
    <div
      aria-hidden={!visivel}
      inert={!visivel}
      className={`fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface-200/95 px-4 py-2.5 backdrop-blur-md transition-[transform,opacity] duration-200 motion-reduce:transition-none md:bottom-0 md:pb-[calc(0.625rem+env(safe-area-inset-bottom))] lg:hidden ${
        visivel ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-label">{titulo}</p>
          <p className="truncate text-body-sm text-ink-muted">{valor}</p>
        </div>
        {rotulo ? (
          <button
            type="button"
            onClick={irAoQuadro}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-pill px-4 text-label ${
              status === "match"
                ? "bg-cerrado text-on-cerrado"
                : "border border-line-strong text-ink hover:bg-surface-300"
            }`}
          >
            {status === "match" ? (
              <PartyPopper aria-hidden className="size-4" />
            ) : (
              <Heart aria-hidden className="size-4 fill-current text-like" />
            )}
            {rotulo}
          </button>
        ) : (
          <button
            type="button"
            onClick={irAoQuadro}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-pill bg-like px-5 text-label text-on-like hover:brightness-110"
          >
            <Heart aria-hidden className="size-4" />
            {servico ? "Quero contratar" : "Curtir a vaga"}
          </button>
        )}
      </div>
    </div>
  );
}
