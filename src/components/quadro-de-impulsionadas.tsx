import type { DadosCard } from "@/lib/tipos";
import { CardAnuncio } from "./card-anuncio";

/**
 * O quadro "Vagas impulsionadas na região" no alto da busca e da linha do tempo (claude/plano-destaque-das-vagas-
 * impulsionadas.md; o da página de vagas da cidade fica em pagina-busca.tsx). Só vagas que passaram no filtro de quem
 * vê; cada cartão leva à vaga com o código do destaque, e a visita e a curtida contam para quem impulsionou.
 */
export function QuadroDeImpulsionadas({
  vagas,
  codigos,
  agora,
  usuarioId,
}: {
  vagas: DadosCard[];
  /** o código do impulso de cada vaga */
  codigos: Record<string, { codigo: string | null }>;
  agora: number;
  usuarioId: string | null;
}) {
  return (
    <section
      aria-labelledby="quadro-impulsionadas"
      className="flex flex-col gap-3 rounded-lg border border-terra/30 bg-terra-soft/60 p-4 sm:p-5"
    >
      <div>
        <h2 id="quadro-impulsionadas" className="text-h3">
          Vagas impulsionadas na região
        </h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          Quem contrata pagou para mostrar estas vagas aqui. As outras vêm logo abaixo, na ordem de sempre.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {vagas.map((a) => (
          <li key={a.id} className="grid">
            <CardAnuncio
              anuncio={a}
              agora={agora}
              usuarioId={usuarioId}
              impulsionada
              impulso={codigos[a.id]?.codigo ?? null}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
