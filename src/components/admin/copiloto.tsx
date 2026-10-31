"use client";

import { ClipboardCheck, Sparkles } from "lucide-react";
import { liberarCopiloto, liberarTestes } from "@/lib/acoes/admin";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Libera o Copiloto sem prazo, ou tira (também tira o prazo dos 15 dias grátis). */
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
        {liberado ? "Tirar a Triagem com IA" : "Liberar a Triagem com IA"}
      </Botao>
      {mensagem}
    </div>
  );
}

/** Libera o Teste Prático sem prazo, ou tira. */
export function BotaoTestes({ contaId, liberado }: { contaId: string; liberado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-1">
      <Botao
        tamanho="sm"
        variante={liberado ? "secundario" : "primario"}
        disabled={pendente}
        onClick={() => rodar(() => liberarTestes(contaId, !liberado))}
      >
        <ClipboardCheck aria-hidden />
        {liberado ? "Tirar o Teste Prático" : "Liberar o Teste Prático"}
      </Botao>
      {mensagem}
    </div>
  );
}
