import { Check, CircleHelp, TriangleAlert, X } from "lucide-react";
import type { Aderencia } from "@/lib/aderencia";

/**
 * A nota de aderência num selo: verde a partir de 80%, amarela a partir de 50%, cinza
 * abaixo disso; "Eliminado" quando a pessoa errou uma pergunta eliminatória. Sem nada
 * para comparar, não aparece. `longo`: "92% de aderência" (na lista); senão, "92%".
 */
export function NotaAderencia({ a, longo = false }: { a: Aderencia; longo?: boolean }) {
  if (a.eliminado) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-danger px-2 py-0.5 text-caption text-danger uppercase">
        Eliminado
      </span>
    );
  }
  if (a.nota === null) return null;
  const cor =
    a.nota >= 80 ? "bg-cerrado text-on-cerrado" : a.nota >= 50 ? "bg-ipe text-on-ipe" : "bg-surface-300 text-ink";
  return (
    <span
      title="Nota de aderência: o quanto bate com o que a vaga pede"
      className={`inline-flex shrink-0 items-center rounded-pill px-2 py-0.5 text-caption font-semibold tabular-nums ${cor}`}
    >
      {a.nota}%{longo && <span className="ml-1 font-normal">de aderência</span>}
    </span>
  );
}

/** O porquê da nota: cada coisa que a vaga pede, com o que a pessoa tem. */
export function CriteriosDaAderencia({ a }: { a: Aderencia }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {a.criterios.map((k) => (
        <li key={k.nome} className="flex items-start gap-2 text-body-sm">
          {k.ok === true ? (
            <Check aria-label="Atende" className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
          ) : k.ok === false ? (
            k.eliminatorio ? (
              <TriangleAlert aria-label="Não atende (eliminatória)" className="mt-0.5 size-4 shrink-0 text-danger" />
            ) : (
              <X aria-label="Não atende" className="mt-0.5 size-4 shrink-0 text-danger" />
            )
          ) : (
            <CircleHelp aria-label="Sem informação" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
          )}
          <span>
            <span className="font-semibold">{k.nome}</span>
            <span className="text-ink-muted"> · {k.detalhe}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
