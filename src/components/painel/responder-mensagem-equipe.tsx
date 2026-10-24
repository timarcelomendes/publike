"use client";

import { Reply, Send } from "lucide-react";
import { useState } from "react";
import { responderMensagemDaEquipe } from "@/lib/acoes/mensagens-equipe";
import { LIMITES_MENSAGEM_EQUIPE } from "@/lib/mensagem-equipe";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

/** "Responder" embaixo de uma mensagem da equipe: a resposta vai para o admin (e por e-mail para a equipe). */
export function ResponderMensagemDaEquipe({ mensagemId }: { mensagemId: number }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");

  if (!aberto)
    return (
      <div className="flex flex-col items-start gap-1">
        <Botao tamanho="sm" variante="fantasma" onClick={() => setAberto(true)}>
          <Reply aria-hidden />
          Responder
        </Botao>
        {mensagem}
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`resposta-${mensagemId}`} className="sr-only">
        Sua resposta para a equipe do Publike
      </label>
      <textarea
        id={`resposta-${mensagemId}`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={LIMITES_MENSAGEM_EQUIPE.resposta}
        rows={3}
        autoFocus
        placeholder="Escreva sua resposta para a equipe do Publike"
        className={`${classesEntrada} min-h-24 py-2`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Botao
          tamanho="sm"
          disabled={pendente || !texto.trim()}
          onClick={() =>
            rodar(
              () => responderMensagemDaEquipe(mensagemId, texto.trim()),
              (r) => {
                if (r.ok) {
                  setTexto("");
                  setAberto(false);
                }
              },
            )
          }
        >
          <Send aria-hidden />
          {pendente ? "Mandando…" : "Mandar resposta"}
        </Botao>
        <Botao tamanho="sm" variante="fantasma" onClick={() => setAberto(false)}>
          Cancelar
        </Botao>
      </div>
      {mensagem}
    </div>
  );
}
