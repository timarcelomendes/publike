"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * O resto de uma lista longa: fica escondido até o toque em "Ver mais 7 experiências" e fecha de novo em "Ver
 * menos". `item`: o botão vai num `<li>` (os escondidos também são `<li>`, no fim da mesma lista); `pilula`: o
 * botão tem a forma das pílulas da lista (habilidades, cursos).
 */
export function VerMais({
  mais,
  menos = "Ver menos",
  item = false,
  pilula = false,
  children,
}: {
  mais: string;
  menos?: string;
  item?: boolean;
  pilula?: boolean;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const botao = (
    <button
      type="button"
      aria-expanded={aberto}
      onClick={() => setAberto((a) => !a)}
      className={
        pilula
          ? "inline-flex min-h-8 items-center gap-1 rounded-pill border border-line-strong px-2.5 text-body-sm hover:bg-surface-300"
          : "inline-flex min-h-10 items-center gap-1.5 self-start text-label underline-offset-2 hover:underline"
      }
    >
      <ChevronDown aria-hidden className={`size-4 text-ink-muted transition-transform ${aberto ? "rotate-180" : ""}`} />
      {aberto ? menos : mais}
    </button>
  );
  return (
    <>
      {aberto && children}
      {item ? <li className="flex">{botao}</li> : botao}
    </>
  );
}
