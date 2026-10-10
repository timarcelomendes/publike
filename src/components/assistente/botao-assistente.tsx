"use client";

import { MessageCircleQuestion, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Conversa } from "./conversa";

// Onde o botão não aparece: o admin, a entrada pelo link, a própria página de
// ajuda (a conversa já está lá) e o Descobrir (os botões de curtir ficam embaixo).
const SEM_BOTAO = [/^\/admin/, /^\/auth\//, /^\/ajuda/, /^\/descobrir/];

/** Botão "Ajuda" no canto da tela, que abre a conversa com o assistente. */
export function BotaoAssistente() {
  const caminho = usePathname() ?? "/";
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botao.current?.focus();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto]);

  if (SEM_BOTAO.some((r) => r.test(caminho))) return null;

  return (
    <>
      {!aberto && (
        <button
          ref={botao}
          type="button"
          onClick={() => setAberto(true)}
          aria-haspopup="dialog"
          className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 inline-flex size-12 items-center justify-center gap-2 rounded-pill bg-ink text-label text-surface-100 shadow-raised transition-transform hover:scale-[1.03] sm:size-auto sm:min-h-12 sm:px-4 md:right-6 md:bottom-6"
        >
          <MessageCircleQuestion aria-hidden className="size-5" />
          {/* no celular, só o ícone (tapa menos os cartões) */}
          <span className="sr-only sm:not-sr-only">Ajuda</span>
        </button>
      )}
      {aberto && (
        <div
          ref={painel}
          role="dialog"
          aria-modal="false"
          aria-label="Assistente do Publike"
          className="fixed inset-0 z-50 flex flex-col bg-surface-100 md:inset-auto md:right-6 md:bottom-6 md:h-[min(36rem,calc(100dvh-6rem))] md:w-[24rem] md:overflow-hidden md:rounded-lg md:border md:border-line md:shadow-raised"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-200 px-4 py-3">
            <div className="min-w-0">
              <p className="font-display text-label">Assistente do Publike</p>
              <Link
                href="/ajuda"
                onClick={() => setAberto(false)}
                className="text-body-sm text-ink-muted underline-offset-2 hover:underline"
              >
                Ver a página de ajuda
              </Link>
            </div>
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                requestAnimationFrame(() => botao.current?.focus());
              }}
              className="flex size-10 items-center justify-center rounded-pill hover:bg-surface-300"
            >
              <X aria-hidden className="size-5" />
              <span className="sr-only">Fechar</span>
            </button>
          </div>
          <Conversa autoFoco className="flex-1" />
        </div>
      )}
    </>
  );
}
