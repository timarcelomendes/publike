import Link from "next/link";
import { linkDaAba, type AbaDoPainel } from "./abas";
import type { FiltroDoPainel, Indicadores } from "@/lib/admin/painel";

// O alto do Painel: o período (7, 30 ou 90 dias, sempre contra o período anterior do mesmo tamanho) e "Sem a
// equipe" (ligado por padrão). Tudo no endereço, como a aba.

const diaMes = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

/** O que vai no endereço para manter o que está escolhido. */
export function paramsDoFiltro(f: FiltroDoPainel): Record<string, string | undefined> {
  return { dias: f.dias === 7 ? undefined : String(f.dias), equipe: f.comEquipe ? "com" : undefined };
}

export function Periodo({
  base,
  aba,
  filtro,
  indicadores,
  atualizado,
  mostrarEquipe = true,
}: {
  base: string;
  aba: AbaDoPainel;
  filtro: FiltroDoPainel;
  indicadores?: Indicadores | null;
  atualizado?: string;
  /** Equipe › Números conta sempre sem a equipe: sem a chave */
  mostrarEquipe?: boolean;
}) {
  const com = (mudanca: Partial<FiltroDoPainel>) => linkDaAba(base, aba, paramsDoFiltro({ ...filtro, ...mudanca }));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div role="group" aria-label="Período" className="flex gap-2">
        {([7, 30, 90] as const).map((d) => (
          <Link
            key={d}
            href={com({ dias: d })}
            aria-current={filtro.dias === d ? "true" : undefined}
            className={`inline-flex h-10 items-center rounded-pill border px-4 text-label ${
              filtro.dias === d ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-300 text-ink"
            }`}
          >
            {d} dias
          </Link>
        ))}
      </div>
      {indicadores && (
        <span className="text-body-sm text-ink-muted">
          {diaMes(indicadores.de)} a {diaMes(indicadores.ate)}, comparado com {diaMes(indicadores.antes_de)} a{" "}
          {diaMes(indicadores.antes_ate)}
        </span>
      )}
      {mostrarEquipe && (
        <Link
          href={com({ comEquipe: !filtro.comEquipe })}
          role="switch"
          aria-checked={!filtro.comEquipe}
          className="inline-flex items-center gap-2 text-label"
        >
          <span
            aria-hidden
            className={`relative inline-block h-6 w-10 rounded-pill transition-colors ${
              filtro.comEquipe ? "bg-line-strong" : "bg-cerrado"
            }`}
          >
            <span
              className={`absolute top-1 size-4 rounded-pill bg-surface-200 transition-all ${
                filtro.comEquipe ? "left-1" : "left-5"
              }`}
            />
          </span>
          Sem a equipe
        </Link>
      )}
      {atualizado && <span className="text-body-sm text-ink-muted sm:ml-auto">Atualizado às {atualizado}</span>}
    </div>
  );
}
