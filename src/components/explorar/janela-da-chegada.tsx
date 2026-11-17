"use client";

import { useState } from "react";
import type { Filtros } from "@/lib/filtros";
import { EVENTO_INTENCAO_ESCOLHIDA, tipoDaIntencao, type Intencao } from "@/lib/intencao";
import { useIrPara } from "./barra-busca";
import { FolhaIntencao } from "./intencao";
import { usePerguntaAdiada } from "./onde-mora";

/**
 * A janela da primeira visita de quem está sem conta (PerguntaDaChegada, no alto da home). Escolhida a resposta, vai
 * para a mesma busca na aba dela (como a PerguntasNaLista fazia) e avisa a lista, que já pergunta onde a pessoa mora
 * sem esperar o servidor. "Agora não" adia para a próxima visita (o mesmo sessionStorage das perguntas da lista).
 */
export function JanelaDaChegada({ filtros, cidade }: { filtros: Filtros; cidade: string }) {
  const [ir] = useIrPara(filtros);
  const [adiada, adiar] = usePerguntaAdiada();
  const [escolhida, setEscolhida] = useState<Intencao | null>(null);
  if (adiada || escolhida) return null;

  // Procuro trabalho → Vagas; Quero contratar um serviço → Serviços; Ofereço serviços fica em Tudo (Procuro
  // funcionário vai para a aba Talentos: a própria pergunta leva, em intencao.tsx)
  function escolher(i: Intencao) {
    setEscolhida(i);
    window.dispatchEvent(new CustomEvent<Intencao>(EVENTO_INTENCAO_ESCOLHIDA, { detail: i }));
    const tipo = tipoDaIntencao(i);
    ir({ tipo, tudo: !tipo, regime: tipo === "servico" ? null : filtros.regime }, true);
  }

  return <FolhaIntencao aoEscolher={escolher} aoAdiar={adiar} primeiraVisita cidade={cidade} />;
}
