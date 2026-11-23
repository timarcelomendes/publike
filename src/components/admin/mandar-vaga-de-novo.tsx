"use client";

import { Send } from "lucide-react";
import { mandarVagaDeNovo } from "@/lib/acoes/admin-vagas-whatsapp";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

// Admin › Publicar pelo WhatsApp › As últimas vagas: a vaga preparada que não foi publicada sai de novo pela conversa,
// com o "Sim, publicar" (migração 20270916160000).

export function MandarVagaDeNovo({ vagaId }: { vagaId: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <span className="flex flex-col items-start gap-1 sm:items-end">
      <Botao tamanho="sm" variante="secundario" disabled={pendente} onClick={() => rodar(() => mandarVagaDeNovo(vagaId))}>
        <Send aria-hidden />
        {pendente ? "Pedindo…" : "Mandar de novo, com Sim, publicar"}
      </Botao>
      {mensagem}
    </span>
  );
}
