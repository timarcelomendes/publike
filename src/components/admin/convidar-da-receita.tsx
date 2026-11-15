"use client";

import { Check, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { convidarDaReceita, type EmpresaDaLista } from "@/lib/acoes/admin-convites";
import { classesBotao } from "../ui/botao";

/** "Pôr nos convites": a empresa da base da Receita entra na lista de Convidados, pronta para mandar. */
export function ConvidarDaReceita({
  empresa,
  tipo,
}: {
  empresa: EmpresaDaLista;
  tipo: "empresa" | "agencia" | "prestador";
}) {
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);
  if (resposta?.ok) {
    return (
      <span role="status" className="inline-flex items-center gap-1 text-body-sm text-cerrado-text">
        <Check aria-hidden className="size-4" />
        Na lista de convites
      </span>
    );
  }
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await convidarDaReceita(empresa, tipo);
            setResposta(r.ok ? { ok: true, texto: r.mensagem ?? "" } : { ok: false, texto: r.erro });
          })
        }
        className={classesBotao("secundario", "sm")}
      >
        <Send aria-hidden />
        {pendente ? "Pondo…" : "Pôr nos convites"}
      </button>
      {resposta && !resposta.ok && (
        <span role="alert" className="text-body-sm text-danger">
          {resposta.texto}
        </span>
      )}
    </span>
  );
}
