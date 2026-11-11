"use client";

import Link from "next/link";

/** A troca de visão em Vagas e em Candidatos: o toque guarda a escolha (cookie de 1 ano) para a próxima vez. */
export function LembrarVisaoDasVagas({
  visao,
  cookie = "publike_visao_vagas",
  href,
  ativa,
  children,
}: {
  visao: string;
  /** o cookie da tela (Vagas: publike_visao_vagas; Candidatos: publike_visao_candidatos) */
  cookie?: string;
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
        document.cookie = `${cookie}=${visao}; path=/; max-age=31536000; samesite=lax`;
      }}
      className={`relative inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-pill px-3 text-label whitespace-nowrap [&_svg]:size-4 [&_svg]:shrink-0 ${
        ativa ? "bg-ink text-surface-100 shadow-card" : "text-ink-muted hover:bg-surface-100/60 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
