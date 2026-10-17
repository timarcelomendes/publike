"use client";

import { Check, Send } from "lucide-react";
import { useState } from "react";
import { convidarParaVaga } from "@/lib/acoes/talentos";
import { useAcao } from "../ui/usar-acao";

/** Convida alguém de Talentos para a vaga. Depois do convite, fica marcado. */
export function BotaoConvidar({
  anuncioId,
  perfilId,
  convidado: jaConvidado,
}: {
  anuncioId: string;
  perfilId: string;
  convidado: boolean;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [convidado, setConvidado] = useState(jaConvidado);
  if (convidado) {
    return (
      <p className="inline-flex min-h-10 items-center gap-1.5 text-label text-cerrado-text">
        <Check aria-hidden className="size-[18px]" />
        Convidado
      </p>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          rodar(
            () => convidarParaVaga(anuncioId, perfilId),
            (r) => r.ok && setConvidado(true),
          )
        }
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line-strong bg-surface-200 px-3.5 text-label hover:bg-surface-300 disabled:opacity-60"
      >
        <Send aria-hidden className="size-[18px]" />
        Convidar para a vaga
      </button>
      {mensagem}
    </div>
  );
}
