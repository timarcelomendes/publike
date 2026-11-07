"use client";

import { Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// A dica "Você pode mudar a forma de ver", embaixo dos botões do jeito de ver (na vitrine, no computador):
// volta a cada 7 dias. Espera a dica do curtir já ter aparecido (as duas juntas confundem), e só aparece
// quando os botões estão na tela.
const CHAVE = "publike_dica_ver_como";
const CHAVE_CURTIR = "publike_dica_curtir";
const INTERVALO = 7 * 24 * 60 * 60 * 1000;

function podeMostrar() {
  try {
    if (window.localStorage.getItem(CHAVE_CURTIR) !== "1") return false;
    const ultima = Number(window.localStorage.getItem(CHAVE) ?? 0);
    return !ultima || Date.now() - ultima >= INTERVALO;
  } catch {
    // sem armazenamento, voltaria em toda página: melhor não mostrar
    return false;
  }
}

function guardarVista() {
  try {
    window.localStorage.setItem(CHAVE, String(Date.now()));
  } catch {
    // sem armazenamento: nada a guardar
  }
}

/** Fica num invólucro `relative` junto dos botões; some no Entendi ou quando a pessoa escolhe um jeito. */
export function DicaVerComo({ evento }: { evento: string }) {
  const marca = useRef<HTMLSpanElement>(null);
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    const el = marca.current?.parentElement;
    if (!el || !podeMostrar()) return;
    const olhar = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        olhar.disconnect();
        guardarVista();
        setAberta(true);
      },
      { threshold: 1 },
    );
    olhar.observe(el);
    return () => olhar.disconnect();
  }, []);

  // escolheu um jeito de ver: já entendeu
  useEffect(() => {
    if (!aberta) return;
    const fechar = () => setAberta(false);
    window.addEventListener(evento, fechar);
    return () => window.removeEventListener(evento, fechar);
  }, [aberta, evento]);

  return (
    <>
      <span ref={marca} hidden />
      {aberta && (
        <div
          role="status"
          className="absolute top-full right-0 z-30 mt-3 w-80 max-w-[calc(100vw-2rem)] rounded-md bg-ink p-3.5 text-left text-body-sm text-surface-100 shadow-raised"
        >
          <span aria-hidden className="absolute -top-1.5 right-8 size-3 rotate-45 bg-ink" />
          <p className="flex items-center gap-1.5 text-label">
            <Eye aria-hidden className="size-4 shrink-0" />
            Você pode mudar a forma de ver
          </p>
          <p className="mt-1 opacity-90">
            Clique nos botões para ver as vagas em lista, em grade, só no mapa ou em Lista + detalhes, com a vaga aberta
            ao lado.
          </p>
          <div className="mt-2.5 flex justify-end">
            <button
              type="button"
              onClick={() => setAberta(false)}
              className="inline-flex min-h-9 items-center rounded-pill bg-surface-100 px-4 text-label text-ink hover:opacity-90"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
