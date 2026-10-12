import { Esqueleto } from "../ui/basicos";

export function EsqueletoLista({ quantos = 3 }: { quantos?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      {Array.from({ length: quantos }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5">
          <Esqueleto className="h-6 w-32 rounded-pill" />
          <Esqueleto className="h-6 w-2/3" />
          <Esqueleto className="h-4 w-1/2" />
          <Esqueleto className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Visão geral do painel: "Para fazer agora" e os dois lados, com os passos. */
export function EsqueletoVisaoGeral() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <Esqueleto className="h-24 w-full rounded-lg" />
      {[0, 1].map((lado) => (
        <div key={lado} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Esqueleto className="size-11 rounded-pill" />
            <Esqueleto className="h-7 w-56" />
          </div>
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5">
            <Esqueleto className="h-6 w-48" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <Esqueleto key={i} className="h-[4.75rem] rounded-md" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
