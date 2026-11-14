import { formatarNumero } from "@/lib/formato";
import type { TotaisDoImpulso } from "./numeros";

// O pacote de candidatos (claude/plano-nova-venda-do-impulso.md; migração 20270519120000): quantos chegaram e de onde.

/** Quantos candidatos já chegaram, de quantos, com a barra. */
export function BarraDoPacote({ alvo, chegaram }: { alvo: number; chegaram: number }) {
  const feitos = Math.min(chegaram, alvo);
  const pct = alvo > 0 ? Math.round((feitos / alvo) * 100) : 0;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-label">Candidatos que chegaram</span>
        <span className="font-display text-h2 tabular-nums">
          {feitos} <span className="text-body text-ink-muted">de {alvo}</span>
        </span>
      </p>
      <div
        role="progressbar"
        aria-label="Candidatos que chegaram"
        aria-valuemin={0}
        aria-valuemax={alvo}
        aria-valuenow={feitos}
        className="h-2.5 overflow-hidden rounded-pill bg-surface-300"
      >
        <div className="h-full rounded-pill bg-terra" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** As visitas e as curtidas que vieram do destaque, com a parte do Publike (o quadro e o espaço na lista). */
export function NumerosDoPacote({ totais }: { totais: TotaisDoImpulso }) {
  const quadro = totais.visitas_quadro ?? 0;
  const itens: [string, number, string][] = [
    ["Visitas", totais.visitas, "na vaga, vindas do destaque"],
    ["No Publike", quadro, "das visitas, pelo quadro e pela lista do Publike"],
    ["Curtiram", totais.curtidas, "a vaga depois de chegar pelo destaque"],
  ];
  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
      {itens.map(([nome, valor, ajuda]) => (
        <div key={nome} className="flex flex-col gap-0.5 bg-surface-200 p-4">
          <dt className="text-label">{nome}</dt>
          <dd className="font-display text-h2 tabular-nums">{formatarNumero(valor)}</dd>
          <dd className="text-body-sm text-ink-muted">{ajuda}</dd>
        </div>
      ))}
    </dl>
  );
}
