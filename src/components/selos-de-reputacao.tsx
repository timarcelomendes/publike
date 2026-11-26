"use client";

import { Handshake, MessageCircleReply, Star, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { selosVisiveis, type ChaveDoSelo, type Selos, type SeloVisivel } from "@/lib/selos";

// Os selos de reputação de quem publica vaga (migração 20271004120000; src/lib/selos.ts): "Responde rápido", "Bem
// avaliada" e "Contratou pelo Publike", em pílulas verdes (cerrado: deu certo). A explicação abre como a do selo de
// verificada: ao passar o mouse, com o teclado e com um toque no celular.

const ICONES: Record<ChaveDoSelo, LucideIcon> = {
  responde: MessageCircleReply,
  avaliada: Star,
  contratou: Handshake,
};

const PILULA =
  "inline-flex shrink-0 items-center gap-1 rounded-pill bg-cerrado/10 px-2 py-0.5 text-[13px] leading-[18px] font-semibold whitespace-nowrap text-cerrado-text";

/**
 * Os selos de quem publicou. `estatico`: só as pílulas, sem a explicação (dentro do tíquete da linha do tempo, onde o
 * toque segue para o link da vaga).
 */
export function SelosDeReputacao({
  selos,
  tipo,
  className = "",
  estatico = false,
}: {
  selos: Selos | null | undefined;
  /** o tipo da conta de quem publicou (o texto diz "a empresa", "a agência" ou "quem publicou") */
  tipo?: string | null;
  className?: string;
  estatico?: boolean;
}) {
  const lista = selosVisiveis(selos, tipo);
  if (!lista.length) return null;
  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {lista.map((s) =>
        estatico ? <PilulaDoSelo key={s.chave} selo={s} /> : <SeloComExplicacao key={s.chave} selo={s} />,
      )}
    </span>
  );
}

/** Uma pílula sem a explicação (o tíquete da linha do tempo). */
export function PilulaDoSelo({ selo, className = "" }: { selo: SeloVisivel; className?: string }) {
  const Icone = ICONES[selo.chave];
  return (
    <span className={`${PILULA} ${className}`} title={selo.explicacao}>
      <Icone aria-hidden className="size-3.5" />
      {selo.texto}
    </span>
  );
}

function SeloComExplicacao({ selo }: { selo: SeloVisivel }) {
  const Icone = ICONES[selo.chave];
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
        aria-describedby={id}
        aria-expanded={aberto}
        onClick={(e) => {
          // dentro de um cartão clicável, o toque no selo não abre o anúncio
          e.preventDefault();
          e.stopPropagation();
          if (aberto) setAberto(false);
          else abrir();
        }}
        onPointerEnter={(e) => e.pointerType === "mouse" && abrir()}
        onPointerLeave={(e) => e.pointerType === "mouse" && setAberto(false)}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && abrir()}
        onBlur={() => setAberto(false)}
        className={`${PILULA} relative z-10 cursor-help outline-none focus-visible:outline-2 focus-visible:outline-focus`}
      >
        <Icone aria-hidden className="size-3.5" />
        {selo.texto}
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
                inset: "auto",
                margin: 0,
                position: "fixed",
                top: pos.top,
                left: pos.left,
                transform: pos.acima ? "translateY(-100%)" : undefined,
              }
            : undefined
        }
        className="z-50 block w-64 max-w-[calc(100vw-24px)] rounded-md border-0 bg-ink p-3 text-left text-body-sm font-normal tracking-normal whitespace-normal text-surface-100 normal-case shadow-raised"
      >
        <span className="block font-semibold">{selo.texto}</span>
        <span className="mt-0.5 block">{selo.explicacao}</span>
        <span className="mt-1.5 block opacity-80">O Publike refaz a conta a cada meia hora, pelo que acontece aqui.</span>
      </span>
    </>
  );
}
