"use client";

import { publicarTeste } from "@/lib/acoes/admin";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Publica um teste da Publike revisado, ou volta para rascunho. */
export function BotaoPublicarTeste({ modeloId, publicado }: { modeloId: string; publicado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-1">
      <Botao
        tamanho="sm"
        variante={publicado ? "secundario" : "primario"}
        disabled={pendente}
        onClick={() => rodar(() => publicarTeste(modeloId, !publicado))}
      >
        {publicado ? "Voltar para rascunho" : "Revisei: publicar"}
      </Botao>
      {mensagem}
    </div>
  );
}
