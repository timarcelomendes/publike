import { CircleUserRound, ClipboardList, House, Inbox, LayoutDashboard, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ModoPainel } from "@/lib/modo-painel";

export type AbaInferior = "inicio" | "segunda" | "publicar" | "painel" | "perfil" | null;

/**
 * A segunda aba muda com o modo da conta: quem procura trabalho (e o visitante) tem o Descobrir
 * (as vagas uma a uma); quem contrata, os candidatos; quem presta serviço, os pedidos.
 */
export const SEGUNDA: Record<ModoPainel, { href: string; nome: string; icone: typeof Sparkles }> = {
  trabalhar: { href: "/descobrir", nome: "Descobrir", icone: Sparkles },
  contratar: { href: "/painel/caixa", nome: "Candidatos", icone: Inbox },
  servicos: { href: "/painel/anuncios?tipo=servico", nome: "Pedidos", icone: ClipboardList },
};

/** Barra de navegação do celular (fica escondida no computador). */
export function BarraInferiorBase({ ativo, modo = "trabalhar" }: { ativo: AbaInferior; modo?: ModoPainel }) {
  const itens = [
    { id: "inicio", href: "/", nome: "Início", icone: House },
    { id: "segunda", ...SEGUNDA[modo] },
    { id: "publicar", href: "/publicar", nome: "Publicar", icone: Plus },
    { id: "painel", href: "/painel", nome: "Painel", icone: LayoutDashboard },
    { id: "perfil", href: "/perfil", nome: "Perfil", icone: CircleUserRound },
  ] as const;
  return (
    <nav
      aria-label="Navegação"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-200/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-5">
        {itens.map(({ id, href, nome, icone: Icone }) => {
          const atual = ativo === id;
          const publicar = id === "publicar";
          return (
            <li key={id}>
              <Link
                href={href}
                aria-current={atual ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-[12px] font-semibold ${
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
