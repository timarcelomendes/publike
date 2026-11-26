import { Suspense } from "react";
import type { DadosCard } from "@/lib/tipos";
import { CardAnuncio } from "./card-anuncio";
import { ConviteParaImpulsionar } from "./convite-para-impulsionar";

/**
 * O quadro "Vagas impulsionadas na região" no alto da busca e da linha do tempo (claude/plano-destaque-das-vagas-
 * impulsionadas.md; o da página de vagas da cidade fica em pagina-busca.tsx). Só vagas que passaram no filtro de quem
 * vê; cada cartão leva à vaga com o código do destaque, e a visita e a curtida contam para quem impulsionou.
 *
 * Os dois cartões lado a lado só quando cabem (cada um com uns 330 px ou mais, a largura do quadro, não a da tela): na
 * coluna da lista ao lado do mapa e na Lista, um por linha, como os da lista (25/11/2026, o print do Marcelo com os
 * cartões espremidos no Explorar ao lado do mapa).
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
      className="@container/quadro flex flex-col gap-3 rounded-lg border border-terra/30 bg-terra-soft/60 p-4 sm:p-5"
    >
      <div>
        <h2 id="quadro-impulsionadas" className="text-h3">
          Vagas impulsionadas na região
        </h2>
        {/* sem a frase "Quem contrata pagou..." (14/11/2026, Marcelo: "acho que nao é legal"): quem procura trabalho vê
            só o título; quem contrata, o convite para impulsionar */}
        <Suspense fallback={null}>
          <ConviteParaImpulsionar />
        </Suspense>
      </div>
      <ul className="grid gap-4 @2xl/quadro:grid-cols-2 group-data-[visao=lista]/visao:grid-cols-1">
        {vagas.map((a) => (
          <li key={a.id} className="grid">
            <CardAnuncio
              anuncio={a}
              agora={agora}
              usuarioId={usuarioId}
              // sem o selo "Impulsionada": o título do quadro já diz, e o selo cortava o nome de quem contrata
              impulso={codigos[a.id]?.codigo ?? null}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
