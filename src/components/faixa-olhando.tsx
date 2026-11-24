"use client";

import { Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { Container } from "./ui/basicos";

/**
 * A faixa da equipe do Publike vendo como o dono (migração 20270919120000), no alto de todas as páginas. O site e o
 * banco já recusam o que muda algo; aqui, o envio de formulários é parado antes (com um aviso), e o resto (abrir,
 * fechar, trocar de aba, ver o currículo) funciona como para o dono.
 */
export function FaixaOlhando({ conta }: { conta: string }) {
  const [aviso, setAviso] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.olhando = "1";
    let tempo: ReturnType<typeof setTimeout> | undefined;
    const bloquear = (e: Event) => {
      const alvo = e.target instanceof Element ? e.target : null;
      if (!alvo?.closest("#conteudo") || alvo.getAttribute("role") === "search") return;
      e.preventDefault();
      e.stopPropagation();
      setAviso(true);
      clearTimeout(tempo);
      tempo = setTimeout(() => setAviso(false), 4000);
    };
    window.addEventListener("submit", bloquear, true);
    return () => {
      delete document.documentElement.dataset.olhando;
      window.removeEventListener("submit", bloquear, true);
      clearTimeout(tempo);
    };
  }, []);

  return (
    <>
      <div role="region" aria-label="Vendo como o dono" className="bg-terra text-white">
        <Container className="flex min-h-12 items-center gap-3 py-1.5">
          <Eye aria-hidden className="size-5 shrink-0" />
          <p className="min-w-0 flex-1 text-body-sm">
            <strong className="font-semibold">Vendo como {conta}.</strong>{" "}
            <span className="hidden text-white/80 sm:inline">Só olhar: nada do que você tocar é salvo. Vale por 1 hora.</span>
          </p>
          <form method="post" action="/admin/olhar/parar">
            <button
              type="submit"
              className="inline-flex min-h-9 shrink-0 items-center rounded-pill bg-white px-3.5 text-label text-ink transition-colors hover:bg-surface-300"
            >
              Parar de olhar
            </button>
          </form>
        </Container>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={
          aviso
            ? "fixed inset-x-4 top-20 z-50 mx-auto w-fit max-w-md rounded-md bg-ink px-4 py-3 text-body-sm text-surface-100 shadow-raised"
            : "sr-only"
        }
      >
        {aviso ? "Só olhar: vendo como o dono, nada é salvo." : ""}
      </p>
    </>
  );
}
