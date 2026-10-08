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
