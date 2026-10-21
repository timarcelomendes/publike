"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Link do menu do topo, sublinhado na página aberta. */
export function LinkTopo({ href, children }: { href: string; children: ReactNode }) {
  const caminho = usePathname() ?? "";
  const ativo = href === "/" ? caminho === "/" : caminho.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={`relative inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-label transition-colors hover:bg-surface-300 hover:text-ink ${
        ativo
          ? "text-ink after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:rounded-pill after:bg-ink"
          : "text-ink-muted"
      }`}
    >
      {children}
    </Link>
  );
}
