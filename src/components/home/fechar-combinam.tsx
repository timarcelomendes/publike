"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { COOKIE_COMBINAM_FECHADO } from "@/lib/combinam-fechado";

const TRINTA_DIAS = 30 * 24 * 3600;

function gravar(valor: string | null) {
  document.cookie = valor
    ? `${COOKIE_COMBINAM_FECHADO}=${valor}; max-age=${TRINTA_DIAS}; path=/; samesite=lax`
    : `${COOKIE_COMBINAM_FECHADO}=; max-age=0; path=/; samesite=lax`;
}

/** O bloco "Combinam com você" com o X para fechar; fechado, vira uma linha com "Desfazer" e onde achar de novo. */
export function BlocoFechavel({
  titulo,
  icone,
  verTodos,
  rotulo,
  ondeAchar,
  children,
}: {
  titulo: string;
  icone: ReactNode;
  verTodos: string;
  rotulo: string;
  ondeAchar: { href: string; nome: string };
  children: ReactNode;
}) {
  const [fechado, setFechado] = useState(false);
  if (fechado) {
    return (
      <p role="status" className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-body-sm text-ink-muted">
        Escondido por 30 dias neste aparelho. Veja em
        <Link href={ondeAchar.href} className="font-semibold text-ink underline underline-offset-2">
          {ondeAchar.nome}
        </Link>
        <span aria-hidden>·</span>
        <button
          type="button"
          onClick={() => {
            gravar(null);
            setFechado(false);
          }}
          className="min-h-9 font-semibold text-terra-text underline underline-offset-2"
        >
          Desfazer
        </button>
      </p>
    );
  }
  return (
    <section
      aria-labelledby="combinam-titulo"
      className="mb-6 rounded-lg border border-line bg-surface-200 p-2 shadow-card"
    >
      <div className="flex items-center justify-between gap-3 px-3 pt-2 pb-1">
        <h2 id="combinam-titulo" className="flex min-w-0 items-center gap-2 text-label">
          {icone}
          {titulo}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={verTodos}
            className="text-body-sm font-semibold text-terra-text underline-offset-2 hover:underline"
          >
            {rotulo}
          </Link>
          <button
            type="button"
            aria-label={`Fechar “${titulo}”`}
            title="Fechar"
            onClick={() => {
              gravar("1");
              setFechado(true);
            }}
            className="-mr-1 inline-flex size-9 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
          >
            <X aria-hidden className="size-[18px]" />
          </button>
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-x-2 sm:grid-cols-2">{children}</ul>
    </section>
  );
}
