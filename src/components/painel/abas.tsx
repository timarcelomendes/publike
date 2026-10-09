"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/painel", nome: "Meus anúncios" },
  { href: "/painel/servicos", nome: "Meus serviços" },
  { href: "/painel/curtidas", nome: "Minhas curtidas" },
  { href: "/painel/matches", nome: "Matches" },
] as const;

function abaAtiva(caminho: string | null) {
  if (!caminho) return null;
  if (caminho.startsWith("/painel/curtidas")) return "/painel/curtidas";
  if (caminho.startsWith("/painel/servicos") || caminho.startsWith("/painel/avaliacoes")) return "/painel/servicos";
  if (caminho.startsWith("/painel/matches")) return "/painel/matches";
  return "/painel";
}

export function AbasBase({ ativa }: { ativa: string | null }) {
  return (
    <nav aria-label="Seções do painel" className="sem-barra -mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      {ABAS.map((a) => {
        const atual = ativa === a.href;
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={atual ? "page" : undefined}
            className={`-mb-px inline-flex min-h-12 shrink-0 items-center border-b-2 px-3 text-label transition-colors ${
              atual ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {a.nome}
          </Link>
        );
      })}
    </nav>
  );
}

export function AbasPainel() {
  return <AbasBase ativa={abaAtiva(usePathname())} />;
}
