"use client";

import { Flag, MessageSquareReply } from "lucide-react";
import { useState } from "react";
import { denunciarAvaliacao, responderAvaliacao } from "@/lib/acoes/avaliacoes";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

/** Responder uma vez, em público, ou pedir para a equipe olhar a avaliação. */
export function ResponderAvaliacao({
  id,
  podeResponder,
  denunciada,
}: {
  id: number;
  podeResponder: boolean;
  denunciada: boolean;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [aberto, setAberto] = useState<"responder" | "denunciar" | null>(null);
  const [texto, setTexto] = useState("");

  return (
    <div className="flex flex-col gap-3">
      {aberto === null && (
        <div className="flex flex-wrap gap-2">
          {podeResponder && (
            <Botao tamanho="sm" onClick={() => setAberto("responder")}>
              <MessageSquareReply aria-hidden />
              Responder
            </Botao>
          )}
          {!denunciada && (
            <Botao tamanho="sm" variante="fantasma" onClick={() => setAberto("denunciar")}>
              <Flag aria-hidden />
              Pedir para a equipe olhar
            </Botao>
          )}
        </div>
      )}
      {aberto && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`texto-${id}`} className="text-label">
            {aberto === "responder"
              ? "Sua resposta (aparece no seu perfil, uma vez só)"
              : "O que há de errado nesta avaliação?"}
          </label>
          <textarea
            id={`texto-${id}`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            maxLength={aberto === "responder" ? 600 : 500}
            placeholder={
              aberto === "responder"
                ? "Ex.: Obrigado pela confiança! Sobre o atraso, a chuva não deixou terminar no sábado."
                : "Ex.: Essa pessoa nunca contratou meu serviço."
            }
            className={`${classesEntrada} resize-y`}
          />
          <p className="text-body-sm text-ink-muted">
            {aberto === "responder"
              ? "Responda com educação: a resposta passa pela mesma revisão das avaliações."
              : "A avaliação continua no ar até a equipe decidir."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao
              tamanho="sm"
              variante={aberto === "responder" ? "primario" : "secundario"}
              disabled={pendente || texto.trim().length < 2}
              onClick={() =>
                rodar(
                  () => (aberto === "responder" ? responderAvaliacao(id, texto) : denunciarAvaliacao(id, texto)),
                  (r) => {
                    if (r.ok) setAberto(null);
                  },
                )
              }
            >
              {pendente ? "Enviando…" : aberto === "responder" ? "Publicar resposta" : "Enviar para a equipe"}
            </Botao>
            <Botao tamanho="sm" variante="fantasma" onClick={() => setAberto(null)}>
              Cancelar
            </Botao>
          </div>
        </div>
      )}
      {mensagem}
    </div>
  );
}
