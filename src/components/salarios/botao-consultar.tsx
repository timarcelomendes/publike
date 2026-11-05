"use client";

import { LockOpen } from "lucide-react";
import { useState, useTransition } from "react";
import { abrirConsultaDeSalario } from "@/lib/acoes/consulta-salarios";
import { Botao } from "../ui/botao";

/** "Ver a consulta completa": gasta uma consulta (o banco confere e segura dois cliques) e a página mostra tudo. */
export function BotaoConsultar({ cbo, texto }: { cbo: string; texto: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <Botao
        variante="primario"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await abrirConsultaDeSalario(cbo);
            if (!r.ok) setErro(r.erro);
          })
        }
      >
        <LockOpen aria-hidden />
        {pendente ? "Abrindo…" : texto}
      </Botao>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}
