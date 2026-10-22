"use client";

import {
  BadgeCheck,
  BellRing,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Eye,
  FileText,
  Handshake,
  Heart,
  House,
  Inbox,
  Link2,
  MessagesSquare,
  Send,
  Star,
  Store,
  UserSearch,
  Users,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { trocarConta } from "@/lib/acoes/equipe";
import { PAPEIS_EQUIPE, type ContaDisponivel, type PapelNaConta } from "@/lib/equipe";
import { verComoPessoa } from "../faixa-so-olhar";
import {
  COOKIE_MODO,
  gruposDoModo,
  modoDaRota,
  MODOS,
  OUTRAS,
  secaoAtiva,
  type Contadores,
  type ModoPainel,
  type Secao,
} from "@/lib/modo-painel";

const ICONES: Record<Secao["icone"], LucideIcon> = {
  hoje: House,
  caixa: Inbox,
  talentos: UserSearch,
  candidatos: Users,
  vagas: Briefcase,
  conversas: MessagesSquare,
  curtidas: Heart,
  avisos: BellRing,
  curriculo: FileText,
  pedidos: Wrench,
  vitrine: Store,
  avaliacoes: Star,
  clientes: Building2,
  equipe: UsersRound,
  conexoes: Handshake,
  finalistas: Send,
  contratados: BadgeCheck,
  links: Link2,
  entrevistas: CalendarDays,
  visitas: Eye,
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
  modos = MODOS.map((m) => m.valor),
  contadores,
  nome,
  tipoConta = null,
  contas = [],
  papel = "dono",
}: {
  modo: ModoPainel;
  /** os modos que a conta usa (marcados no perfil): só eles aparecem para trocar */
  modos?: ModoPainel[];
  contadores: Contadores;
  nome: string | null;
  /** o tipo da conta (agência ganha "Clientes" e "Equipe" em Contratar) */
  tipoConta?: string | null;
  /** as contas pelas quais a pessoa pode agir (a dela e as das equipes): com mais de uma, dá para trocar */
  contas?: ContaDisponivel[];
  /** o papel na conta atual (quem é da equipe age pela agência) */
  papel?: PapelNaConta;
}) {
  const caminho = usePathname() ?? "/painel";
  const busca = useSearchParams();
  const tipo = busca?.get("tipo") ?? null;
  const aba = busca?.get("aba") ?? null;
  const router = useRouter();
  const daRota = modoDaRota(caminho, tipo);
  const modo = daRota ?? modoDoServidor;
  const ativa = secaoAtiva(modo, caminho, tipo, tipoConta, aba);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const idMenu = useId();
  const atual = MODOS.find((m) => m.valor === modo) ?? MODOS[0];
  const [trocando, iniciarTroca] = useTransition();
  // os modos para trocar: os da conta (e o da página aberta, se veio por um link de outro modo)
  const opcoes = MODOS.filter((m) => modos.includes(m.valor) || m.valor === modo);
  // empresa, comércio e agência: "Ver como pessoa · só olhar" (o Publike de quem procura trabalho, sem agir)
  const comoPessoa = Boolean(tipoConta) && tipoConta !== "pessoa";
  // um modo só, uma conta só e nada para ver como pessoa: o topo não abre nada (o "Mudar" leva ao perfil)
  const semTroca = opcoes.length <= 1 && contas.length <= 1 && !comoPessoa;
  const [erroTroca, setErroTroca] = useState<string | null>(null);

  function agirComo(conta: ContaDisponivel) {
    if (conta.atual) return setAberto(false);
    setErroTroca(null);
    iniciarTroca(async () => {
      const r = await trocarConta(conta.conta_id);
      if (!r.ok) {
        if (r.ir) router.push(r.ir);
        return setErroTroca(r.erro);
      }
      setAberto(false);
      guardarModo(conta.tipo === "agencia" ? "contratar" : "trabalhar");
      if (caminho !== "/") router.push("/painel");
      router.refresh();
    });
  }

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
    // na home e no Hoje, a mesma página muda de modo; nas outras, vai para o Hoje
    if (caminho === "/painel" || caminho === "/") router.refresh();
    else router.push("/painel");
  }

  const grupos = gruposDoModo(modo, tipoConta);
  const outras = OUTRAS[modo];

  // o número de uma seção: pílula (pede ação), "N pronto(s)" (para o cliente) ou texto discreto
  function numero(s: Secao, atualSecao: boolean) {
    const n = s.contador ? (contadores[s.contador] ?? 0) : 0;
    const jeito = s.jeito ?? "pilula";
    if (jeito === "texto") {
      if (!s.contador || (n === 0 && !s.passo)) return null;
      return (
        <span className="ml-auto text-body-sm font-semibold text-ink-muted tabular-nums">
          {n}
          {s.sufixo && n > 0 ? ` ${s.sufixo}` : ""}
        </span>
      );
    }
    if (n <= 0) return null;
    if (jeito === "pronto") {
      return (
        <span className="ml-auto rounded-pill bg-terra-soft px-2 text-caption leading-6 text-terra-text tabular-nums normal-case">
          {n} {n === 1 ? "pronto" : "prontos"}
        </span>
      );
    }
    return (
      <span
        className={`ml-auto min-w-6 rounded-pill px-1.5 text-center text-caption leading-6 tabular-nums ${
          atualSecao ? "bg-surface-100 text-ink lg:bg-ink lg:text-surface-100" : "bg-ink text-surface-100"
        }`}
      >
        {n > 99 ? "99+" : n}
        <span className="sr-only"> novos</span>
      </span>
    );
  }

  return (
    <nav aria-label="Seções do painel" className="flex flex-col gap-3 lg:gap-5">
      <div ref={caixa} className="relative">
        {semTroca ? (
          <div className="flex min-h-14 w-full items-center gap-3 rounded-md border border-line-strong bg-surface-200 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-caption text-ink-muted uppercase">
                {atual.nome}
                {papel !== "dono" && ` · ${PAPEIS_EQUIPE[papel].nome}`}
              </span>
              {nome && <span className="block truncate text-label">{nome}</span>}
            </span>
            {papel === "dono" || papel === "admin" ? (
              <Link
                href="/perfil#modos"
                className="text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Mudar
                <span className="sr-only"> o que você faz no Publike</span>
              </Link>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={aberto}
            aria-controls={idMenu}
            onClick={() => setAberto((a) => !a)}
            className="flex min-h-14 w-full items-center gap-3 rounded-md border border-line-strong bg-surface-200 px-3 py-2 text-left transition-colors hover:bg-surface-300"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-caption text-ink-muted uppercase">
                {atual.nome}
                {papel !== "dono" && ` · ${PAPEIS_EQUIPE[papel].nome}`}
              </span>
              {nome && <span className="block truncate text-label">{nome}</span>}
            </span>
            <span className="text-body-sm text-ink-muted">Trocar</span>
            <ChevronDown aria-hidden className={`size-4 shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`} />
          </button>
        )}
        {aberto && (
          <div
            id={idMenu}
            className="absolute top-full right-0 left-0 z-40 mt-1 rounded-md border border-line-strong bg-surface-200 py-1 shadow-raised"
          >
            {contas.length > 1 && (
              <>
                <p className="px-4 pt-2 pb-1 text-caption text-ink-muted uppercase">Agir como</p>
                <ul aria-label="Contas" className="border-b border-line pb-1">
                  {contas.map((c) => (
                    <li key={c.conta_id}>
                      <button
                        type="button"
                        aria-current={c.atual ? "true" : undefined}
                        disabled={trocando}
                        onClick={() => agirComo(c)}
                        className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-300 disabled:opacity-60"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-label">{c.nome}</span>
                          <span className="block text-body-sm text-ink-muted">
                            {c.papel === "dono" ? "Sua conta" : `Equipe · ${PAPEIS_EQUIPE[c.papel].nome}`}
                          </span>
                        </span>
                        {c.atual && <Check aria-hidden className="size-5 shrink-0 text-cerrado-text" />}
                      </button>
                    </li>
                  ))}
                </ul>
                {erroTroca && (
                  <p role="alert" className="px-4 py-2 text-body-sm text-danger">
                    {erroTroca}
                  </p>
                )}
                <p className="px-4 pt-2 pb-1 text-caption text-ink-muted uppercase">Modo</p>
              </>
            )}
            <ul aria-label="Modos do painel">
              {opcoes.map((m) => (
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
            {comoPessoa && (
              <button
                type="button"
                onClick={() => {
                  setAberto(false);
                  verComoPessoa();
                }}
                className="flex min-h-14 w-full items-center gap-3 border-t border-line px-4 py-2 text-left hover:bg-surface-300"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-label">Ver como pessoa</span>
                  <span className="block text-body-sm text-ink-muted">
                    Só olhar: o Publike de quem procura trabalho
                  </span>
                </span>
                <Eye aria-hidden className="size-5 shrink-0 text-ink-muted" />
              </button>
            )}
            {(papel === "dono" || papel === "admin") && (
              <Link
                href="/perfil#modos"
                onClick={() => setAberto(false)}
                className="flex min-h-11 items-center border-t border-line px-4 text-body-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Escolher o que você faz no Publike
              </Link>
            )}
          </div>
        )}
      </div>

      <ul className="sem-barra -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-4 lg:overflow-visible lg:px-0">
        {grupos.map((g) => (
          <li key={g.nome ?? "inicio"} className="contents lg:block">
            {g.nome && <p className="hidden px-3 pb-1.5 text-body-sm font-semibold text-ink-muted lg:block">{g.nome}</p>}
            <ul
              className={`contents lg:relative lg:flex lg:flex-col lg:gap-0.5 ${
                // o traço que liga os passos do caminho
                g.caminho
                  ? "lg:before:absolute lg:before:top-5 lg:before:bottom-5 lg:before:left-[22px] lg:before:w-px lg:before:bg-line"
                  : ""
              }`}
            >
              {g.secoes.map((s) => {
                const Icone = ICONES[s.icone];
                const atualSecao = ativa === s.href;
                return (
                  <li key={s.href} className="relative shrink-0">
                    <Link
                      href={s.href}
                      aria-current={atualSecao ? "page" : undefined}
                      className={`relative flex min-h-11 items-center gap-2.5 rounded-pill px-3.5 text-label whitespace-nowrap transition-colors lg:min-h-10 lg:rounded-md lg:px-3 ${
                        atualSecao
                          ? "bg-ink text-surface-100 lg:bg-surface-300 lg:text-ink"
                          : "border border-line-strong text-ink hover:bg-surface-300 lg:border-transparent"
                      }`}
                    >
                      {s.passo ? (
                        // o número do passo só no computador (o caminho em pé); na pílula do celular, o ícone,
                        // para a pílula ter um número só (a contagem)
                        <>
                          <Icone aria-hidden className="size-5 shrink-0 lg:hidden" />
                          <span
                            aria-hidden
                            className={`hidden size-[22px] shrink-0 place-items-center rounded-pill text-[12px] font-bold tabular-nums lg:relative lg:grid ${
                              atualSecao
                                ? "bg-surface-100 text-ink lg:bg-ink lg:text-surface-100"
                                : "border-[1.5px] border-line-strong bg-surface-100 text-ink-muted"
                            }`}
                          >
                            {s.passo}
                          </span>
                        </>
                      ) : (
                        <Icone aria-hidden className="size-5 shrink-0" />
                      )}
                      <span className={s.passo ? "" : "lg:flex-1"}>
                        {s.passo && <span className="sr-only">Passo {s.passo}: </span>}
                        {s.nome}
                      </span>
                      {numero(s, atualSecao)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
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
        <p className="px-3 text-body-sm font-semibold text-ink-muted">Mais</p>
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
