"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Aba = { href: string; nome: string };

/**
 * As seções do painel numa linha só, na ordem do que cada conta mais usa; o resto
 * fica em "Mais". Quem contrata (comércio, empresa, agência) vê primeiro as vagas e
 * os candidatos; quem é pessoa vê primeiro o que curtiu e as conversas.
 */
const ABAS: Record<"contrata" | "pessoa", { principais: Aba[]; mais: Aba[] }> = {
  contrata: {
    principais: [
      { href: "/painel", nome: "Visão geral" },
      { href: "/painel/anuncios", nome: "Minhas vagas" },
      { href: "/painel/candidatos", nome: "Candidatos" },
      { href: "/painel/conversas", nome: "Conversas" },
    ],
    mais: [
      { href: "/painel/matches", nome: "Matches" },
      { href: "/painel/servicos", nome: "Meus serviços" },
      { href: "/painel/curtidas", nome: "Minhas curtidas" },
      { href: "/painel/seguindo", nome: "Seguindo" },
    ],
  },
  pessoa: {
    principais: [
      { href: "/painel", nome: "Visão geral" },
      { href: "/painel/curtidas", nome: "Minhas curtidas" },
      { href: "/painel/conversas", nome: "Conversas" },
      { href: "/painel/servicos", nome: "Meus serviços" },
    ],
    mais: [
      { href: "/painel/matches", nome: "Matches" },
      { href: "/painel/anuncios", nome: "Meus anúncios" },
      { href: "/painel/seguindo", nome: "Seguindo" },
    ],
  },
};

function abaAtiva(caminho: string | null, contrata: boolean) {
  if (!caminho) return null;
  if (caminho === "/painel" || caminho === "/painel/") return "/painel";
  // a lista e a página de cada anúncio (quem curtiu, quadro, editar)
  if (caminho.startsWith("/painel/anuncio")) return "/painel/anuncios";
  if (caminho.startsWith("/painel/candidatos")) return contrata ? "/painel/candidatos" : "/painel/anuncios";
  if (caminho.startsWith("/painel/servicos") || caminho.startsWith("/painel/avaliacoes")) return "/painel/servicos";
  for (const s of ["curtidas", "seguindo", "matches", "conversas"]) {
    if (caminho.startsWith(`/painel/${s}`)) return `/painel/${s}`;
  }
  return null;
}

const classeAba = (atual: boolean) =>
  `-mb-px inline-flex min-h-12 shrink-0 items-center gap-1 border-b-2 px-3 text-label whitespace-nowrap transition-colors ${
    atual ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
  }`;

export function AbasBase({ ativa, candidatos = false }: { ativa: string | null; candidatos?: boolean }) {
  const barra = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const { principais, mais } = ABAS[candidatos ? "contrata" : "pessoa"];
  const ativaNoMais = mais.find((a) => a.href === ativa) ?? null;

  // no celular as abas rolam de lado: a aba aberta fica à vista
  useEffect(() => {
    const nav = barra.current;
    const atual = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !atual) return;
    const inicio = atual.offsetLeft;
    const fim = inicio + atual.offsetWidth;
    if (inicio < nav.scrollLeft || fim > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = Math.max(0, inicio - 48);
  }, [ativa]);

  // "Mais" fecha ao escolher, ao tocar fora e com Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  return (
    <div className="relative -mx-4 mt-4 flex border-b border-line px-4 sm:mx-0 sm:px-0">
      <nav ref={barra} aria-label="Seções do painel" className="sem-barra flex min-w-0 overflow-x-auto">
        {principais.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            aria-current={ativa === a.href ? "page" : undefined}
            className={classeAba(ativa === a.href)}
          >
            {a.nome}
          </Link>
        ))}
        {/* aberta uma seção do "Mais", ela aparece na linha também */}
        {ativaNoMais && (
          <Link href={ativaNoMais.href} aria-current="page" className={classeAba(true)}>
            {ativaNoMais.nome}
          </Link>
        )}
      </nav>
      <div ref={menu} className="relative shrink-0">
        <button
          type="button"
          aria-expanded={aberto}
          aria-haspopup="true"
          onClick={() => setAberto((a) => !a)}
          className={classeAba(false)}
        >
          Mais
          <ChevronDown aria-hidden className={`size-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
        </button>
        {aberto && (
          <ul className="absolute top-full right-0 z-40 sm:right-auto sm:left-0 mt-1 w-52 rounded-md border border-line-strong bg-surface-200 py-1 shadow-raised">
            {mais.map((a) => (
              <li key={a.href}>
                <Link
                  href={a.href}
                  aria-current={ativa === a.href ? "page" : undefined}
                  onClick={() => setAberto(false)}
                  className={`flex min-h-11 items-center px-4 text-label hover:bg-surface-300 ${
                    ativa === a.href ? "text-ink" : "text-ink-muted"
                  }`}
                >
                  {a.nome}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function AbasPainel({ candidatos }: { candidatos: boolean }) {
  return <AbasBase ativa={abaAtiva(usePathname(), candidatos)} candidatos={candidatos} />;
}
