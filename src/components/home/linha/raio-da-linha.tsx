import { ChevronDown, MapPinned } from "lucide-react";
import Link from "next/link";
import { nomeDoTempo } from "@/lib/deslocamento";
import { hrefFiltros, RAIOS } from "@/lib/filtros";
import { plural } from "@/lib/formato";
import type { DadosDaLinha } from "@/lib/servidor/linha";
import { BotaoLink } from "../../ui/botao";

/** "vaga"/"vagas" na aba Vagas, "serviço" em Serviços, "anúncio" em Tudo. */
function nomeDoItem(aba: DadosDaLinha["aba"]): [string, string] {
  return aba === "vaga" ? ["vaga", "vagas"] : aba === "servico" ? ["serviço", "serviços"] : ["anúncio", "anúncios"];
}

function cidades(c: string[], total: number) {
  return c.length ? ` (${c.join(", ")}${total > c.length ? "…" : ""})` : "";
}

/**
 * Até onde a linha busca, sempre à vista (03/11/2026): o raio ficava escondido em Filtros e a pessoa achava que
 * via tudo. Os raios em botões (o atual marcado), de onde conta, e, se ficou algo de fora, quantos e de onde.
 */
export function RaioDaLinha({ d }: { d: DadosDaLinha }) {
  if (d.aba === "recado") return null;
  const f = d.filtros;
  const [um, varios] = nomeDoItem(d.aba);
  const longe = d.maisLonge;
  const proximo = longe?.faixas[0];
  return (
    <div className="flex flex-col gap-1.5 pb-1 sm:pl-[112px]">
      <nav aria-label="Até onde buscar" className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="inline-flex items-center gap-1 text-body-sm font-semibold text-ink">
          <MapPinned aria-hidden className="size-4 shrink-0 text-ink-muted" />
          Até onde
        </span>
        <span className="flex flex-wrap gap-1">
          {f.tempo && (
            <span
              aria-current="true"
              className="inline-flex min-h-9 items-center rounded-pill bg-ink px-3 text-body-sm font-semibold text-surface-100"
            >
              {nomeDoTempo(f.tempo)}
            </span>
          )}
          {RAIOS.map((r) => {
            const atual = !f.tempo && f.raio === r;
            return (
              <Link
                key={r}
                href={hrefFiltros(d.filtrosDaBusca, { raio: r, tempo: null })}
                scroll={false}
                aria-current={atual ? "true" : undefined}
                className={`inline-flex min-h-9 items-center rounded-pill border px-3 text-body-sm tabular-nums ${
                  atual
                    ? "border-ink bg-ink font-semibold text-surface-100"
                    : "border-line-strong bg-surface-100 text-ink hover:bg-surface-300"
                }`}
              >
                {r} km
              </Link>
            );
          })}
        </span>
        <span className="text-body-sm text-ink-muted">{d.origemDoRaio}</span>
      </nav>
      {longe && proximo && (
        <p className="text-body-sm text-ink-muted">
          Mostrando só até {f.raio} km. Há mais {plural(longe.total, um, varios)} mais longe
          {cidades(longe.cidades, longe.total)}.{" "}
          <Link
            href={hrefFiltros(d.filtrosDaBusca, { raio: proximo.raio })}
            scroll={false}
            className="font-semibold text-ink underline underline-offset-2 hover:text-terra-text"
          >
            Exibir mais
          </Link>
        </p>
      )}
    </div>
  );
}

/** No fim da linha: acabou o raio, mas há mais longe. O botão abre o próximo raio que traz mais. */
export function FimDoRaio({ d }: { d: DadosDaLinha }) {
  const longe = d.maisLonge;
  const proximo = longe?.faixas[0];
  if (d.aba === "recado" || !longe || !proximo) return null;
  const [um, varios] = nomeDoItem(d.aba);
  const ultimo = longe.faixas.length > 1 ? longe.faixas[longe.faixas.length - 1] : null;
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-surface-200 px-4 py-4 text-center sm:ml-[112px]">
      <p className="text-body-sm">
        <span className="font-semibold">Isso é tudo até {d.filtros.raio} km.</span> Mais longe há{" "}
        {plural(longe.total, um, varios)}
        {cidades(longe.cidades, longe.total)}.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <BotaoLink href={hrefFiltros(d.filtrosDaBusca, { raio: proximo.raio })} variante="primario">
          Exibir mais: até {proximo.raio} km (+{proximo.quantos})
          <ChevronDown aria-hidden className="size-4" />
        </BotaoLink>
        {ultimo && (
          <Link
            href={hrefFiltros(d.filtrosDaBusca, { raio: ultimo.raio })}
            className="inline-flex min-h-9 items-center text-body-sm font-semibold text-ink underline underline-offset-2 hover:text-terra-text"
          >
            Até {ultimo.raio} km (+{ultimo.quantos})
          </Link>
        )}
      </div>
    </div>
  );
}
