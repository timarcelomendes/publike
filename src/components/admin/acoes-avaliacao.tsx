"use client";

import { CircleCheckBig, Trash2 } from "lucide-react";
import { moderarAvaliacao } from "@/lib/acoes/avaliacoes";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Publicar (a IA errou ou a denúncia não procede) ou remover o texto da avaliação. */
export function AcoesModeracaoAvaliacao({ id, parte }: { id: number; parte: "comentario" | "resposta" }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="sm"
          variante="sucesso"
          disabled={pendente}
          onClick={() => rodar(() => moderarAvaliacao(id, parte, "publicar"))}
        >
          <CircleCheckBig aria-hidden />
          Publicar
        </Botao>
        <Botao
          tamanho="sm"
          variante="perigo"
          disabled={pendente}
          onClick={() => rodar(() => moderarAvaliacao(id, parte, "remover"))}
        >
          <Trash2 aria-hidden />
          Remover
        </Botao>
      </div>
      {mensagem}
    </div>
  );
}
