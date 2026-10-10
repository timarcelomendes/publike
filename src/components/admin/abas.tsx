"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ModoAdmin = "admin" | "moderador" | null;

const ABAS_ADMIN = [
  { href: "/admin", nome: "Painel" },
  { href: "/admin/usuarios", nome: "Usuários" },
  { href: "/admin/anuncios", nome: "Anúncios" },
  { href: "/admin/denuncias", nome: "Denúncias" },
  { href: "/admin/sugestoes", nome: "Sugestões" },
  { href: "/admin/emails", nome: "E-mails" },
  { href: "/admin/ia", nome: "IA" },
  { href: "/admin/moderadores", nome: "Moderadores" },
  { href: "/admin/chaves", nome: "Chaves" },
];

const ABAS_MODERACAO = [
  { href: "/admin/denuncias", nome: "Denúncias" },
  { href: "/admin/anuncios", nome: "Anúncios" },
];

function abaAtiva(caminho: string | null, abas: { href: string }[]) {
  if (!caminho) return null;
  // a aba com o caminho mais longo que combina (o Painel só combina exato)
  return (
    abas
      .filter((a) =>
        a.href === "/admin" ? caminho === "/admin" : caminho === a.href || caminho.startsWith(`${a.href}/`),
      )
      .sort((x, y) => y.href.length - x.href.length)[0]?.href ?? null
  );
}

export function AbasAdminBase({ modo, ativa }: { modo: ModoAdmin; ativa: string | null }) {
  const abas = modo === "admin" ? ABAS_ADMIN : modo === "moderador" ? ABAS_MODERACAO : [];
  if (!abas.length) return null;
  return (
    <nav
      aria-label="Seções do admin"
      className="sem-barra -mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
    >
      {abas.map((a) => {
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

export function AbasAdmin({ modo }: { modo: ModoAdmin }) {
  const caminho = usePathname();
  const abas = modo === "admin" ? ABAS_ADMIN : ABAS_MODERACAO;
  return <AbasAdminBase modo={modo} ativa={abaAtiva(caminho, abas)} />;
}
