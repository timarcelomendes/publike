"use client";

import { Sparkles } from "lucide-react";
import { liberarCopiloto } from "@/lib/acoes/admin";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Liga ou desliga o copiloto de contratação (teste) para uma conta. */
export function BotaoCopiloto({ contaId, liberado }: { contaId: string; liberado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-1">
      <Botao
        tamanho="sm"
        variante={liberado ? "secundario" : "primario"}
        disabled={pendente}
        onClick={() => rodar(() => liberarCopiloto(contaId, !liberado))}
      >
        <Sparkles aria-hidden />
        {liberado ? "Tirar o copiloto" : "Liberar o copiloto"}
      </Botao>
      {mensagem}
    </div>
  );
}
