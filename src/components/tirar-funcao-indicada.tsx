"use client";

import { useState, useTransition } from "react";
import { tirarFuncaoIndicada } from "@/lib/acoes/leitura-curriculo";

/** "Não é isso? Tirar": confirma antes, porque a função não volta. */
export function TirarFuncaoIndicada({ cbo, nome }: { cbo: string; nome: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  if (!confirmar)
    return (
      <button type="button" onClick={() => setConfirmar(true)} className="text-body-sm underline underline-offset-2">
        Não é isso? Tirar
      </button>
    );
  return (
    <span className="flex flex-wrap items-center gap-2 text-body-sm">
      Tirar {nome}? As empresas deixam de achar você por ela.
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await tirarFuncaoIndicada(cbo);
            if (!r.ok) setErro(r.erro ?? "Não deu.");
          })
        }
        className="text-label underline underline-offset-2"
      >
        {pendente ? "Tirando…" : "Sim, tirar"}
      </button>
      <button type="button" onClick={() => setConfirmar(false)} className="underline underline-offset-2">
        Cancelar
      </button>
      {erro && <span role="alert">{erro}</span>}
    </span>
  );
}
