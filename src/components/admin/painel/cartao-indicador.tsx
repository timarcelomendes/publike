import Link from "next/link";
import type { ReactNode } from "react";
import { formatarNumero } from "@/lib/formato";

// O cartão da Visão geral: o valor, a variação contra o período anterior (com o valor de antes), a meta, o gráfico
// das últimas semanas e o "i" com o jeito de contar. Uma cor por sentido: cerrado quando melhora, terra quando piora.

export type Variacao = {
  /** "28%", "4 pontos", "poucos dados" */
  texto: string;
  sentido: "sobe" | "desce" | "igual";
  /** o valor de antes, já escrito ("18", "26%") */
  antes?: string;
};

/** Menos que isso nos dois períodos e a variação vira "poucos dados": 2 contra 4 não é "−50%". */
export const MINIMO_PARA_COMPARAR = 10;

/** A variação de uma contagem (matches, vagas, pessoas). */
export function variacaoDeContagem(atual: number, antes: number): Variacao {
  const escrito = formatarNumero(antes);
  if (Math.max(atual, antes) < MINIMO_PARA_COMPARAR) return { texto: "poucos dados", sentido: "igual", antes: escrito };
  if (antes === 0) return { texto: "novo", sentido: "sobe", antes: escrito };
  const v = Math.round(((atual - antes) / antes) * 100);
  return { texto: `${Math.abs(v)}%`, sentido: v > 0 ? "sobe" : v < 0 ? "desce" : "igual", antes: escrito };
}

/** A variação de uma porcentagem, em pontos; `base` é o tamanho da amostra mais pequena dos dois períodos. */
export function variacaoDePontos(atual: number | null, antes: number | null, base: number): Variacao | undefined {
  if (atual == null || antes == null) return undefined;
  if (base < MINIMO_PARA_COMPARAR) return { texto: "poucos dados", sentido: "igual", antes: `${antes}%` };
  const v = atual - antes;
  return {
    texto: `${Math.abs(v)} ${Math.abs(v) === 1 ? "ponto" : "pontos"}`,
    sentido: v > 0 ? "sobe" : v < 0 ? "desce" : "igual",
    antes: `${antes}%`,
  };
}

function Minigrafico({ serie, rotulo }: { serie: (number | null)[]; rotulo: string }) {
  const valores = serie.map((v) => v ?? 0);
  if (valores.length < 2) return null;
  const maior = Math.max(...valores, 1);
  const L = 300;
  const A = 44;
  const pontos = serie.map((v, i) => ({
    x: 4 + (i * (L - 8)) / (serie.length - 1),
    y: v == null ? null : A - 6 - (v / maior) * (A - 12),
  }));
  // a lacuna (dia sem dado) quebra a linha em pedaços
  const pedacos: string[] = [];
  let atual: string[] = [];
  for (const p of pontos) {
    if (p.y == null) {
      if (atual.length) pedacos.push(atual.join(" "));
      atual = [];
    } else atual.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  if (atual.length) pedacos.push(atual.join(" "));
  const ultimo = pontos.at(-1);
  return (
    <figure className="mt-1">
      <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" aria-hidden className="h-11 w-full">
        {pedacos.map((d) => (
          <polyline
            key={d}
            points={d}
            fill="none"
            className="stroke-ink"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        ))}
        {ultimo?.y != null && <circle cx={ultimo.x} cy={ultimo.y} r={3.5} className="fill-ink" />}
      </svg>
      <figcaption className="sr-only">
        {rotulo}, semana a semana: {serie.map((v) => (v == null ? "sem dado" : formatarNumero(v))).join(", ")}
      </figcaption>
    </figure>
  );
}

export function CartaoIndicador({
  rotulo,
  valor,
  variacao,
  apoio,
  meta,
  serie,
  ajuda,
  href,
  estrela,
  rodape,
}: {
  rotulo: string;
  valor: string;
  variacao?: Variacao;
  apoio?: string;
  /** a meta (0 a 100, em %) e onde o valor está agora */
  meta?: { alvo: number; agora: number; texto: string };
  /** as últimas semanas, da mais antiga à atual (null: sem dado) */
  serie?: (number | null)[];
  /** como o número é contado, no "i" */
  ajuda: string;
  href?: string;
  estrela?: boolean;
  /** o que vem embaixo (no admin, o "Definir meta") */
  rodape?: ReactNode;
}) {
  const cor =
    variacao?.sentido === "sobe"
      ? "text-cerrado-text"
      : variacao?.sentido === "desce"
        ? "text-terra-text"
        : "text-ink-muted";
  const seta = variacao?.sentido === "sobe" ? "▲" : variacao?.sentido === "desce" ? "▼" : "";
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-200 p-4">
      {estrela && (
        <span className="self-start rounded-pill bg-ink px-2.5 py-0.5 text-caption text-surface-100">Estrela-guia</span>
      )}
      <div className="flex items-start justify-between gap-2">
        <span className="text-label text-ink-muted">{rotulo}</span>
        <details className="relative shrink-0">
          <summary
            aria-label={`Como “${rotulo}” é contado`}
            className="flex size-6 cursor-pointer list-none items-center justify-center rounded-pill border border-line-strong text-caption text-ink-muted [&::-webkit-details-marker]:hidden"
          >
            i
          </summary>
          <p className="absolute right-0 z-10 mt-2 w-64 rounded-md border border-line bg-surface-200 p-3 text-body-sm text-ink shadow-raised">
            {ajuda}
          </p>
        </details>
      </div>
      <span className="font-display text-h1 text-ink tabular-nums">{valor}</span>
      {variacao && (
        <span className="text-body-sm">
          {variacao.texto === "poucos dados" ? (
            <span className="text-ink-muted">Poucos dados para comparar</span>
          ) : (
            <span className={`font-semibold ${cor}`}>
              {seta && <span aria-hidden>{seta} </span>}
              <span className="sr-only">
                {variacao.sentido === "sobe" ? "subiu " : variacao.sentido === "desce" ? "caiu " : "igual "}
              </span>
              {variacao.texto}
            </span>
          )}
          {variacao.antes !== undefined && <span className="text-ink-muted"> · eram {variacao.antes}</span>}
        </span>
      )}
      {apoio && <span className="text-body-sm text-ink-muted">{apoio}</span>}
      {meta && (
        <div className="mt-1 flex flex-col gap-1">
          <span className="text-body-sm text-ink-muted">{meta.texto}</span>
          <span aria-hidden className="relative h-1.5 rounded-pill bg-surface-300">
            <span
              className="absolute inset-y-0 left-0 rounded-pill bg-ink"
              style={{ width: `${Math.min(100, Math.max(0, meta.agora))}%` }}
            />
            <span className="absolute -top-1 h-3.5 w-0.5 bg-ink" style={{ left: `${Math.min(100, meta.alvo)}%` }} />
          </span>
        </div>
      )}
      {serie && <Minigrafico serie={serie} rotulo={rotulo} />}
      {rodape}
      {href && (
        <Link href={href} className="mt-auto pt-1 text-body-sm text-ink-muted underline underline-offset-2">
          Ver a lista
        </Link>
      )}
    </div>
  );
}
