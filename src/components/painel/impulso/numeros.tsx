import { formatarMoeda, formatarNumero } from "@/lib/formato";

export type DiaDoImpulso = { dia: string; impressoes: number; cliques: number; visitas: number; curtidas: number };
export type TotaisDoImpulso = {
  impressoes: number;
  cliques: number;
  visitas: number;
  curtidas: number;
  /** as que vieram do quadro do Publike (migração 20270519120000; antes dela, não vem) */
  visitas_quadro?: number;
  curtidas_quadro?: number;
};

const NOMES: [Exclude<keyof TotaisDoImpulso, "visitas_quadro" | "curtidas_quadro">, string, string][] = [
  ["impressoes", "Viram o anúncio", "quantas vezes ele apareceu no Google"],
  ["cliques", "Clicaram", "e abriram a vaga"],
  ["visitas", "Visitas", "na vaga, vindas do anúncio"],
  ["curtidas", "Curtiram", "a vaga depois de chegar pelo anúncio"],
];

/** Os números do impulso: o Google (viram e clicaram) e o Publike (visitas e curtidas), mais a verba usada. */
export function NumerosDoImpulso({
  totais,
  porDia,
  verba,
  gasto,
  rotuloDaVerba = "Verba do anúncio",
}: {
  totais: TotaisDoImpulso;
  porDia: DiaDoImpulso[];
  verba: number;
  gasto: number;
  /** na campanha de várias vagas do cliente, a verba é uma só para todas */
  rotuloDaVerba?: string;
}) {
  const maior = Math.max(1, ...porDia.map((d) => d.cliques));
  const usado = Math.min(100, Math.round((gasto / Math.max(verba, 0.01)) * 100));
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        {NOMES.map(([chave, nome, ajuda]) => (
          <div key={chave} className="flex flex-col gap-0.5 bg-surface-200 p-4">
            <dt className="text-label">{nome}</dt>
            <dd className="font-display text-h2 tabular-nums">{formatarNumero(totais[chave])}</dd>
            <dd className="text-body-sm text-ink-muted">{ajuda}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap justify-between gap-2 text-body-sm">
          <span>{rotuloDaVerba}</span>
          <span className="tabular-nums text-ink-muted">
            {formatarMoeda(gasto)} de {formatarMoeda(verba)}
          </span>
        </p>
        <div
          role="meter"
          aria-label={`${rotuloDaVerba}: quanto foi usado`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={usado}
          className="h-2 overflow-hidden rounded-pill bg-surface-300"
        >
          <div className="h-full rounded-pill bg-cerrado" style={{ width: `${usado}%` }} />
        </div>
      </div>
      {porDia.length > 1 && (
        <table className="w-full text-body-sm">
          <caption className="sr-only">Os números de cada dia</caption>
          <thead className="text-left text-ink-muted">
            <tr>
              <th scope="col" className="py-1.5 font-normal">
                Dia
              </th>
              <th scope="col" className="py-1.5 font-normal">
                Cliques
              </th>
              <th scope="col" className="py-1.5 text-right font-normal">
                Viram
              </th>
              <th scope="col" className="py-1.5 text-right font-normal">
                Curtiram
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {porDia.map((d) => (
              <tr key={d.dia}>
                <th scope="row" className="py-1.5 font-normal whitespace-nowrap tabular-nums">
                  {new Date(`${d.dia}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                </th>
                <td className="w-1/2 py-1.5 pr-3">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2 rounded-pill bg-cerrado"
                      style={{ width: `${Math.max(4, (d.cliques / maior) * 100)}%` }}
                    />
                    <span className="tabular-nums">{d.cliques}</span>
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums">{formatarNumero(d.impressoes)}</td>
                <td className="py-1.5 text-right tabular-nums">{d.curtidas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
