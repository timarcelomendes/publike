"use client";

import { useState } from "react";
import { cancelarAssinatura } from "@/lib/acoes/assinatura";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Cancelar em dois toques (sem caixa do navegador): o primeiro diz o que acontece, o segundo cancela. */
export function CancelarAssinatura({ id, ate }: { id: string; ate: string | null }) {
  const [certeza, setCerteza] = useState(false);
  const { rodar, pendente, mensagem } = useAcao();
  if (!certeza) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Botao variante="fantasma" tamanho="sm" onClick={() => setCerteza(true)}>
          Cancelar assinatura
        </Botao>
        {mensagem}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2 rounded-md bg-surface-300 p-3">
      <p className="text-body-sm">
        Não vai ter mais cobrança. {ate ? `O recurso continua até ${ate}; depois, fecha` : "O recurso fecha"}, e o que
        você fez fica guardado.
      </p>
      <div className="flex flex-wrap gap-2">
        <Botao variante="perigo" tamanho="sm" disabled={pendente} onClick={() => rodar(() => cancelarAssinatura(id))}>
          Cancelar a assinatura
        </Botao>
        <Botao variante="secundario" tamanho="sm" disabled={pendente} onClick={() => setCerteza(false)}>
          Manter
        </Botao>
      </div>
      {mensagem}
    </div>
  );
}
