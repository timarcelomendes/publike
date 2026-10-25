"use client";

import { Power } from "lucide-react";
import { ligarCombinam } from "@/lib/acoes/admin";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Ligar (verde) e desligar (vermelho) as vagas e os talentos da semana. */
export function LigarCombinam({ ligado }: { ligado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-2">
      <Botao
        tamanho="sm"
        variante={ligado ? "perigo" : "sucesso"}
        disabled={pendente}
        onClick={() => rodar(() => ligarCombinam(!ligado))}
      >
        <Power aria-hidden />
        {ligado ? "Desligar" : "Ligar o envio"}
      </Botao>
      {mensagem}
    </div>
  );
}
