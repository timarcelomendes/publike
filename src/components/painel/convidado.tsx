"use client";

import { Check, Undo2 } from "lucide-react";
import { useState } from "react";
import { desconvidar } from "@/lib/acoes/talentos";
import { useAcao } from "../ui/usar-acao";

/**
 * "Convidado", com o jeito de desfazer: "Desconvidar" pede a confirmação e tira o convite e o aviso do sino da
 * pessoa (enquanto ela não curtiu a vaga). Depois, `aoDesfazer` volta o cartão para "Convidar".
 */
export function Convidado({
  anuncioId,
  perfilId,
  nome,
  aoDesfazer,
  texto = "Convidado",
  compacto = false,
}: {
  anuncioId: string;
  perfilId: string;
  nome?: string;
  aoDesfazer: () => void;
  texto?: string;
  /** a letra menor das listas (em vez da do cartão) */
  compacto?: boolean;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [confirmando, setConfirmando] = useState(false);
  const letra = compacto ? "text-body-sm" : "text-label";
  const primeiroNome = nome?.split(" ")[0];

  if (confirmando) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <p className="text-body-sm">
          Desfazer o convite{primeiroNome ? ` de ${primeiroNome}` : ""}? O aviso do convite some do sino.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pendente}
            onClick={() =>
              rodar(
                () => desconvidar(anuncioId, perfilId),
                (r) => {
                  if (r.ok) aoDesfazer();
                  else setConfirmando(false);
                },
              )
            }
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong bg-surface-200 px-3 text-label hover:bg-surface-300 disabled:opacity-60"
          >
            <Undo2 aria-hidden className="size-4" />
            {pendente ? "Desfazendo…" : "Desconvidar"}
          </button>
          <button
            type="button"
            disabled={pendente}
            onClick={() => setConfirmando(false)}
            className="inline-flex min-h-10 items-center px-2 text-label text-ink-muted underline-offset-2 hover:underline"
          >
            Manter o convite
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-x-3">
        <span className={`inline-flex min-h-10 items-center gap-1.5 ${letra} text-cerrado-text`}>
          <Check aria-hidden className={compacto ? "size-4" : "size-[18px]"} />
          {texto}
        </span>
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="inline-flex min-h-10 items-center text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
          aria-label={nome ? `Desconvidar ${nome}` : "Desconvidar"}
        >
          Desconvidar
        </button>
      </div>
      {mensagem}
    </div>
  );
}
