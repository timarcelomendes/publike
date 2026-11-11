"use client";

import { useState } from "react";
import { cancelarMutirao } from "@/lib/acoes/mutirao";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Cancelar o mutirão em dois toques: quem foi chamado recebe o aviso. */
export function CancelarMutirao({ id }: { id: string }) {
  const [certeza, setCerteza] = useState(false);
  const { rodar, pendente, mensagem } = useAcao();
  if (!certeza)
    return (
      <div className="flex flex-col items-start gap-2 print:hidden">
        <Botao variante="fantasma" tamanho="sm" onClick={() => setCerteza(true)}>
          Cancelar o mutirão
        </Botao>
        {mensagem}
      </div>
    );
  return (
    <div className="flex flex-col items-start gap-2 rounded-md bg-surface-300 p-3 print:hidden">
      <p className="text-body-sm">As entrevistas do dia são canceladas, e quem foi chamado recebe o aviso.</p>
      <div className="flex flex-wrap gap-2">
        <Botao variante="perigo" tamanho="sm" disabled={pendente} onClick={() => rodar(() => cancelarMutirao(id))}>
          Cancelar o mutirão
        </Botao>
        <Botao variante="secundario" tamanho="sm" disabled={pendente} onClick={() => setCerteza(false)}>
          Manter
        </Botao>
      </div>
      {mensagem}
    </div>
  );
}
