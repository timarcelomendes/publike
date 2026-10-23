import { Briefcase, LayoutGrid, Users, Wrench, type LucideIcon } from "lucide-react";
import type { TipoAnuncio } from "@/lib/tipos";

// As abas da busca, "O que você procura": Tudo, Vagas e Serviços filtram os anúncios na
// página inicial; Talentos é outra página (gente que procura trabalho, não anúncios).

export type Aba = {
  nome: string;
  ajuda: string;
  /** no celular, quando a ajuda não cabe embaixo do nome */
  curta?: string;
  icone: LucideIcon;
};

export const ABAS_ANUNCIOS: (Aba & { valor: TipoAnuncio | null })[] = [
  { valor: null, nome: "Tudo", ajuda: "Vagas e serviços", curta: "Os dois", icone: LayoutGrid },
  { valor: "vaga", nome: "Vagas", ajuda: "Quero trabalhar", icone: Briefcase },
  { valor: "servico", nome: "Serviços", ajuda: "Quero contratar", icone: Wrench },
];

export const ABA_TALENTOS: Aba & { href: string } = {
  nome: "Talentos",
  ajuda: "Procuro funcionário",
  icone: Users,
  href: "/talentos",
};

/** A fileira das abas: quatro colunas no celular, uma linha no computador. */
export const classesGrupoAbas = "grid grid-cols-4 border-b border-line sm:flex sm:flex-1 sm:gap-1";

/** Cada aba: sublinhada quando escolhida. No celular, o nome fica no alto (a ajuda pode ter duas linhas). */
export function classesAba(ativo: boolean) {
  return `-mb-px flex min-h-11 items-start justify-center gap-2 border-b-[3px] px-1.5 pb-2 pt-0.5 transition-colors sm:min-h-12 sm:items-center sm:justify-start sm:px-3 sm:pb-2.5 sm:pt-1 ${
    ativo ? "border-ink text-ink" : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink"
  }`;
}

/** O que vai dentro da aba: o ícone (só no computador), o nome e a ajuda (`semAjuda`: só o nome). */
export function MioloAba({ aba, ativo, semAjuda = false }: { aba: Aba; ativo: boolean; semAjuda?: boolean }) {
  const Icone = aba.icone;
  return (
    <>
      <Icone aria-hidden className={`hidden size-5 shrink-0 sm:block ${ativo ? "text-terra-text" : ""}`} />
      <span className="flex flex-col text-center leading-tight sm:text-left">
        <span className="text-label sm:text-body sm:font-semibold">{aba.nome}</span>
        {!semAjuda && (
          <span className="text-caption font-medium text-ink-muted">
            {aba.curta ? (
              <>
                <span className="sm:hidden">{aba.curta}</span>
                <span className="hidden sm:inline">{aba.ajuda}</span>
              </>
            ) : (
              aba.ajuda
            )}
          </span>
        )}
      </span>
    </>
  );
}
