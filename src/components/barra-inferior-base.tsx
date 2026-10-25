import {
  ClipboardList,
  Heart,
  House,
  Inbox,
  LayoutDashboard,
  LogIn,
  MessagesSquare,
  Plus,
  Sparkles,
  Store,
  UserSearch,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { plural } from "@/lib/formato";
import type { ModoPainel } from "@/lib/modo-painel";

export type AbaInferior = "inicio" | "segunda" | "terceira" | "publicar" | "mensagens" | "painel" | "entrar" | null;

/**
 * Os números da barra: o que espera a pessoa (candidatos ou pedidos para responder, mensagens novas e
 * pedidos de conexão, que as Mensagens juntam).
 */
export type NumerosDaBarra = { segunda?: number; mensagens?: number; conexoes?: number };

export type Item = {
  id: Exclude<AbaInferior, null>;
  href: string;
  nome: string;
  icone: LucideIcon;
  numero?: number;
  /** o que o número conta, para o leitor de tela ("2 mensagens novas e 1 pedido de conexão") */
  leitor?: string;
};

/**
 * A segunda aba muda com o modo da conta: quem procura trabalho (e o visitante) tem o Descobrir
 * (as vagas uma a uma); quem contrata, os candidatos; quem presta serviço, os pedidos.
 */
export const SEGUNDA: Record<ModoPainel, { href: string; nome: string; icone: LucideIcon }> = {
  trabalhar: { href: "/descobrir", nome: "Descobrir", icone: Sparkles },
  contratar: { href: "/painel/caixa", nome: "Candidatos", icone: Inbox },
  servicos: { href: "/painel/anuncios?tipo=servico", nome: "Pedidos", icone: ClipboardList },
};

const INICIO: Item = { id: "inicio", href: "/", nome: "Início", icone: House };
const PAINEL: Item = { id: "painel", href: "/painel", nome: "Painel", icone: LayoutDashboard };
/** quem contrata (e o visitante) publica a vaga; quem presta serviço publica na vitrine */
const PUBLICAR: Record<"vaga" | "servico", Item> = {
  vaga: { id: "publicar", href: "/publicar", nome: "Publicar", icone: Plus },
  servico: { id: "publicar", href: "/painel/servicos", nome: "Publicar", icone: Plus },
};

/**
 * As abas de cada um (o visitante é `modo` null): quem procura trabalho tem as Candidaturas no lugar do
 * Publicar (quase nunca publica; o recado fica no Início); quem contrata e quem presta serviço publicam
 * pelo botão do meio. O visitante tem o Entrar no lugar do Painel e do Perfil, que só levavam ao login.
 * As Mensagens juntam as conversas, os matches e as conexões: o número soma as mensagens novas e os
 * pedidos de conexão.
 */
export function abasDaBarra(modo: ModoPainel | null, numeros: NumerosDaBarra = {}): Item[] {
  const novas = numeros.mensagens ?? 0;
  const pedidos = numeros.conexoes ?? 0;
  const mensagens: Item = {
    id: "mensagens",
    href: "/painel/conversas",
    nome: "Mensagens",
    icone: MessagesSquare,
    numero: novas + pedidos,
    leitor: [
      novas > 0 && plural(novas, "mensagem nova", "mensagens novas"),
      pedidos > 0 && plural(pedidos, "pedido de conexão", "pedidos de conexão"),
    ]
      .filter(Boolean)
      .join(" e "),
  };
  if (modo === null) {
    return [
      INICIO,
      { id: "segunda", ...SEGUNDA.trabalhar },
      PUBLICAR.vaga,
      { id: "entrar", href: "/entrar", nome: "Entrar", icone: LogIn },
    ];
  }
  if (modo === "trabalhar") {
    return [
      INICIO,
      { id: "segunda", ...SEGUNDA.trabalhar },
      { id: "terceira", href: "/painel/curtidas?tipo=vaga", nome: "Candidaturas", icone: Heart },
      mensagens,
      PAINEL,
    ];
  }
  const segunda = numeros.segunda ?? 0;
  return [
    INICIO,
    {
      id: "segunda",
      ...SEGUNDA[modo],
      numero: segunda,
      leitor:
        modo === "contratar"
          ? plural(segunda, "candidato para responder", "candidatos para responder")
          : plural(segunda, "pedido novo", "pedidos novos"),
    },
    modo === "contratar" ? PUBLICAR.vaga : PUBLICAR.servico,
    mensagens,
    PAINEL,
  ];
}

/** No computador, o Publicar vira botão à direita do topo: no lugar dele, Talentos ou a Vitrine. */
const TERCEIRA_DO_TOPO: Record<"contratar" | "servicos", Item> = {
  contratar: { id: "terceira", href: "/talentos", nome: "Talentos", icone: UserSearch },
  servicos: { id: "terceira", href: "/painel/servicos", nome: "Vitrine", icone: Store },
};

/** As abas do topo do computador: as mesmas da barra de baixo, com Talentos ou a Vitrine no lugar do Publicar. */
export function abasDoTopo(modo: ModoPainel, numeros: NumerosDaBarra = {}): Item[] {
  return abasDaBarra(modo, numeros).map((a) =>
    a.id === "publicar" && modo !== "trabalhar" ? TERCEIRA_DO_TOPO[modo] : a,
  );
}

/** O número vermelho em cima do ícone (até 99+), com o texto para o leitor de tela. */
function Numero({ n, leitor }: { n: number; leitor?: string }) {
  return (
    <span className="absolute top-1.5 left-1/2 ml-1.5 flex min-w-5 items-center justify-center rounded-pill bg-like px-1 text-[11px] leading-5 font-bold text-on-like tabular-nums">
      <span aria-hidden>{n > 99 ? "99+" : n}</span>
      <span className="sr-only">, {leitor || plural(n, "novo", "novos")}</span>
    </span>
  );
}

/**
 * Barra de navegação do celular (fica escondida no computador). `abas`: null enquanto a conta carrega
 * (a barra fica vazia, sem mostrar as abas de outra pessoa).
 */
export function BarraInferiorBase({ ativo, abas }: { ativo: AbaInferior; abas: Item[] | null }) {
  return (
    <nav
      aria-label="Navegação"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-200/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="grid min-h-16" style={{ gridTemplateColumns: `repeat(${abas?.length ?? 5}, minmax(0, 1fr))` }}>
        {(abas ?? []).map(({ id, href, nome, icone: Icone, numero, leitor }) => {
          const atual = ativo === id;
          const publicar = id === "publicar";
          return (
            <li key={id}>
              <Link
                href={href}
                aria-current={atual ? "page" : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-[12px] font-semibold whitespace-nowrap ${
                  atual ? "text-ink" : "text-ink-muted"
                }`}
              >
                {publicar ? (
                  <span className="flex size-9 items-center justify-center rounded-pill bg-terra text-on-terra">
                    <Icone aria-hidden className="size-5" />
                  </span>
                ) : (
                  <Icone aria-hidden className="size-6" strokeWidth={atual ? 2.4 : 2} />
                )}
                {nome}
                {numero ? <Numero n={numero} leitor={leitor} /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
