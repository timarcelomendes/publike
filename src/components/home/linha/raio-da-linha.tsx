import { ChevronDown, MapPinned } from "lucide-react";
import Link from "next/link";
import { nomeDoTempo } from "@/lib/deslocamento";
import { hrefFiltros, RAIOS } from "@/lib/filtros";
import { plural } from "@/lib/formato";
import type { Filtros } from "@/lib/filtros";
import type { DadosDaLinha, MaisLonge } from "@/lib/servidor/linha";
import { BotaoLink } from "../../ui/botao";

/** "vaga"/"vagas" na aba Vagas, "serviço" em Serviços, "anúncio" em Tudo. */
function nomeDoItem(tipo: string | null): [string, string] {
  return tipo === "vaga" ? ["vaga", "vagas"] : tipo === "servico" ? ["serviço", "serviços"] : ["anúncio", "anúncios"];
}

/** O que a linha do raio precisa: os filtros (com o raio), os da URL (para os links), de onde e o que ficou longe. */
export type DadosDoRaio = {
  filtros: Filtros;
  base: Filtros;
  origem: string;
  maisLonge: MaisLonge | null;
  tipo: string | null;
  /** na linha do tempo, o recuo da coluna da hora e dos nós (no computador) */
  recuo?: boolean;
};

const daLinha = (d: DadosDaLinha): DadosDoRaio => ({
  filtros: d.filtros,
  base: d.filtrosDaBusca,
  origem: d.origemDoRaio,
  maisLonge: d.maisLonge,
  tipo: d.aba,
  recuo: true,
});

function cidades(c: string[], total: number) {
  return c.length ? ` (${c.join(", ")}${total > c.length ? "…" : ""})` : "";
}

/**
 * Até onde a linha busca, à vista (03/11/2026): o raio ficava escondido em Filtros e a pessoa achava que via tudo.
 * Se ficou algo de fora: os raios em botões (o atual marcado), de onde conta, quantos ficaram e de onde. Se não,
 * só "Até 25 km da sua casa · Mudar" (o Mudar abre os botões).
 */
export function RaioDaLinha({ d }: { d: DadosDaLinha }) {
  return d.aba === "recado" ? null : <RaioDaBusca r={daLinha(d)} />;
}

/** A linha do raio (a da linha do tempo e a da busca). */
export function RaioDaBusca({ r: d }: { r: DadosDoRaio }) {
  const f = d.filtros;
  const [um, varios] = nomeDoItem(d.tipo);
  const longe = d.maisLonge;
  const proximo = longe?.faixas[0];
  const botoes = (
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
              href={hrefFiltros(d.base, { raio: r, tempo: null })}
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
      <span className="text-body-sm text-ink-muted">{d.origem}</span>
    </nav>
  );
  const distancia = f.tempo ? nomeDoTempo(f.tempo) : `Até ${f.raio} km`;
  // nada de fora: só uma linha curta, e o Mudar abre os raios (sem script: <details>)
  if (!longe || !proximo)
    return (
      <details className={`group pb-1 ${d.recuo ? "sm:pl-[112px]" : ""}`}>
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-body-sm text-ink-muted [&::-webkit-details-marker]:hidden">
          <MapPinned aria-hidden className="size-4 shrink-0" />
          <span>
            <span className="font-semibold text-ink">{distancia}</span> {d.origem} ·{" "}
            <span className="font-semibold text-ink underline underline-offset-2 group-open:hidden">Mudar</span>
            <span className="hidden font-semibold text-ink underline underline-offset-2 group-open:inline">Fechar</span>
          </span>
        </summary>
        <div className="pt-1.5">{botoes}</div>
      </details>
    );
  return (
    <div className={`flex flex-col gap-1.5 pb-1 ${d.recuo ? "sm:pl-[112px]" : ""}`}>
      {botoes}
      <p className="text-body-sm text-ink-muted">
        Mostrando só até {f.raio} km. Há mais {plural(longe.total, um, varios)} mais longe
        {cidades(longe.cidades, longe.total)}.{" "}
        <Link
          href={hrefFiltros(d.base, { raio: proximo.raio })}
          scroll={false}
          className="font-semibold text-ink underline underline-offset-2 hover:text-terra-text"
        >
          Exibir mais
        </Link>
      </p>
    </div>
  );
}

/** No fim da linha: acabou o raio, mas há mais longe. O botão abre o próximo raio que traz mais. */
export function FimDoRaio({ d }: { d: DadosDaLinha }) {
  return d.aba === "recado" ? null : <FimDoRaioDaBusca r={daLinha(d)} />;
}

export function FimDoRaioDaBusca({ r: d }: { r: DadosDoRaio }) {
  const longe = d.maisLonge;
  const proximo = longe?.faixas[0];
  if (!longe || !proximo) return null;
  const [um, varios] = nomeDoItem(d.tipo);
  const ultimo = longe.faixas.length > 1 ? longe.faixas[longe.faixas.length - 1] : null;
  return (
    <div
      className={`col-span-full flex flex-col items-center gap-2 rounded-lg border border-line bg-surface-200 px-4 py-4 text-center ${d.recuo ? "sm:ml-[112px]" : ""}`}
    >
      <p className="text-body-sm">
        <span className="font-semibold">Isso é tudo até {d.filtros.raio} km.</span> Mais longe há{" "}
        {plural(longe.total, um, varios)}
        {cidades(longe.cidades, longe.total)}.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <BotaoLink href={hrefFiltros(d.base, { raio: proximo.raio })} variante="primario">
          Exibir mais: até {proximo.raio} km (+{proximo.quantos})
          <ChevronDown aria-hidden className="size-4" />
        </BotaoLink>
        {ultimo && (
          <Link
            href={hrefFiltros(d.base, { raio: ultimo.raio })}
            className="inline-flex min-h-9 items-center text-body-sm font-semibold text-ink underline underline-offset-2 hover:text-terra-text"
          >
            Até {ultimo.raio} km (+{ultimo.quantos})
          </Link>
        )}
      </div>
    </div>
  );
}
