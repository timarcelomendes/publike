"use client";

import { Globe } from "lucide-react";
import { useState } from "react";
import { mudarVagasEmOutrosSites } from "@/lib/acoes/feed-vagas";
import { useAcao } from "../ui/usar-acao";

/** Página de vagas: "Mostrar minhas vagas em outros sites de vagas" (o arquivo /feed/vagas.xml). */
export function VagasEmOutrosSites({ inicial, onde }: { inicial: boolean; onde: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [ligado, setLigado] = useState(inicial);
  return (
    <section
      aria-labelledby="outros-sites"
      className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <h3 id="outros-sites" className="flex items-center gap-2 text-h3">
        <Globe aria-hidden className="size-5 text-ink-muted" />
        Suas vagas em outros sites
      </h3>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-body">
        <input
          type="checkbox"
          checked={ligado}
          disabled={pendente}
          onChange={(e) => {
            const v = e.target.checked;
            setLigado(v);
            rodar(
              () => mudarVagasEmOutrosSites(v),
              (r) => !r.ok && setLigado(!v),
            );
          }}
          className="mt-1 size-5 shrink-0"
        />
        <span>
          Mostrar minhas vagas também em outros sites de vagas, de graça.
          <span className="block text-body-sm text-ink-muted">
            Hoje: {onde.charAt(0).toLowerCase() + onde.slice(1)}. Quem se candidatar por lá chega na sua caixa de
            candidatos, como sempre. Desligado, as vagas ficam só no Publike e no Google.
          </span>
        </span>
      </label>
      {mensagem}
    </section>
  );
}
