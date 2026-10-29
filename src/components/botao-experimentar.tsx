"use client";

import { Gift, Send } from "lucide-react";
import { experimentarRecurso, queroContinuar } from "@/lib/acoes/recursos";
import { DIAS_GRATIS, type RecursoPago } from "@/lib/recursos-pagos";
import { Botao } from "./ui/botao";
import { useAcao } from "./ui/usar-acao";

/** "Experimentar 15 dias grátis" (abre na hora) ou "Quero continuar" (avisa o Publike). */
export function BotaoExperimentar({
  recurso,
  acao,
  tamanho = "md",
}: {
  recurso: RecursoPago;
  acao: "experimentar" | "continuar";
  tamanho?: "md" | "sm";
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const experimentar = acao === "experimentar";
  return (
    <div className="flex flex-col items-start gap-2">
      <Botao
        variante={experimentar ? "primario" : "secundario"}
        tamanho={tamanho}
        disabled={pendente}
        onClick={() => rodar(() => (experimentar ? experimentarRecurso(recurso) : queroContinuar(recurso)))}
      >
        {experimentar ? <Gift aria-hidden /> : <Send aria-hidden />}
        {experimentar ? `Experimentar ${DIAS_GRATIS} dias grátis` : "Quero continuar"}
      </Botao>
      {mensagem}
    </div>
  );
}
