"use client";

import Link from "next/link";

/** A troca Cartões | Linhas em Vagas: o toque guarda a escolha (cookie de 1 ano) para a próxima vez. */
export function LembrarVisaoDasVagas({
  visao,
  href,
  ativa,
  nome,
}: {
  visao: "cartoes" | "linhas";
  href: string;
  ativa: boolean;
  nome: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={ativa ? "page" : undefined}
      onClick={() => {
        document.cookie = `publike_visao_vagas=${visao}; path=/; max-age=31536000; samesite=lax`;
      }}
      className={`inline-flex min-h-9 items-center rounded-pill px-3.5 text-label ${
        ativa ? "bg-ink text-surface-100" : "text-ink-muted hover:text-ink"
      }`}
    >
      {nome}
    </Link>
  );
}
