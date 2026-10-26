import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

// A grade das seções do painel: todas à vista, cada uma com o que tem lá (o número do que é novo, o
// andamento, o quanto o currículo está completo). É a primeira página do painel de quem procura
// trabalho; no celular, ela faz o papel da linha do menu.

export type BlocoDoPainel = {
  href: string;
  nome: string;
  icone: LucideIcon;
  /** a linha embaixo do nome: o que tem lá ("Conversas, matches e conexões") ou como está ("80% completo") */
  texto: string;
  /** o texto pede a pessoa (em terra) */
  destaque?: boolean;
  /** o que é novo (mensagens, visitas): a pílula, como no menu */
  numero?: number;
  /** ocupa duas colunas (a seção principal) */
  largo?: boolean;
  /** o que mais aparece no bloco: só para ver (o bloco todo é o link) */
  extra?: ReactNode;
};

/**
 * As seções em blocos, dois por linha no celular e três no computador. `grupos`: com mais de uma
 * atividade, um grupo para cada, com o nome em cima (como no menu); com uma, um grupo sem nome.
 */
export function GradeDoPainel({
  grupos,
  mais = [],
  titulo,
}: {
  grupos: { nome: string | null; blocos: BlocoDoPainel[] }[];
  /** o resto do painel, em links pequenos embaixo */
  mais?: { href: string; nome: string }[];
  /** o nome da grade para o leitor de tela */
  titulo: string;
}) {
  return (
    <section aria-labelledby="grade-do-painel" className="flex flex-col gap-5">
      <h2 id="grade-do-painel" className="sr-only">
        {titulo}
      </h2>
      {grupos.map((g, i) => (
        <div key={g.nome ?? i} className="flex flex-col gap-3">
          {g.nome && <h3 className="text-label text-ink-muted">{g.nome}</h3>}
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {g.blocos.map(({ href, nome, icone: Icone, texto, destaque, numero = 0, largo, extra }) => (
              <li key={href} className={largo ? "col-span-2" : undefined}>
                <Link
                  href={href}
                  className="relative flex h-full flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:p-5"
                >
                  {/* o bloco largo põe o ícone ao lado do nome (no celular, não gasta uma linha só com ele) */}
                  <span
                    className={`flex gap-3 ${largo ? "items-center" : "flex-col"} ${largo && numero > 0 ? "pr-8" : ""}`}
                  >
                    <span
                      aria-hidden
                      className="grid size-10 shrink-0 place-items-center rounded-pill bg-surface-300 text-ink"
                    >
                      <Icone className="size-5" />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-label">{nome}</span>
                      {/* o número no canto, mas lido logo depois do nome ("Mensagens, 2 novos") */}
                      {numero > 0 && (
                        <span className="absolute top-4 right-4 min-w-6 rounded-pill bg-ink px-1.5 text-center text-caption leading-6 text-surface-100 tabular-nums sm:top-5 sm:right-5">
                          {numero > 99 ? "99+" : numero}
                          <span className="sr-only"> {numero === 1 ? "novo" : "novos"}</span>
                        </span>
                      )}
                      {texto && (
                        <span
                          className={`text-body-sm ${destaque ? "font-semibold text-terra-text" : "text-ink-muted"}`}
                        >
                          {texto}
                        </span>
                      )}
                    </span>
                  </span>
                  {extra}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {mais.length > 0 && (
        <ul aria-label="Mais do painel" className="flex flex-wrap gap-x-5 gap-y-1">
          {mais.map((m) => (
            <li key={m.href}>
              <Link
                href={m.href}
                className="inline-flex min-h-11 items-center text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                {m.nome}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
