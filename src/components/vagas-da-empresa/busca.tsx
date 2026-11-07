import { MapPin, Search } from "lucide-react";

// A busca grande da página de vagas (claude/plano-pagina-de-vagas.md, parte 4): o cargo (ou uma palavra) e o bairro,
// lado a lado, logo embaixo do alto da página, como nas páginas de carreiras. Um formulário comum (GET): funciona
// sem JavaScript e o endereço guarda a busca. Os outros filtros escolhidos (área, contratação, jeito de ver) vão junto.

export function BuscaDasVagas({
  base,
  q,
  bairro,
  bairros,
  manter,
  cor,
  textoSobreCor,
}: {
  base: string;
  q: string;
  bairro: string;
  /** os bairros das vagas, com quantas tem cada um */
  bairros: [string, number][];
  /** os outros filtros do endereço, que ficam */
  manter: Record<string, string>;
  /** a cor da marca no botão (null: a cor do Publike) */
  cor: string | null;
  textoSobreCor: string;
}) {
  return (
    <form
      action={base}
      role="search"
      aria-label="Procurar nas vagas"
      className="mt-6 grid gap-2 rounded-lg border border-line bg-surface-200 p-3 shadow-card sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:p-4"
    >
      {Object.entries(manter).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="relative flex min-w-0 items-center">
        <span className="sr-only">Cargo ou palavra</span>
        <Search aria-hidden className="pointer-events-none absolute left-3.5 size-5 text-ink-muted" />
        <input
          name="q"
          type="search"
          defaultValue={q}
          maxLength={80}
          placeholder="Cargo ou palavra"
          className="min-h-12 w-full rounded-md border border-line-strong bg-surface-100 pr-3 pl-11 text-body"
        />
      </label>
      {bairros.length > 1 ? (
        <label className="relative flex min-w-0 items-center">
          <span className="sr-only">Bairro</span>
          <MapPin aria-hidden className="pointer-events-none absolute left-3.5 size-5 text-ink-muted" />
          <select
            name="bairro"
            defaultValue={bairro}
            className="min-h-12 w-full appearance-none rounded-md border border-line-strong bg-surface-100 pr-8 pl-11 text-body"
          >
            <option value="">Todos os bairros</option>
            {bairros.map(([b, n]) => (
              <option key={b} value={b}>
                {b} ({n})
              </option>
            ))}
          </select>
        </label>
      ) : (
        bairro && <input type="hidden" name="bairro" value={bairro} />
      )}
      <button
        type="submit"
        className="min-h-12 rounded-md px-6 text-label hover:opacity-90"
        style={{ background: cor ?? "var(--pk-ink)", color: cor ? textoSobreCor : "var(--pk-surface-100)" }}
      >
        Buscar vagas
      </button>
    </form>
  );
}
