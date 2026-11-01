"use client";

import { Undo2 } from "lucide-react";
import { desfazerRegra } from "@/lib/acoes/regras";
import { useAcao } from "../ui/usar-acao";

/** Desfazer o que uma regra fez com uma pessoa (a etapa de antes; mensagem que já saiu não volta). */
export function DesfazerRegra({ feita, nome }: { feita: number; nome: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() => rodar(() => desfazerRegra(feita))}
        aria-label={`Desfazer o que a regra fez com ${nome}`}
        className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-label text-ink-muted hover:bg-surface-300 hover:text-ink disabled:opacity-50"
      >
        <Undo2 aria-hidden className="size-4" />
        Desfazer
      </button>
      {mensagem}
    </span>
  );
}
