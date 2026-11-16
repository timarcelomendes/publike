"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { convidarPeloCopiloto } from "@/lib/acoes/copiloto";
import { convidarParaVaga } from "@/lib/acoes/talentos";
import { useAcao } from "../ui/usar-acao";
import { Convidado } from "./convidado";

/** Convida alguém de Talentos para a vaga. Depois do convite, fica marcado, com o Desconvidar ao lado. */
export function BotaoConvidar({
  anuncioId,
  perfilId,
  convidado: jaConvidado,
  copiloto = false,
}: {
  anuncioId: string;
  perfilId: string;
  convidado: boolean;
  /** pelo copiloto: com o limite de 3 convites por semana para cada pessoa */
  copiloto?: boolean;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  // o que mudou nesta tela vale; senão, o que veio do servidor (que muda depois do convite em lote)
  const [aqui, setConvidado] = useState<boolean | null>(null);
  const convidado = aqui ?? jaConvidado;
  if (convidado) {
    return <Convidado anuncioId={anuncioId} perfilId={perfilId} aoDesfazer={() => setConvidado(false)} />;
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          rodar(
            () => (copiloto ? convidarPeloCopiloto : convidarParaVaga)(anuncioId, perfilId),
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
