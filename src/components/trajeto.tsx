import { Bus, Footprints, House, MapPin } from "lucide-react";
import { deslocamentoProvavel, formatarMinutos } from "@/lib/deslocamento";

/** Os tracinhos do caminho, sem a largura (os mesmos da linha no mapa; o cartão do mapa usa estes também). */
export const TRACOS =
  "h-0.5 shrink-0 bg-[repeating-linear-gradient(90deg,currentColor_0_4px,transparent_4px_7px)] text-ink/45";

/**
 * O caminho até a vaga, como no mapa: de onde contam (a casa, do CEP, ou "Você", da localização), a linha
 * tracejada com o ônibus (ou o pé) e o tempo no meio, e o alfinete da vaga. Fica embaixo do lugar no cartão (o
 * mapa monta o mesmo à mão no cartão dele, mapa-anuncios.tsx). Na grade, estreita, só o tempo.
 */
export function TrajetoAteAVaga({ de, km, className = "" }: { de: "casa" | "voce"; km: number; className?: string }) {
  const { jeito, minutos, texto } = deslocamentoProvavel(km);
  const Jeito = jeito === "pe" ? Footprints : Bus;
  return (
    <p className={`flex min-w-0 items-center gap-1 text-body-sm text-ink-muted ${className}`}>
      <span className="sr-only">
        {texto} {de === "casa" ? "da sua casa" : "de onde você está"}
      </span>
      <span aria-hidden className="flex min-w-0 items-center gap-1">
        <span className="inline-flex shrink-0 items-center gap-1 group-data-[visao=grade]/visao:hidden">
          {de === "casa" ? (
            <span className="flex size-4 items-center justify-center rounded-pill bg-terra text-on-terra">
              <House className="size-2.5" strokeWidth={3} />
            </span>
          ) : (
            <span className="flex size-4 items-center justify-center rounded-pill bg-cerrado/20">
              <span className="size-2.5 rounded-pill border-2 border-surface-200 bg-cerrado" />
            </span>
          )}
          {de === "casa" ? "Sua casa" : "Você"}
        </span>
        <span className={`${TRACOS} w-5 group-data-[visao=grade]/visao:hidden`} />
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-surface-300 py-px pr-2 pl-1.5 font-semibold whitespace-nowrap text-ink">
          <Jeito className="size-3.5" />
          {formatarMinutos(minutos)}
        </span>
        <span className={`${TRACOS} w-5 group-data-[visao=grade]/visao:hidden`} />
        <MapPin
          className="size-4 shrink-0 text-terra-text group-data-[visao=grade]/visao:hidden"
          fill="currentColor"
          stroke="var(--pk-surface-200)"
        />
      </span>
    </p>
  );
}
