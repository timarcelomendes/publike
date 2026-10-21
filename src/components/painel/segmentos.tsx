import Link from "next/link";
import { Avatar } from "@/components/ui/basicos";

// Uma escolha só entre poucas opções (Todas, No ar, Pausadas...), numa pílula com as opções
// lado a lado: a escolhida fica em `ink`. Diferente do chip de filtro, não tem ×: para voltar,
// toca em "Todas". No celular, a pílula rola de lado.

export type Segmento = {
  nome: string;
  href: string;
  ativo: boolean;
  numero?: number;
  /** o logo ou as iniciais (clientes da agência) */
  avatar?: { nome: string; foto?: string | null };
};

export function Segmentos({ rotulo, opcoes }: { rotulo: string; opcoes: Segmento[] }) {
  return (
    <nav aria-label={rotulo} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="inline-flex min-w-max items-center gap-1 rounded-pill border border-line bg-surface-300 p-1">
        {opcoes.map((o) => {
          const vazio = o.numero === 0 && !o.ativo;
          return (
            <li key={o.href}>
              <Link
                href={o.href}
                scroll={false}
                aria-current={o.ativo ? "page" : undefined}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-pill px-3.5 text-label whitespace-nowrap transition-colors ${
                  o.ativo
                    ? "bg-ink text-surface-100"
                    : vazio
                      ? "text-ink-muted hover:bg-surface-200"
                      : "text-ink hover:bg-surface-200"
                }`}
              >
                {o.avatar && (
                  <Avatar nome={o.avatar.nome} foto={o.avatar.foto} tamanho={20} forma="quadrada" colorida />
                )}
                {o.nome}
                {o.numero !== undefined && (
                  <span className={`tabular-nums ${o.ativo ? "text-surface-100/75" : "text-ink-muted"}`}>
                    {o.numero}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
