"use client";

import { BadgeCheck } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

const TEXTOS = {
  agencia: {
    titulo: "Agência verificada",
    texto: "A equipe do Publike conferiu o CNPJ desta agência na Receita Federal.",
  },
  conta: {
    titulo: "Perfil verificado",
    texto: "A equipe do Publike conferiu os dados desta conta.",
  },
};

/**
 * O ícone de verificado com a explicação do que ele quer dizer. Abre ao passar o
 * mouse, com o teclado (foco) e com um toque no celular. A explicação vai para a
 * camada de cima (popover), então não é cortada por card com overflow nem pela
 * pilha do Descobrir.
 */
export function SeloVerificado({ agencia = false, className = "size-4" }: { agencia?: boolean; className?: string }) {
  const { titulo, texto } = agencia ? TEXTOS.agencia : TEXTOS.conta;
  const id = useId();
  const botao = useRef<HTMLButtonElement>(null);
  const balao = useRef<HTMLSpanElement>(null);
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; acima: boolean } | null>(null);

  const posicionar = useCallback(() => {
    const b = botao.current?.getBoundingClientRect();
    if (!b) return;
    const largura = Math.min(256, window.innerWidth - 24);
    const left = Math.min(Math.max(12, b.left + b.width / 2 - largura / 2), window.innerWidth - largura - 12);
    const acima = b.top > 120;
    setPos({ top: acima ? b.top - 8 : b.bottom + 8, left, acima });
  }, []);

  // mostra/esconde na camada de cima quando o navegador tem popover
  useEffect(() => {
    const el = balao.current;
    if (!el || typeof el.showPopover !== "function") return;
    try {
      if (aberto && !el.matches(":popover-open")) el.showPopover();
      if (!aberto && el.matches(":popover-open")) el.hidePopover();
    } catch {
      /* já estava no estado pedido */
    }
  }, [aberto]);

  // fecha ao rolar, mudar o tamanho da tela, apertar Esc ou tocar fora
  useEffect(() => {
    if (!aberto) return;
    const fechar = () => setAberto(false);
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    const fora = (e: PointerEvent) => {
      if (!botao.current?.contains(e.target as Node)) fechar();
    };
    window.addEventListener("scroll", fechar, { capture: true, passive: true });
    window.addEventListener("resize", fechar);
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fora);
    return () => {
      window.removeEventListener("scroll", fechar, { capture: true });
      window.removeEventListener("resize", fechar);
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fora);
    };
  }, [aberto]);

  function abrir() {
    posicionar();
    setAberto(true);
  }

  return (
    <>
      <button
        ref={botao}
        type="button"
        aria-label={titulo}
        aria-describedby={id}
        aria-expanded={aberto}
        onClick={(e) => {
          // dentro de um card clicável, o toque no selo não abre o anúncio
          e.preventDefault();
          e.stopPropagation();
          if (aberto) setAberto(false);
          else abrir();
        }}
        onPointerEnter={(e) => e.pointerType === "mouse" && abrir()}
        onPointerLeave={(e) => e.pointerType === "mouse" && setAberto(false)}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && abrir()}
        onBlur={() => setAberto(false)}
        className="relative z-10 -m-1 inline-flex shrink-0 cursor-help items-center justify-center rounded-pill p-1 text-cerrado-text outline-none focus-visible:outline-2 focus-visible:outline-focus"
      >
        <BadgeCheck aria-hidden className={className} />
      </button>
      {/* span (e não div): o selo fica dentro de parágrafos, e div dentro de p quebra a página */}
      <span
        ref={balao}
        id={id}
        role="tooltip"
        popover="manual"
        hidden={!aberto}
        style={
          pos
            ? {
                // o popover vem centralizado (inset: 0; margin: auto): troca pelo lugar do selo
                inset: "auto",
                margin: 0,
                position: "fixed",
                top: pos.top,
                left: pos.left,
                transform: pos.acima ? "translateY(-100%)" : undefined,
              }
            : undefined
        }
        className="z-50 block w-64 max-w-[calc(100vw-24px)] rounded-md border-0 bg-ink p-3 text-left text-body-sm font-normal tracking-normal text-surface-100 normal-case shadow-raised"
      >
        <span className="block font-semibold">{titulo}</span>
        <span className="mt-0.5 block">{texto}</span>
        <span className="mt-1.5 block opacity-80">Mesmo assim, nunca pague nada para conseguir trabalho.</span>
      </span>
    </>
  );
}
