import { Esqueleto } from "../ui/basicos";

export function EsqueletoAdmin() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Esqueleto key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <Esqueleto className="h-64 rounded-lg" />
      <Esqueleto className="h-40 rounded-lg" />
    </div>
  );
}
