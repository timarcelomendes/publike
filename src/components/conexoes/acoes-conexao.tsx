"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { desfazerConexao, responderConexao } from "@/lib/acoes/conexoes";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Aceitar ou recusar um pedido de conexão que chegou para mim. */
export function ResponderConexao({ id, principal = true }: { id: string; principal?: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Botao
          variante={principal ? "primario" : "secundario"}
          tamanho="sm"
          disabled={pendente}
          onClick={() => rodar(() => responderConexao(id, true))}
        >
          <Check aria-hidden />
          Aceitar
        </Botao>
        <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(() => responderConexao(id, false))}>
          <X aria-hidden />
          Recusar
        </Botao>
      </div>
      {mensagem}
    </div>
  );
}

/**
 * Cancelar o pedido que fiz, tirar da lista um pedido não aceito ou desfazer a conexão. Desfazer
 * pede confirmação (os contatos deixam de aparecer; a conversa só continua se houver um match).
 */
export function DesfazerConexao({
  id,
  rotulo,
  confirmar,
}: {
  id: string;
  rotulo: string;
  /** a pergunta antes de desfazer (sem ela, desfaz direto) */
  confirmar?: string;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [perguntando, setPerguntando] = useState(false);

  if (perguntando && confirmar) {
    return (
      <div role="alertdialog" aria-label={rotulo} className="flex flex-col gap-2 rounded-md bg-surface-300 p-3">
        <p className="text-body-sm">{confirmar}</p>
        <div className="flex flex-wrap gap-2">
          <Botao variante="perigo" tamanho="sm" disabled={pendente} onClick={() => rodar(() => desfazerConexao(id))}>
            {rotulo}
          </Botao>
          <Botao variante="fantasma" tamanho="sm" disabled={pendente} onClick={() => setPerguntando(false)}>
            Voltar
          </Botao>
        </div>
        {mensagem}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() => (confirmar ? setPerguntando(true) : rodar(() => desfazerConexao(id)))}
        className="min-h-11 text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink disabled:opacity-60"
      >
        {rotulo}
      </button>
      {mensagem}
    </div>
  );
}
