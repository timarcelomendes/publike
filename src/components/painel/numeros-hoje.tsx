import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { formatarNumero } from "@/lib/formato";

// "Seus números", no Hoje de quem contrata (claude/plano-painel-hoje-novo-design.md): os candidatos dos últimos
// 14 dias, com uma barra por dia, e três números do andamento. Um cartão só, com divisórias; no celular, em duas
// colunas. Os números grandes usam a mesma fonte do texto (a regra dos gráficos: nada de fonte de título nos números).

export type NumeroDoHoje = {
  nome: string;
  /** "14 dias", "novembro", "no ar" */
  periodo?: string;
  valor: string;
  /** uma linha embaixo, em cinza */
  sub?: string;
  /** a barra de "11 de 12" (0 a 1) */
  parte?: number;
  /** "Rápido: menos de 1 dia" (com o ✓ em verde quando é bom) */
  situacao?: { texto: string; bom: boolean };
  /** no celular, ocupa as duas colunas */
  largo?: boolean;
};

export function NumerosDoHoje({
  candidatos,
  numeros,
}: {
  /** os candidatos por dia, do mais antigo a hoje (14 dias), e o total dos 14 dias antes */
  candidatos: { dias: { dia: string; n: number }[]; antes: number };
  numeros: NumeroDoHoje[];
}) {
  const total = candidatos.dias.reduce((s, d) => s + d.n, 0);
  const diferenca = total - candidatos.antes;
  const maior = Math.max(1, ...candidatos.dias.map((d) => d.n));
  const iMaior = candidatos.dias.findIndex((d) => d.n === maior);
  return (
    <section aria-labelledby="seus-numeros" className="flex min-w-0 flex-col gap-3">
      <h2 id="seus-numeros" className="text-h2">
        Seus números
      </h2>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card xl:grid-cols-1">
        <div className="col-span-2 flex flex-col gap-1 bg-surface-200 px-4 py-4 sm:px-5 xl:col-span-1">
          <p className="flex justify-between gap-2 text-body-sm">
            <span className="font-semibold">Candidatos</span>
            <span className="text-ink-muted">14 dias</span>
          </p>
          <p className="text-[44px] leading-[48px] font-bold tracking-[-1px] sm:text-[48px] sm:leading-[52px]">
            {formatarNumero(total)}
          </p>
          {(total > 0 || candidatos.antes > 0) && (
            <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] leading-[18px] text-ink-muted">
              {diferenca === 0 ? (
                <span>o mesmo que nas 2 semanas antes</span>
              ) : (
                <>
                  <span
                    className={`inline-flex items-center gap-0.5 text-body-sm font-bold ${
                      diferenca > 0 ? "text-cerrado-text" : "text-ink"
                    }`}
                  >
                    {diferenca > 0 ? (
                      <ArrowUp aria-hidden className="size-3.5" strokeWidth={2.5} />
                    ) : (
                      <ArrowDown aria-hidden className="size-3.5" strokeWidth={2.5} />
                    )}
                    {Math.abs(diferenca)} a {diferenca > 0 ? "mais" : "menos"}
                  </span>
                  que nas 2 semanas antes
                </>
              )}
            </p>
          )}
          <div
            role="img"
            aria-label={`Candidatos por dia, de ${candidatos.dias[0]?.dia ?? ""} a hoje: ${candidatos.dias
              .map((d) => d.n)
              .join(", ")}`}
            className="mt-2 flex flex-col gap-1.5"
          >
            <div className="flex h-[60px] items-end gap-1.5 border-b border-line sm:gap-2 xl:gap-1.5">
              {candidatos.dias.map((d, i) => (
                <span key={d.dia} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
                  {i === iMaior && d.n > 0 && (
                    <span className="text-[12px] leading-[14px] font-semibold text-ink">{d.n}</span>
                  )}
                  {d.n > 0 && (
                    <span
                      className="block w-full max-w-3.5 rounded-t-[4px] bg-line-strong"
                      style={{ height: Math.max(4, Math.round((42 * d.n) / maior)) }}
                    />
                  )}
                </span>
              ))}
            </div>
            <p className="flex justify-between text-[12px] leading-4 text-ink-muted">
              <span>{candidatos.dias[0]?.dia}</span>
              <span>Hoje</span>
            </p>
          </div>
        </div>
        {numeros.map((n) => (
          <div
            key={n.nome}
            className={`flex flex-col gap-1 bg-surface-200 px-4 py-4 sm:px-5 ${n.largo ? "col-span-2 xl:col-span-1" : ""}`}
          >
            <p className="flex justify-between gap-2 text-body-sm">
              <span className="font-semibold">{n.nome}</span>
              {n.periodo && <span className="text-ink-muted max-xl:hidden">{n.periodo}</span>}
            </p>
            <p className="text-[28px] leading-[34px] font-bold tracking-[-0.5px] sm:text-[30px] sm:leading-9">{n.valor}</p>
            {n.parte !== undefined && (
              <span aria-hidden className="block h-2 overflow-hidden rounded-pill bg-cerrado/15">
                <span
                  className="block h-full rounded-pill bg-cerrado"
                  style={{ width: `${Math.round(Math.min(1, Math.max(0, n.parte)) * 100)}%` }}
                />
              </span>
            )}
            {n.situacao ? (
              <p
                className={`flex items-center gap-1.5 text-body-sm font-semibold ${
                  n.situacao.bom ? "text-cerrado-text" : "text-ink-muted"
                }`}
              >
                {n.situacao.bom && <Check aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />}
                {n.situacao.texto}
              </p>
            ) : (
              (n.sub || n.periodo) && (
                <p className="text-body-sm text-ink-muted">
                  <span className="xl:hidden">{n.periodo && !n.sub ? n.periodo : n.sub}</span>
                  <span className="max-xl:hidden">{n.sub}</span>
                </p>
              )
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
