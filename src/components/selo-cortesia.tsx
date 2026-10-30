import { Gift } from "lucide-react";
import { EXPLICA_CORTESIA, SELO_CORTESIA, SELO_CORTESIA_CURTO } from "@/lib/cortesia";

/**
 * A marca dos recursos pagos liberados por cortesia (Copiloto e Testes Publike). `curto`: a pílula pequena
 * do menu e das abas; senão, o selo com o texto inteiro, no alto das páginas. `texto`: o do estado da conta
 * (`marcaDoRecurso`); null não mostra nada, e sem ele vale o texto de sempre.
 */
export function SeloCortesia({
  curto = false,
  className = "",
  texto,
}: {
  curto?: boolean;
  className?: string;
  texto?: string | null;
}) {
  if (texto === null) return null;
  // no teste grátis, "faltam 3 dias": o leitor de tela ouve de quê
  const teste = Boolean(texto?.startsWith("falta"));
  if (curto) {
    return (
      <span
        title={teste ? "Teste grátis do recurso pago" : EXPLICA_CORTESIA}
        className={`inline-flex shrink-0 items-center gap-1 rounded-pill bg-ipe px-1.5 py-0.5 text-[11px] leading-none font-semibold text-on-ipe ${className}`}
      >
        <Gift aria-hidden className="size-3" />
        {teste && <span className="sr-only">Teste grátis: </span>}
        {texto ?? SELO_CORTESIA_CURTO}
        {!teste && <span className="sr-only">: {EXPLICA_CORTESIA}</span>}
      </span>
    );
  }
  return (
    <span
      title={EXPLICA_CORTESIA}
      className={`inline-flex shrink-0 items-center gap-1 rounded-pill bg-ipe px-2.5 py-1 text-caption whitespace-nowrap text-on-ipe uppercase ${className}`}
    >
      <Gift aria-hidden className="size-3.5" />
      {texto ?? SELO_CORTESIA}
    </span>
  );
}
