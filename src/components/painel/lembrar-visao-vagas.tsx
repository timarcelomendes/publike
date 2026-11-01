"use client";

import Link from "next/link";

/** A troca Cartões | Linhas em Vagas: o toque guarda a escolha (cookie de 1 ano) para a próxima vez. */
export function LembrarVisaoDasVagas({
  visao,
  href,
  ativa,
  nome,
  children,
}: {
  visao: "cartoes" | "linhas";
  href: string;
  ativa: boolean;
  nome: string;
  /** o ícone (o nome fica no title e para o leitor de tela) */
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={ativa ? "page" : undefined}
      onClick={() => {
        document.cookie = `publike_visao_vagas=${visao}; path=/; max-age=31536000; samesite=lax`;
      }}
      aria-label={children ? nome : undefined}
      title={children ? nome : undefined}
      className={`inline-flex min-h-9 items-center justify-center rounded-pill text-label ${children ? "min-w-9" : "px-3.5"} ${
        ativa ? "bg-surface-100 text-ink shadow-card" : "text-ink-muted hover:text-ink"
      }`}
    >
      {children ?? nome}
    </Link>
  );
}
