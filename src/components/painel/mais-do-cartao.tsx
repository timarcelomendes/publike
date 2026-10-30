"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { classesBotao } from "../ui/botao";

/**
 * O cartão da vaga em Vagas (claude/plano-painel-simples.md, parte 3): "Abrir a vaga" à vista e o resto no
 * "Mais" (Editar, Pausar, Vaga preenchida, Encerrar, Publicar parecida, Excluir). `aberto`: já abre com o
 * "Mais" à mostra (a vaga vencida ou vencendo, com o Renovar).
 */
export function MaisDoCartao({
  principal,
  aberto: inicial = false,
  children,
}: {
  principal: ReactNode;
  aberto?: boolean;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(inicial);
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {principal}
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={id}
          onClick={() => setAberto((a) => !a)}
          className={classesBotao("fantasma", "sm")}
        >
          Mais
          <ChevronDown aria-hidden className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
        </button>
      </div>
      <div id={id} hidden={!aberto} className="rounded-md border border-line bg-surface-100 p-3">
        {children}
      </div>
    </div>
  );
}
