"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { gerarResumoIA } from "@/lib/acoes/admin";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

export function BotaoResumoIA({ temResumo }: { temResumo: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-2">
      <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(gerarResumoIA)}>
        {temResumo ? <RefreshCw aria-hidden /> : <Sparkles aria-hidden />}
        {pendente ? "A IA está escrevendo…" : temResumo ? "Atualizar resumo" : "Gerar resumo"}
      </Botao>
      {mensagem}
    </div>
  );
}
