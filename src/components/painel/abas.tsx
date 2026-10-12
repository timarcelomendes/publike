"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef } from "react";

type Aba = { href: string; nome: string; soQuemContrata?: boolean };

/**
 * As seções do painel, pelos dois lados da conta: o que a pessoa oferece (o que
 * publicou) e o que ela procura (o que curtiu ou pediu), mais os contatos.
 */
const GRUPOS: { nome: string | null; abas: Aba[] }[] = [
  { nome: null, abas: [{ href: "/painel", nome: "Visão geral" }] },
  {
    nome: "Ofereço",
    abas: [
      { href: "/painel/anuncios", nome: "Meus anúncios" },
      // só para comércio, empresa e agência (quem contrata); pessoa vê os candidatos em cada vaga
      { href: "/painel/candidatos", nome: "Candidatos", soQuemContrata: true },
      { href: "/painel/servicos", nome: "Meus serviços" },
    ],
  },
  { nome: "Procuro", abas: [{ href: "/painel/curtidas", nome: "Minhas curtidas" }] },
  {
    nome: "Contatos",
    abas: [
      { href: "/painel/matches", nome: "Matches" },
      { href: "/painel/conversas", nome: "Conversas" },
    ],
  },
];

function abaAtiva(caminho: string | null, candidatos: boolean) {
  if (!caminho) return null;
  if (caminho === "/painel" || caminho === "/painel/") return "/painel";
  // a lista e a página de cada anúncio (quem curtiu, editar)
  if (caminho.startsWith("/painel/anuncio")) return "/painel/anuncios";
  if (caminho.startsWith("/painel/candidatos")) return candidatos ? "/painel/candidatos" : "/painel/anuncios";
  if (caminho.startsWith("/painel/servicos") || caminho.startsWith("/painel/avaliacoes")) return "/painel/servicos";
  if (caminho.startsWith("/painel/curtidas")) return "/painel/curtidas";
  if (caminho.startsWith("/painel/matches")) return "/painel/matches";
  if (caminho.startsWith("/painel/conversas")) return "/painel/conversas";
  return null;
}

export function AbasBase({ ativa, candidatos = false }: { ativa: string | null; candidatos?: boolean }) {
  const barra = useRef<HTMLElement>(null);

  // no celular as abas rolam de lado: a aba aberta fica à vista
  useEffect(() => {
    const nav = barra.current;
    const atual = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !atual) return;
    const inicio = atual.offsetLeft;
    const fim = inicio + atual.offsetWidth;
    if (inicio < nav.scrollLeft || fim > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = Math.max(0, inicio - 48);
  }, [ativa]);

  const link = (a: Aba, solta: boolean) => {
    const atual = ativa === a.href;
    return (
      <Link
        key={a.href}
        href={a.href}
        aria-current={atual ? "page" : undefined}
        className={`inline-flex min-h-12 shrink-0 items-center border-b-2 px-3 text-label transition-colors ${
          solta ? "-mb-px" : ""
        } ${atual ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
      >
        {a.nome}
      </Link>
    );
  };

  return (
    <nav
      ref={barra}
      aria-label="Seções do painel"
      className="sem-barra relative -mx-4 mt-4 flex overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
    >
      {GRUPOS.map((g) => {
        const abas = g.abas.filter((a) => candidatos || !a.soQuemContrata);
        if (!g.nome) return <Fragment key="geral">{abas.map((a) => link(a, true))}</Fragment>;
        return (
          <div key={g.nome} role="group" aria-label={g.nome} className="-mb-px flex shrink-0 items-stretch">
            <span aria-hidden className="mx-2 h-5 w-px shrink-0 self-center bg-line-strong" />
            <span aria-hidden className="flex items-center pr-1 pl-1 text-caption text-ink-muted uppercase">
              {g.nome}
            </span>
            {abas.map((a) => link(a, false))}
          </div>
        );
      })}
    </nav>
  );
}

export function AbasPainel({ candidatos }: { candidatos: boolean }) {
  return <AbasBase ativa={abaAtiva(usePathname(), candidatos)} candidatos={candidatos} />;
}
