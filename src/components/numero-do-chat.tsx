"use client";

import { useSyncExternalStore } from "react";
import { EVENTO_NAO_LIDAS, naoLidasDoChat } from "@/lib/abrir-conversa";

function ouvirNaoLidas(avisar: () => void) {
  window.addEventListener(EVENTO_NAO_LIDAS, avisar);
  return () => window.removeEventListener(EVENTO_NAO_LIDAS, avisar);
}

/**
 * As mensagens não lidas, para o número das Mensagens na barra de baixo: começa com a conta do
 * servidor e acompanha a do Chat (que conta de novo quando chega mensagem ou a pessoa lê).
 */
export function useMensagensNovas(doServidor: number) {
  return useSyncExternalStore(
    ouvirNaoLidas,
    () => naoLidasDoChat() ?? doServidor,
    () => doServidor,
  );
}
