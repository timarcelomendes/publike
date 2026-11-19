"use client";

import { ChevronRight } from "lucide-react";
import type { RascunhoConvite } from "@/lib/convites";
import { valorDaVagaLida } from "@/lib/leitura-de-vagas";

/**
 * O anúncio tinha mais de uma vaga (a foto ou o texto lidos pela IA, 19/11/2026): a pessoa escolhe qual preencher
 * agora. Antes vinha sempre a primeira, e mandar de novo trazia a mesma.
 */
export function EscolherVagaLida({
  vagas,
  aoEscolher,
  de,
}: {
  vagas: RascunhoConvite[];
  aoEscolher: (vaga: RascunhoConvite) => void;
  de: "imagem" | "texto";
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-300 p-3" role="group" aria-label="As vagas do anúncio">
      <p className="text-label">Achamos {vagas.length} vagas. Qual você quer publicar agora?</p>
      <ul className="flex flex-col gap-2">
        {vagas.map((v, i) => {
          const detalhe = [valorDaVagaLida(v), [v.bairro, v.cidade].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
          return (
            <li key={`${i}-${v.titulo}`}>
              <button
                type="button"
                onClick={() => aoEscolher(v)}
                className="flex min-h-12 w-full items-center gap-3 rounded-md border border-line bg-surface-200 px-3 py-2 text-left hover:border-line-strong"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-label">
                    {v.titulo}
                    {v.quantidade > 1 ? ` (${v.quantidade} vagas)` : ""}
                  </span>
                  <span className="block text-body-sm text-ink-muted">{detalhe || "Toque para preencher"}</span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-body-sm text-ink-muted">
        Depois de publicar esta, {de === "imagem" ? "mande a foto de novo" : "cole o texto de novo"} e escolha a próxima.
      </p>
    </div>
  );
}
