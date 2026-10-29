"use client";

import { BellRing } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { apagarBusca } from "@/lib/acoes/buscas";
import type { AvisoLigado } from "@/lib/acoes/curtidas";

/**
 * Depois da primeira curtida numa vaga: o aviso de vaga nova da mesma área já ficou ligado
 * (avisoDaPrimeiraCurtida). A linha diz isso e deixa parar ali mesmo.
 */
export function LinhaDoAvisoLigado({ aviso, className = "" }: { aviso: AvisoLigado; className?: string }) {
  const [parado, setParado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm ${className}`}>
      <BellRing aria-hidden className="size-4 shrink-0 text-ink-muted" />
      {parado ? (
        <span>Pronto: sem aviso de vaga nova.</span>
      ) : (
        <>
          <span className="min-w-0 flex-1">Vamos avisar quando sair vaga de {aviso.area} perto de você.</span>
          <button
            type="button"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                setErro(null);
                const r = await chamarAcao(() => apagarBusca(aviso.id));
                if (r.ok) setParado(true);
                else setErro(r.erro);
              })
            }
            className="min-h-9 text-label underline underline-offset-2 disabled:opacity-60"
          >
            Parar
          </button>
        </>
      )}
      {erro && <span className="w-full text-danger">{erro}</span>}
    </p>
  );
}
