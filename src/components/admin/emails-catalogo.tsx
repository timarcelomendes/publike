"use client";

import { Power } from "lucide-react";
import { ligarEmail } from "@/lib/acoes/admin";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Ligar e desligar um e-mail do catálogo (Admin › E-mails › Todos). */
export function LigarEmail({ modelo, nome, ligado }: { modelo: string; nome: string; ligado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Botao
        tamanho="sm"
        variante={ligado ? "secundario" : "sucesso"}
        disabled={pendente}
        aria-label={ligado ? `Desligar o e-mail ${nome}` : `Ligar o e-mail ${nome}`}
        onClick={() => rodar(() => ligarEmail(modelo, !ligado))}
      >
        <Power aria-hidden />
        {ligado ? "Desligar" : "Ligar"}
      </Botao>
      {mensagem}
    </div>
  );
}
