"use client";

import { MessageCircleQuestion, RotateCcw, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import { Conversa, AvatarAssistente } from "./conversa";
import { mudarConversa, useConversa } from "./conversa-estado";

// Onde o botão não aparece: o admin, a entrada pelo link, a própria página de
// ajuda (a conversa já está lá) e o Descobrir (os botões de curtir ficam embaixo).
const SEM_BOTAO = [/^\/admin/, /^\/auth\//, /^\/ajuda/, /^\/descobrir/];

/** Marca no endereço enquanto a conversa está aberta: o "voltar" do celular fecha a conversa, não o site. */
const MARCA = "#assistente";

/**
 * No celular, a conversa ocupa a parte visível da tela (a área acima do
 * teclado, quando ele abre), deixando uma faixa da página no topo. Assim o
 * cabeçalho com o "Fechar" fica sempre à vista.
 */
function useAreaVisivel(ativo: boolean) {
  const [area, setArea] = useState<{ topo: number; altura: number } | null>(null);
  useEffect(() => {
    if (!ativo) return;
    const vv = window.visualViewport;
    const celular = window.matchMedia("(max-width: 767px)");
    const medir = () => {
      if (!celular.matches) return setArea(null);
      setArea({ topo: vv?.offsetTop ?? 0, altura: vv?.height ?? window.innerHeight });
    };
    medir();
    vv?.addEventListener("resize", medir);
    vv?.addEventListener("scroll", medir);
    celular.addEventListener("change", medir);
    return () => {
      vv?.removeEventListener("resize", medir);
      vv?.removeEventListener("scroll", medir);
      celular.removeEventListener("change", medir);
    };
  }, [ativo]);
  return area;
}

/** Botão "Ajuda" no canto da tela, que abre a conversa com o assistente. */
export function BotaoAssistente() {
  const caminho = usePathname() ?? "/";
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const area = useAreaVisivel(aberto);
  const conversa = useConversa();

  function abrir() {
    // um passo a mais no histórico: o "voltar" fecha a conversa
    if (window.location.hash !== MARCA) {
      window.history.pushState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}${MARCA}`,
      );
    }
    setAberto(true);
  }

  function fechar() {
    if (window.location.hash === MARCA) window.history.back();
    else setAberto(false);
    requestAnimationFrame(() => botao.current?.focus());
  }

  const aoTeclar = useEffectEvent((e: globalThis.KeyboardEvent) => {
    if (e.key === "Escape") fechar();
  });

  useEffect(() => {
    if (!aberto) return;
    const aoVoltar = () => {
      if (window.location.hash !== MARCA) setAberto(false);
    };
    const tecla = (e: globalThis.KeyboardEvent) => aoTeclar(e);
    window.addEventListener("popstate", aoVoltar);
    window.addEventListener("keydown", tecla);
    // no celular, a página atrás não rola junto
    const raiz = document.documentElement;
    const antes = raiz.style.overflow;
    if (window.matchMedia("(max-width: 767px)").matches) raiz.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", aoVoltar);
      window.removeEventListener("keydown", tecla);
      raiz.style.overflow = antes;
    };
  }, [aberto]);

  if (SEM_BOTAO.some((r) => r.test(caminho))) return null;

  // no celular: a folha vai do topo da área visível (com uma folga) até o fim dela
  const folga = area ? Math.min(72, Math.max(16, area.altura * 0.08)) : 0;
  const estilo: CSSProperties | undefined = area
    ? { top: area.topo + folga, height: area.altura - folga, bottom: "auto" }
    : undefined;

  return (
    <>
      {!aberto && (
        <button
          ref={botao}
          type="button"
          onClick={abrir}
          aria-haspopup="dialog"
          className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 inline-flex size-12 items-center justify-center gap-2 rounded-pill bg-ink text-label text-surface-100 shadow-raised transition-transform hover:scale-[1.03] sm:size-auto sm:min-h-12 sm:px-4 md:right-6 md:bottom-6"
        >
          <MessageCircleQuestion aria-hidden className="size-5" />
          {/* no celular, só o ícone (tapa menos os cartões) */}
          <span className="sr-only sm:not-sr-only">Ajuda</span>
        </button>
      )}
      {aberto && (
        <>
          {/* fundo escurecido: tocar fora fecha (só no celular) */}
          <div aria-hidden onClick={fechar} className="fixed inset-0 z-50 bg-ink/40 md:hidden" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Assistente do Publike"
            style={estilo}
            // um link da conversa leva para outra página: a conversa fecha
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest("a")) setAberto(false);
            }}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[88dvh] flex-col overflow-hidden rounded-t-2xl bg-surface-100 shadow-raised md:inset-x-auto md:right-6 md:bottom-6 md:h-[min(38rem,calc(100dvh-6rem))] md:w-[25rem] md:rounded-2xl md:border md:border-line"
          >
            <div className="shrink-0 border-b border-line bg-surface-200">
              <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-pill bg-line-strong/60 md:hidden" />
              <div className="flex items-center gap-3 px-4 py-3">
                <AvatarAssistente />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-label leading-tight">Assistente do Publike</p>
                  <p className="flex items-center gap-1.5 text-body-sm text-ink-muted">
                    <span aria-hidden className="size-2 rounded-pill bg-cerrado" />
                    Responde na hora
                  </p>
                </div>
                {conversa.length > 0 && (
                  <button
                    type="button"
                    onClick={() => mudarConversa([])}
                    title="Nova conversa"
                    className="flex size-10 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
                  >
                    <RotateCcw aria-hidden className="size-[18px]" />
                    <span className="sr-only">Nova conversa</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={fechar}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill border border-line-strong bg-surface-100 px-3.5 text-label hover:bg-surface-300"
                >
                  <X aria-hidden className="size-4" />
                  Fechar
                </button>
              </div>
            </div>
            <Conversa autoFoco className="flex-1" />
          </div>
        </>
      )}
    </>
  );
}
