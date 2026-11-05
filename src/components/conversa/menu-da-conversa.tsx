"use client";

import { Mail, MailOpen, MoreVertical } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { mudarLeituraDaConversa } from "@/lib/acoes/mensagens";

/**
 * O "…" de cada conversa da lista: "Marcar como não lida" (para responder depois) ou "Marcar como lida"
 * (claude/plano-lida-nao-lida.md). A não lida vale só para mim. `aoMudar` atualiza a lista na hora.
 */
export function MenuDaConversa({
  outroId,
  outroNome,
  naoLida,
  aoMudar,
}: {
  outroId: string;
  outroNome: string;
  /** a conversa tem mensagem nova ou está marcada como não lida */
  naoLida: boolean;
  aoMudar?: (lida: boolean) => void;
}) {
  const [aberto, setAberto] = useState(false);
  // perto do fim da lista (ou da tela), o menu abre para cima
  const [acima, setAcima] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);
  const id = useId();

  // fecha ao tocar fora ou com Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  function mudar() {
    const lida = naoLida;
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => mudarLeituraDaConversa(outroId, lida));
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setAberto(false);
      aoMudar?.(lida);
    });
  }

  const Icone = naoLida ? MailOpen : Mail;
  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        aria-label={`Mais opções da conversa com ${outroNome}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          // no celular, a barra de baixo cobre o fim da tela; no chat, a lista rola e corta o que passa dela
          const fim = window.innerHeight - (window.matchMedia("(max-width: 767px)").matches ? 80 : 0);
          const lista = e.currentTarget.closest("ul");
          const corte =
            lista && /auto|scroll/.test(getComputedStyle(lista).overflowY) ? lista.getBoundingClientRect() : null;
          const abaixo = Math.min(fim, corte?.bottom ?? fim) - r.bottom;
          setAcima(abaixo < 110 && r.top - Math.max(0, corte?.top ?? 0) > abaixo);
          setAberto((a) => !a);
        }}
        className="inline-flex size-10 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
      >
        <MoreVertical aria-hidden className="size-5" />
      </button>
      {aberto && (
        <div
          id={id}
          role="menu"
          className={`absolute right-0 z-30 w-56 rounded-md border border-line-strong bg-surface-100 p-1 shadow-raised ${
            acima ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          <button
            type="button"
            role="menuitem"
            disabled={pendente}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              mudar();
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-sm px-3 text-left text-body-sm hover:bg-surface-300 disabled:opacity-60"
          >
            <Icone aria-hidden className="size-4 shrink-0" />
            {naoLida ? "Marcar como lida" : "Marcar como não lida"}
          </button>
          {erro && (
            <p role="alert" className="px-3 pb-2 text-caption text-danger">
              {erro}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
