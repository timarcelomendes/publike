import { ChevronDown, CircleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

/** Classes dos campos: borda line-strong (3:1), cantos radius-sm.
 *  `appearance-none` tira o visual nativo (o Safari ignora borda, altura e cantos sem isso). */
export const classesEntrada = [
  "w-full min-h-11 appearance-none rounded-sm border border-line-strong bg-surface-200 px-3 py-2 text-body text-ink",
  "placeholder:text-ink-muted/80 disabled:opacity-60",
  "aria-[invalid=true]:border-danger",
].join(" ");

/** `<select>` com a mesma cara em todos os navegadores: sem o visual nativo e com a seta desenhada aqui.
 *  `className` vai no select (ex.: classesEntrada); `envoltorio` na caixa em volta (ex.: shrink-0). */
export function Seletor({ className = "", envoltorio = "", ...props }: ComponentProps<"select"> & { envoltorio?: string }) {
  return (
    <div className={`relative ${envoltorio}`}>
      <select {...props} className={`${className} cursor-pointer appearance-none pr-9 disabled:cursor-not-allowed`} />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
}

export function Campo({
  rotulo,
  nome,
  ajuda,
  erro,
  opcional,
  children,
  className = "",
}: {
  rotulo: ReactNode;
  nome: string;
  ajuda?: ReactNode;
  erro?: string;
  opcional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={nome} className="text-label text-ink">
        {rotulo}
        {opcional && <span className="font-normal text-ink-muted"> (opcional)</span>}
      </label>
      {children}
      {ajuda && !erro && (
        <p id={`${nome}-ajuda`} className="text-body-sm text-ink-muted">
          {ajuda}
        </p>
      )}
      {erro && <MensagemErro id={`${nome}-erro`}>{erro}</MensagemErro>}
    </div>
  );
}

export function MensagemErro({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-body-sm text-danger">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Props de acessibilidade para ligar o campo à ajuda e ao erro. */
export function ligarCampo(nome: string, erro?: string, temAjuda = false) {
  const ids = [erro ? `${nome}-erro` : null, !erro && temAjuda ? `${nome}-ajuda` : null].filter(Boolean);
  return {
    id: nome,
    name: nome,
    "aria-invalid": erro ? true : undefined,
    "aria-describedby": ids.length ? ids.join(" ") : undefined,
  } as const;
}
