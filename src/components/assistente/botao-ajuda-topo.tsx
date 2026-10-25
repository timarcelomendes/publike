"use client";

import { CircleHelp } from "lucide-react";
import { useRouter } from "next/navigation";
import { pedirChat } from "@/lib/abrir-conversa";

/**
 * A Ajuda no cabeçalho do celular, para quem não entrou: abre o Chat (o assistente) e, sem ele na página,
 * a página de ajuda. No celular o botão do canto não aparece (cobria o Curtir dos cartões).
 */
export function BotaoAjudaTopo() {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      data-assistente="topo"
      onClick={() => pedirChat() || router.push("/ajuda")}
      className="flex size-11 items-center justify-center rounded-pill text-ink-muted transition-colors hover:bg-surface-300 hover:text-ink md:hidden"
    >
      <CircleHelp aria-hidden className="size-5" />
      <span className="sr-only">Ajuda</span>
    </button>
  );
}
