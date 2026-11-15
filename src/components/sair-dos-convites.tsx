"use client";

import { useState, useTransition } from "react";
import { sairDosConvites } from "@/lib/acoes/sair-dos-convites";
import { classesBotao } from "./ui/botao";

/** O botão (não o link): os robôs que abrem o link para mostrar a prévia não tiram ninguém da lista. */
export function SairDosConvites({ token }: { token: string }) {
  const [feito, setFeito] = useState<boolean | null>(null);
  const [pendente, iniciar] = useTransition();
  if (feito) {
    return (
      <p role="status" className="text-body text-ink">
        Pronto. Vocês não vão receber mais mensagens do Publike. Se mudarem de ideia, o Publike continua grátis em
        publike.org.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pendente}
        className={classesBotao("primario")}
        onClick={() => iniciar(async () => setFeito((await sairDosConvites(token)).ok))}
      >
        {pendente ? "Saindo…" : "Não quero receber mais"}
      </button>
      {feito === false && (
        <p role="alert" className="text-body-sm text-danger">
          Não deu agora. Tente de novo ou responda a mensagem com “SAIR”.
        </p>
      )}
    </div>
  );
}
