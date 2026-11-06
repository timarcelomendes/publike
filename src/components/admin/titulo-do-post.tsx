"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { classesEntrada } from "@/components/ui/campo";
import { MAX_TITULO_DO_DIA } from "@/lib/vagas-do-dia";

/**
 * O título do post de Admin › Vagas do dia: as sugestões (do período e da área) e o campo para escrever outro. Muda
 * só o ?titulo= do endereço e mantém o resto (os filtros e as vagas escolhidas, que o carrossel guarda em ?v=).
 */
export function TituloDoPost({ atual, padrao, sugestoes }: { atual: string; padrao: string; sugestoes: string[] }) {
  const router = useRouter();
  const [texto, setTexto] = useState(atual);
  const usar = (t: string) => {
    const url = new URL(window.location.href);
    const limpo = t.trim();
    if (limpo && limpo !== padrao) url.searchParams.set("titulo", limpo);
    else url.searchParams.delete("titulo");
    setTexto(limpo || padrao);
    router.replace(`${url.pathname}${url.search}`.replace(/%2C/gi, ","), { scroll: false });
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        usar(texto);
      }}
    >
      <label htmlFor="titulo-do-post" className="text-label">
        Título do post
      </label>
      <span className="flex flex-wrap gap-2">
        <input
          id="titulo-do-post"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={MAX_TITULO_DO_DIA + 20}
          aria-describedby="titulo-do-post-ajuda"
          className={`${classesEntrada} min-w-0 flex-1 basis-56`}
        />
        <button
          type="submit"
          className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-line-strong px-4 text-label hover:bg-surface-300"
        >
          Usar este título
        </button>
      </span>
      <p id="titulo-do-post-ajuda" className="text-body-sm text-ink-muted">
        Vai na capa do carrossel, na capa dos stories, na legenda e no nome do .zip. Até {MAX_TITULO_DO_DIA} letras (o
        que passar é cortado na última palavra inteira).
      </p>
      <span className="flex flex-wrap gap-2" role="group" aria-label="Sugestões de título">
        {sugestoes.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => usar(s)}
            aria-pressed={s === atual}
            className={`min-h-9 rounded-pill border px-3 text-body-sm transition-colors ${
              s === atual
                ? "border-ink bg-ink text-surface-100"
                : "border-line bg-surface-200 text-ink hover:bg-surface-300"
            }`}
          >
            {s}
          </button>
        ))}
      </span>
    </form>
  );
}
