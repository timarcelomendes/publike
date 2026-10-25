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
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ModoPainel } from "@/lib/modo-painel";

export type AbaInferior = "inicio" | "segunda" | "terceira" | "publicar" | "mensagens" | "painel" | "entrar" | null;

/** Os números da barra: o que espera a pessoa (candidatos ou pedidos para responder, mensagens novas). */
export type NumerosDaBarra = { segunda?: number; mensagens?: number };

type Item = {
  id: Exclude<AbaInferior, null>;
  href: string;
  nome: string;
  icone: LucideIcon;
  numero?: number;
  /** o que o número conta, para o leitor de tela ("3 mensagens novas") */
  conta?: [string, string];
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
const PUBLICAR: Item = { id: "publicar", href: "/publicar", nome: "Publicar", icone: Plus };
const PAINEL: Item = { id: "painel", href: "/painel", nome: "Painel", icone: LayoutDashboard };

/**
 * As abas de cada um (o visitante é `modo` null): quem procura trabalho tem as Candidaturas no lugar do
 * Publicar (quase nunca publica; o recado fica no Início); quem contrata e quem presta serviço publicam
 * pelo botão do meio. O visitante tem o Entrar no lugar do Painel e do Perfil, que só levavam ao login.
 */
export function abasDaBarra(modo: ModoPainel | null, numeros: NumerosDaBarra = {}): Item[] {
  const mensagens: Item = {
    id: "mensagens",
    href: "/painel/conversas",
    nome: "Mensagens",
    icone: MessagesSquare,
    numero: numeros.mensagens,
    conta: ["mensagem nova", "mensagens novas"],
  };
  if (modo === null) {
    return [
      INICIO,
      { id: "segunda", ...SEGUNDA.trabalhar },
      PUBLICAR,
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
  return [
    INICIO,
    {
      id: "segunda",
      ...SEGUNDA[modo],
      numero: numeros.segunda,
      conta:
        modo === "contratar"
          ? ["candidato para responder", "candidatos para responder"]
          : ["pedido novo", "pedidos novos"],
    },
    PUBLICAR,
    mensagens,
    PAINEL,
  ];
}

/** O número vermelho em cima do ícone (até 99+), com o texto para o leitor de tela. */
function Numero({ n, conta = ["novo", "novos"] }: { n: number; conta?: [string, string] }) {
  return (
    <span className="absolute top-1.5 left-1/2 ml-1.5 flex min-w-5 items-center justify-center rounded-pill bg-like px-1 text-[11px] leading-5 font-bold text-on-like tabular-nums">
      {n > 99 ? "99+" : n}
      <span className="sr-only"> {n === 1 ? conta[0] : conta[1]}</span>
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
        {(abas ?? []).map(({ id, href, nome, icone: Icone, numero, conta }) => {
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
                {numero ? <Numero n={numero} conta={conta} /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
