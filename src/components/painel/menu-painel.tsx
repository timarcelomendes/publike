"use client";

import {
  BellRing,
  Briefcase,
  Check,
  ChevronDown,
  FileText,
  Heart,
  House,
  Inbox,
  MessagesSquare,
  Star,
  Store,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  COOKIE_MODO,
  modoDaRota,
  MODOS,
  OUTRAS,
  secaoAtiva,
  SECOES,
  type Contadores,
  type ModoPainel,
  type Secao,
} from "@/lib/modo-painel";

const ICONES: Record<Secao["icone"], LucideIcon> = {
  hoje: House,
  caixa: Inbox,
  candidatos: Users,
  vagas: Briefcase,
  conversas: MessagesSquare,
  curtidas: Heart,
  avisos: BellRing,
  curriculo: FileText,
  pedidos: Wrench,
  vitrine: Store,
  avaliacoes: Star,
};

function guardarModo(modo: ModoPainel) {
  document.cookie = `${COOKIE_MODO}=${modo}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

function lerCookie(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_MODO}=([^;]*)`));
  return m ? m[1] : null;
}

/**
 * O menu do painel: o modo (Contratar, Trabalhar, Serviços) no topo e as seções dele.
 * No computador fica na coluna da esquerda; no celular, o modo e as seções numa linha
 * que rola de lado, em cima da página.
 */
export function MenuPainel({
  modo: modoDoServidor,
  contadores,
  nome,
}: {
  modo: ModoPainel;
  contadores: Contadores;
  nome: string | null;
}) {
  const caminho = usePathname() ?? "/painel";
  const tipo = useSearchParams()?.get("tipo") ?? null;
  const router = useRouter();
  const daRota = modoDaRota(caminho, tipo);
  const modo = daRota ?? modoDoServidor;
  const ativa = secaoAtiva(modo, caminho, tipo);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const idMenu = useId();
  const atual = MODOS.find((m) => m.valor === modo) ?? MODOS[0];

  // abriu uma página de outro modo (um link de e-mail, por exemplo): o menu e a página Hoje vão junto
  useEffect(() => {
    if (daRota && lerCookie() !== daRota) guardarModo(daRota);
  }, [daRota]);

  // o menu dos modos fecha ao tocar fora e com Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  function escolher(novo: ModoPainel) {
    setAberto(false);
    guardarModo(novo);
    if (caminho === "/painel") router.refresh();
    else router.push("/painel");
  }

  const secoes = SECOES[modo];
  const outras = OUTRAS[modo];

  return (
    <nav aria-label="Seções do painel" className="flex flex-col gap-3 lg:gap-5">
      <div ref={caixa} className="relative">
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={idMenu}
          onClick={() => setAberto((a) => !a)}
          className="flex min-h-14 w-full items-center gap-3 rounded-md border border-line-strong bg-surface-200 px-3 py-2 text-left transition-colors hover:bg-surface-300"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-caption text-ink-muted uppercase">{atual.nome}</span>
            {nome && <span className="block truncate text-label">{nome}</span>}
          </span>
          <span className="text-body-sm text-ink-muted">Trocar</span>
          <ChevronDown aria-hidden className={`size-4 shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`} />
        </button>
        {aberto && (
          <ul
            id={idMenu}
            aria-label="Modos do painel"
            className="absolute top-full right-0 left-0 z-40 mt-1 rounded-md border border-line-strong bg-surface-200 py-1 shadow-raised"
          >
            {MODOS.map((m) => (
              <li key={m.valor}>
                <button
                  type="button"
                  aria-current={m.valor === modo ? "true" : undefined}
                  onClick={() => escolher(m.valor)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-300"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-label">{m.nome}</span>
                    <span className="block text-body-sm text-ink-muted">{m.ajuda}</span>
                  </span>
                  {m.valor === modo && <Check aria-hidden className="size-5 shrink-0 text-cerrado-text" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="sem-barra -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {secoes.map((s) => {
          const Icone = ICONES[s.icone];
          const n = s.contador ? contadores[s.contador] : 0;
          const atualSecao = ativa === s.href;
          return (
            <li key={s.href} className="shrink-0">
              <Link
                href={s.href}
                aria-current={atualSecao ? "page" : undefined}
                className={`relative flex min-h-11 items-center gap-2.5 rounded-pill px-3.5 text-label whitespace-nowrap transition-colors lg:rounded-md lg:px-3 ${
                  atualSecao
                    ? "bg-ink text-surface-100 lg:bg-surface-300 lg:text-ink"
                    : "border border-line-strong text-ink hover:bg-surface-300 lg:border-transparent"
                }`}
              >
                <Icone aria-hidden className="size-5 shrink-0" />
                <span className="lg:flex-1">{s.nome}</span>
                {n > 0 && (
                  <span
                    className={`min-w-6 rounded-pill px-1.5 text-center text-caption leading-6 tabular-nums ${
                      atualSecao ? "bg-surface-100 text-ink lg:bg-ink lg:text-surface-100" : "bg-ink text-surface-100"
                    }`}
                  >
                    {n > 99 ? "99+" : n}
                    <span className="sr-only"> novos</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
        {/* no celular, o resto do painel vem na mesma linha, mais discreto */}
        {outras.map((o) => (
          <li key={o.href} className="shrink-0 lg:hidden">
            <Link
              href={o.href}
              aria-current={ativa === o.href ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-pill px-3.5 text-body-sm whitespace-nowrap ${
                ativa === o.href ? "bg-ink text-surface-100" : "text-ink-muted underline underline-offset-2"
              }`}
            >
              {o.nome}
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden flex-col gap-1 border-t border-line pt-3 lg:flex">
        <p className="px-3 text-caption text-ink-muted uppercase">Mais</p>
        <ul className="flex flex-col">
          {outras.map((o) => (
            <li key={o.href}>
              <Link
                href={o.href}
                aria-current={ativa === o.href ? "page" : undefined}
                className={`flex min-h-10 items-center rounded-md px-3 text-body-sm transition-colors hover:bg-surface-300 ${
                  ativa === o.href ? "bg-surface-300 font-semibold text-ink" : "text-ink-muted"
                }`}
              >
                {o.nome}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

/** O menu enquanto o servidor ainda lê a conta: o mesmo tamanho, sem números. */
export function MenuPainelEsqueleto() {
  return (
    <div aria-hidden className="flex flex-col gap-3 lg:gap-5">
      <div className="h-14 animate-pulse rounded-md bg-surface-300" />
      <div className="flex gap-2 overflow-hidden lg:flex-col">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-11 w-32 shrink-0 animate-pulse rounded-md bg-surface-300 lg:w-full" />
        ))}
      </div>
    </div>
  );
}
