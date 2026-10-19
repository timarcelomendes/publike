"use client";

import { useState, useTransition, type ReactNode } from "react";
import { recusarConvite } from "@/lib/acoes/convite";
import { Aviso } from "./ui/basicos";

/** Quem chegou pelo link do convite: de quem é o convite, o que fazer e como dizer que não quer. */
export function AvisoConvite({ token, nome, children }: { token: string; nome: string; children: ReactNode }) {
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, iniciar] = useTransition();
  if (resposta?.ok) {
    return (
      <Aviso tipo="info" titulo="Combinado">
        {resposta.texto}
      </Aviso>
    );
  }
  return (
    <Aviso tipo="info" titulo={`Convite do Publike para ${nome}`}>
      <span className="flex flex-col gap-2">
        <span>{children}</span>
        <span className="flex flex-wrap items-center gap-x-3">
          <button
            type="button"
            disabled={enviando}
            onClick={() =>
              iniciar(async () => {
                const r = await recusarConvite(token);
                setResposta(r.ok ? { ok: true, texto: r.mensagem ?? "" } : { ok: false, texto: r.erro });
              })
            }
            className="min-h-10 text-body-sm text-ink-muted underline underline-offset-2"
          >
            Não quero receber convites
          </button>
          {resposta && !resposta.ok && <span className="text-body-sm text-danger">{resposta.texto}</span>}
        </span>
      </span>
    </Aviso>
  );
}
