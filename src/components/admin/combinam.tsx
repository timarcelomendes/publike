"use client";

import { Power } from "lucide-react";
import { ligarCombinam, ligarReativar } from "@/lib/acoes/admin";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Ligar (verde) e desligar (vermelho) as vagas e os talentos da semana (ou o "Volte a contratar"). */
export function LigarCombinam({ ligado, reativar = false }: { ligado: boolean; reativar?: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-2">
      <Botao
        tamanho="sm"
        variante={ligado ? "perigo" : "sucesso"}
        disabled={pendente}
        onClick={() => rodar(() => (reativar ? ligarReativar(!ligado) : ligarCombinam(!ligado)))}
      >
        <Power aria-hidden />
        {ligado ? "Desligar" : "Ligar o envio"}
      </Botao>
      {mensagem}
    </div>
  );
}
