"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/painel", nome: "Meus anúncios" },
  // só para comércio, empresa e agência (quem contrata); pessoa vê os candidatos em cada vaga
  { href: "/painel/candidatos", nome: "Candidatos" },
  { href: "/painel/servicos", nome: "Meus serviços" },
  { href: "/painel/curtidas", nome: "Minhas curtidas" },
  { href: "/painel/matches", nome: "Matches" },
  { href: "/painel/conversas", nome: "Conversas" },
] as const;

function abaAtiva(caminho: string | null) {
  if (!caminho) return null;
  if (caminho.startsWith("/painel/curtidas")) return "/painel/curtidas";
  if (caminho.startsWith("/painel/candidatos")) return "/painel/candidatos";
  if (caminho.startsWith("/painel/servicos") || caminho.startsWith("/painel/avaliacoes")) return "/painel/servicos";
  if (caminho.startsWith("/painel/matches")) return "/painel/matches";
  if (caminho.startsWith("/painel/conversas")) return "/painel/conversas";
  return "/painel";
}

export function AbasBase({ ativa, candidatos = false }: { ativa: string | null; candidatos?: boolean }) {
  return (
    <nav
      aria-label="Seções do painel"
      className="sem-barra -mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
    >
      {ABAS.filter((a) => candidatos || a.href !== "/painel/candidatos").map((a) => {
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

export function AbasPainel({ candidatos }: { candidatos: boolean }) {
  return <AbasBase ativa={abaAtiva(usePathname())} candidatos={candidatos} />;
}
