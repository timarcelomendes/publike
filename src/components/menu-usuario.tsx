"use client";

import {
  ChevronDown,
  Eye,
  LayoutDashboard,
  LogOut,
  MessageCircleHeart,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { sair } from "@/lib/acoes/perfil";
import { Avatar } from "./ui/basicos";

function Item({ href, icone: Icone, children }: { href: string; icone: LucideIcon; children: ReactNode }) {
  return (
    <Link href={href} className="flex min-h-11 items-center gap-3 rounded-sm px-3 text-body-sm text-ink hover:bg-surface-300">
      <Icone aria-hidden className="size-[18px] text-ink-muted" />
      {children}
    </Link>
  );
}

export function MenuUsuario({
  nome,
  foto,
  perfilId,
  temPerfil,
  moderador,
}: {
  nome: string;
  foto: string | null;
  perfilId: string;
  temPerfil: boolean;
  moderador: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls="menu-conta"
        onClick={() => setAberto((v) => !v)}
        className="flex min-h-11 items-center gap-1 rounded-pill p-1 hover:bg-surface-300"
      >
        <Avatar nome={nome} foto={foto} tamanho={34} />
        <ChevronDown aria-hidden className="hidden size-4 text-ink-muted sm:block" />
        <span className="sr-only">Menu da conta</span>
      </button>
      {aberto && (
        <div
          id="menu-conta"
          className="absolute top-full right-0 mt-2 w-64 rounded-md border border-line bg-surface-200 p-2 shadow-raised"
        >
          <p className="truncate px-3 pt-1 pb-2 text-label">{nome}</p>
          <nav aria-label="Conta" className="flex flex-col" onClick={() => setAberto(false)}>
            <Item href="/painel" icone={LayoutDashboard}>
              Meu painel
            </Item>
            <Item href="/painel/matches" icone={MessageCircleHeart}>
              Matches
            </Item>
            <Item href="/perfil" icone={UserRound}>
              Editar perfil
            </Item>
            {temPerfil && (
              <Item href={`/perfil/${perfilId}`} icone={Eye}>
                Ver meu perfil público
              </Item>
            )}
            {moderador && (
              <Item href="/admin/denuncias" icone={ShieldCheck}>
                Moderação
              </Item>
            )}
          </nav>
          <form action={sair} className="mt-1 border-t border-line pt-1">
            <button
              type="submit"
              className="flex min-h-11 w-full items-center gap-3 rounded-sm px-3 text-body-sm text-ink hover:bg-surface-300"
            >
              <LogOut aria-hidden className="size-[18px] text-ink-muted" />
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
