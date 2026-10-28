import { Gift } from "lucide-react";
import { EXPLICA_CORTESIA, SELO_CORTESIA, SELO_CORTESIA_CURTO } from "@/lib/cortesia";

/**
 * A marca dos recursos pagos liberados por cortesia (Copiloto e Testes Publike). `curto`: a pílula pequena
 * do menu e das abas; senão, o selo com o texto inteiro, no alto das páginas.
 */
export function SeloCortesia({ curto = false, className = "" }: { curto?: boolean; className?: string }) {
  if (curto) {
    return (
      <span
        title={EXPLICA_CORTESIA}
        className={`inline-flex shrink-0 items-center gap-1 rounded-pill bg-ipe px-1.5 py-0.5 text-[11px] leading-none font-semibold text-on-ipe ${className}`}
      >
        <Gift aria-hidden className="size-3" />
        {SELO_CORTESIA_CURTO}
        <span className="sr-only">: {EXPLICA_CORTESIA}</span>
      </span>
    );
  }
  return (
    <span
      title={EXPLICA_CORTESIA}
      className={`inline-flex shrink-0 items-center gap-1 rounded-pill bg-ipe px-2.5 py-1 text-caption whitespace-nowrap text-on-ipe uppercase ${className}`}
    >
      <Gift aria-hidden className="size-3.5" />
      {SELO_CORTESIA}
    </span>
  );
}
