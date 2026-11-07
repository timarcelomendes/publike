import Link from "next/link";

// As vagas agrupadas (claude/plano-pagina-de-vagas.md, parte 4): quantas vagas há em cada bairro, em cada área e de
// cada cargo, como nas páginas de carreiras. Cada linha leva à lista já filtrada. Um grupo só aparece quando separa
// alguma coisa (mais de uma opção).

export type GrupoDeVagas = { titulo: string; itens: { nome: string; n: number; href: string }[] };

const MAXIMO = 8;

export function VagasAgrupadas({ grupos, cor }: { grupos: GrupoDeVagas[]; cor: string | null }) {
  // um grupo em que cada opção tem uma vaga só (cargos todos diferentes) só repetiria a lista
  const comOpcoes = grupos.filter((g) => g.itens.length > 1 && g.itens.some((i) => i.n > 1));
  if (!comOpcoes.length) return null;
  return (
    <section aria-labelledby="vagas-agrupadas" className="mt-10 flex flex-col gap-4">
      <h2 id="vagas-agrupadas" className="font-display text-h3">
        Encontre pelo que procura
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {comOpcoes.map((g) => (
          <div key={g.titulo} className="rounded-lg border border-line bg-surface-200 p-4 shadow-card">
            <h3 className="mb-2 text-label text-ink-muted">{g.titulo}</h3>
            <ul className="flex flex-col">
              {g.itens.slice(0, MAXIMO).map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    scroll={false}
                    className="group flex min-h-10 items-center justify-between gap-3 rounded-md px-2 hover:bg-surface-300"
                  >
                    <span className="min-w-0 truncate text-body group-hover:underline">{i.nome}</span>
                    <span
                      className="shrink-0 rounded-pill bg-surface-300 px-2 py-0.5 text-caption font-semibold tabular-nums group-hover:bg-surface-100"
                      style={cor ? { color: cor } : undefined}
                    >
                      {i.n}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {g.itens.length > MAXIMO && (
              <p className="mt-1 px-2 text-body-sm text-ink-muted">e mais {g.itens.length - MAXIMO}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
