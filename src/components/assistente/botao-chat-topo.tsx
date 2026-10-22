"use client";

import { MessagesSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { EVENTO_NAO_LIDAS, naoLidasDoChat, pedirChat } from "@/lib/abrir-conversa";

function ouvirNaoLidas(avisar: () => void) {
  window.addEventListener(EVENTO_NAO_LIDAS, avisar);
  return () => window.removeEventListener(EVENTO_NAO_LIDAS, avisar);
}

/**
 * O Chat no cabeçalho, só no celular e para quem tem conta: o botão do canto da tela some ali
 * (cobria os cartões e os botões de curtir). O número são as mensagens não lidas; começa com a
 * conta do servidor e acompanha a do Chat.
 */
export function BotaoChatTopo({ novas }: { novas: number }) {
  const router = useRouter();
  // a conta do Chat, quando ele já contou; antes disso (e no servidor), a do servidor
  const naoLidas = useSyncExternalStore(
    ouvirNaoLidas,
    () => naoLidasDoChat() ?? novas,
    () => novas,
  );
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      data-assistente="topo"
      // sem o Chat na página, as conversas em tela cheia
      onClick={() => pedirChat() || router.push("/painel/conversas")}
      className="relative flex size-11 items-center justify-center rounded-pill text-ink hover:bg-surface-300 md:hidden"
    >
      <MessagesSquare aria-hidden className="size-5" />
      {naoLidas > 0 && (
        <span className="absolute top-1.5 right-1.5 flex min-w-5 items-center justify-center rounded-pill bg-like px-1 text-[11px] leading-5 font-bold text-on-like">
          {naoLidas > 9 ? "9+" : naoLidas}
        </span>
      )}
      <span className="sr-only">
        {naoLidas === 0 ? "Chat" : naoLidas === 1 ? "Chat, 1 mensagem nova" : `Chat, ${naoLidas} mensagens novas`}
      </span>
    </button>
  );
}
