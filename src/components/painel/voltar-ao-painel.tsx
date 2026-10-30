"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * "‹ Painel" no alto das páginas do painel, no celular (claude/plano-painel-simples.md): de qualquer página
 * (Candidatos, uma vaga, uma conversa) se volta ao Hoje com um toque. No computador, o menu ao lado já faz isso.
 */
export function VoltarAoPainel() {
  const caminho = usePathname() ?? "/painel";
  if (caminho === "/painel" || caminho === "/painel/") return null;
  return (
    <Link
      href="/painel"
      className="-mb-4 inline-flex min-h-11 items-center gap-1 self-start text-label text-ink-muted hover:text-ink lg:hidden"
    >
      <ChevronLeft aria-hidden className="size-5" />
      Painel
    </Link>
  );
}
