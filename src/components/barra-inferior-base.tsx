import { CircleUserRound, House, LayoutDashboard, Plus } from "lucide-react";
import Link from "next/link";

export type AbaInferior = "inicio" | "publicar" | "painel" | "perfil" | null;

const ITENS = [
  { id: "inicio", href: "/", nome: "Início", icone: House },
  { id: "publicar", href: "/publicar", nome: "Publicar", icone: Plus },
  { id: "painel", href: "/painel", nome: "Painel", icone: LayoutDashboard },
  { id: "perfil", href: "/perfil", nome: "Perfil", icone: CircleUserRound },
] as const;

/** Barra de navegação do celular (fica escondida no computador). */
export function BarraInferiorBase({ ativo }: { ativo: AbaInferior }) {
  return (
    <nav
      aria-label="Navegação"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-200/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-4">
        {ITENS.map(({ id, href, nome, icone: Icone }) => {
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
