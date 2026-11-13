import { ChevronDown } from "lucide-react";
import { Selo } from "@/components/ui/basicos";
import type { Mudanca } from "@/lib/impulso-ajuste";

// O ajuste diário do impulso, em beta (migração 20270509120000): o que o robô mudou em cada manhã, para quem
// impulsionou ver que o anúncio é cuidado todo dia. As mais novas primeiro.

export type DiaDoAjuste = { dia: string; mudancas: Mudanca[] };

const diaCurto = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

const NADA: Mudanca = { tipo: "nada", texto: "Nada a mudar para esta vaga." };

function Manha({ a }: { a: DiaDoAjuste }) {
  const mudancas = a.mudancas.length ? a.mudancas : [NADA];
  return (
    <li className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 py-2.5 first:pt-0 last:pb-0">
      <span className="pt-px text-body-sm text-ink-muted tabular-nums">{diaCurto(a.dia)}</span>
      <ul className="flex min-w-0 flex-col gap-2">
        {mudancas.map((m, n) => (
          <li key={n} className="flex min-w-0 flex-col gap-0.5">
            <span className={`text-body-sm break-words ${m.tipo === "nada" ? "text-ink-muted" : "text-ink"}`}>{m.texto}</span>
            {m.porque && <span className="text-body-sm break-words text-ink-muted">{m.porque}</span>}
            {m.itens && m.itens.length > 2 && (
              <details className="group text-body-sm text-ink-muted">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-1 underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
                  Ver as {m.itens.length} buscas
                  <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <ul className="mt-1 flex flex-col gap-0.5 pl-3">
                  {m.itens.map((i) => (
                    <li key={i.busca} className="break-words">
                      “{i.busca}”: {i.porque}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * O diário do ajuste. `noAr`: o impulso está correndo (mostra o que vem, mesmo sem nenhuma manhã ainda); acabado, só
 * aparece se houve ajuste, recolhido.
 */
export function AjustesDoImpulso({ ajustes, noAr }: { ajustes: DiaDoAjuste[]; noAr: boolean }) {
  const mudou = ajustes.reduce((n, a) => n + a.mudancas.filter((m) => m.tipo !== "nada").length, 0);
  const titulo = (
    <span className="flex flex-wrap items-center gap-2 text-label">
      Ajuste diário
      <Selo variante="contorno">Beta</Selo>
    </span>
  );
  if (!noAr) {
    if (!ajustes.length) return null;
    return (
      <details className="group border-t border-line pt-3">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 [&::-webkit-details-marker]:hidden">
          {titulo}
          <span className="text-body-sm text-ink-muted">
            {mudou === 0 ? "nada precisou mudar" : `${mudou} ${mudou === 1 ? "mudança" : "mudanças"} em ${ajustes.length} ${ajustes.length === 1 ? "dia" : "dias"}`}
          </span>
          <ChevronDown aria-hidden className="size-4 text-ink-muted transition-transform group-open:rotate-180" />
        </summary>
        <ol className="mt-3 flex flex-col divide-y divide-line">
          {ajustes.map((a) => (
            <Manha key={a.dia} a={a} />
          ))}
        </ol>
      </details>
    );
  }
  return (
    <section aria-label="Ajuste diário" className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-col gap-1">
        {titulo}
        <p className="max-w-2xl text-body-sm text-ink-muted">
          Toda manhã, o Publike olha os números do dia anterior no Google e acerta o anúncio: a verba do dia, o lance,
          as buscas que não são desta vaga e o raio. No beta, sem custo.
        </p>
      </div>
      {ajustes.length === 0 ? (
        <p className="text-body-sm text-ink-muted">O primeiro ajuste sai quando o anúncio completar um dia no ar.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {ajustes.map((a) => (
            <Manha key={a.dia} a={a} />
          ))}
        </ol>
      )}
    </section>
  );
}
