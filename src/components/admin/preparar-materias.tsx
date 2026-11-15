"use client";

import { Newspaper } from "lucide-react";
import { useState, useTransition } from "react";
import { prepararMaterias } from "@/lib/acoes/receita-admin";
import { classesBotao } from "../ui/botao";

/** "Preparar as matérias do mês": os negócios que abriram e o que mais contratou, como rascunho em Notícias. */
export function PrepararMaterias({ mes }: { mes: string }) {
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pendente}
        className={classesBotao("secundario")}
        onClick={() =>
          iniciar(async () => {
            const r = await prepararMaterias(mes);
            setResposta(r.ok ? { ok: true, texto: r.mensagem ?? "Pronto." } : { ok: false, texto: r.erro });
          })
        }
      >
        <Newspaper aria-hidden />
        {pendente ? "Escrevendo…" : "Preparar as matérias do mês"}
      </button>
      {resposta && (
        <p role={resposta.ok ? "status" : "alert"} className={`text-body-sm ${resposta.ok ? "text-cerrado-text" : "text-danger"}`}>
          {resposta.texto}
        </p>
      )}
    </div>
  );
}
