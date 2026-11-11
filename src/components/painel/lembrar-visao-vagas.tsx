"use client";

import Link from "next/link";
import type { VisaoDasVagas } from "@/lib/visoes-das-vagas";

/** A troca de visão em Vagas: o toque guarda a escolha (cookie de 1 ano) para a próxima vez. */
export function LembrarVisaoDasVagas({
  visao,
  href,
  ativa,
  children,
}: {
  visao: VisaoDasVagas;
  href: string;
  ativa: boolean;
  /** o ícone e o nome */
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={ativa ? "page" : undefined}
      onClick={() => {
        document.cookie = `publike_visao_vagas=${visao}; path=/; max-age=31536000; samesite=lax`;
      }}
      className={`relative inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-pill px-3 text-label whitespace-nowrap [&_svg]:size-4 [&_svg]:shrink-0 ${
        ativa ? "bg-surface-100 text-ink shadow-card" : "text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
