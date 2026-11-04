"use client";

import { MessageCircleQuestion } from "lucide-react";
import { useState } from "react";
import { perguntarNosMatchesSemContato } from "@/lib/acoes/admin";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/**
 * O botão dos matches sem contato (Admin › Retorno; claude/plano-match-no-chat.md, parte 2): o chat faz as perguntas
 * do match a quem ainda não recebeu e cada empresa recebe um aviso. Pede a confirmação antes, porque chega a gente
 * de verdade.
 */
export function PerguntarNosMatches({ perguntas, prontas }: { perguntas: number; prontas: number }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [confirmando, setConfirmando] = useState(false);
  const nada = perguntas === 0 && prontas === 0;
  const frase = [
    perguntas ? `perguntar no chat a ${perguntas === 1 ? "1 pessoa" : `${perguntas} pessoas`}` : "",
    prontas ? `avisar ${prontas === 1 ? "1 empresa" : `${prontas} empresas`}` : "",
  ]
    .filter(Boolean)
    .join(" e ");
  return (
    <div className="flex flex-col items-start gap-2">
      {confirmando ? (
        <div role="group" aria-label="Confirmar o envio" className="flex flex-wrap items-center gap-2">
          <p className="text-body-sm">Vai {frase}. Confirma?</p>
          <Botao
            tamanho="sm"
            variante="primario"
            disabled={pendente}
            onClick={() => rodar(perguntarNosMatchesSemContato, () => setConfirmando(false))}
          >
            Confirmar
          </Botao>
          <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => setConfirmando(false)}>
            Cancelar
          </Botao>
        </div>
      ) : (
        <Botao tamanho="sm" variante="secundario" disabled={nada || pendente} onClick={() => setConfirmando(true)}>
          <MessageCircleQuestion aria-hidden />
          Perguntar nos matches sem contato
        </Botao>
      )}
      {mensagem}
    </div>
  );
}
