"use client";

import { useState } from "react";

/** O "Sobre" da empresa no alto da página de vagas: 3 linhas e "Ler mais" quando o texto é longo. */
export function SobreDaEmpresa({ texto }: { texto: string }) {
  const [aberto, setAberto] = useState(false);
  const longo = texto.length > 220 || texto.split("\n").length > 3;
  return (
    <div className="flex flex-col items-start gap-1">
      <p className={`text-body whitespace-pre-line text-ink-muted ${longo && !aberto ? "line-clamp-3" : ""}`}>
        {texto}
      </p>
      {longo && (
        <button
          type="button"
          aria-expanded={aberto}
          onClick={() => setAberto((a) => !a)}
          className="min-h-10 text-label underline underline-offset-2 hover:text-terra-text"
        >
          {aberto ? "Ler menos" : "Ler mais"}
        </button>
      )}
    </div>
  );
}
