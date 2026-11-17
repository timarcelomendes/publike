"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { conversasDaJanela } from "@/lib/acoes/mensagens";
import type { ConversaPessoa } from "@/lib/conversas";

// Fora de janela-mensagens.tsx (17/11/2026): o botão do chat usa isto em todas as páginas, e a janela (com a conversa
// e o Supabase ao vivo) só baixa quando a pessoa abre o chat.

/**
 * As conversas da conta, para o número de não lidas no botão do chat e para a lista. Atualiza quando o sino recebe
 * o aviso de mensagem nova (o evento `publike:aviso` de notificacoes.tsx) e, com a página à vista, a cada minuto.
 * Sem canal ao vivo próprio (01/11/2026): ouvir todas as mensagens sem filtro fazia o banco conferir a permissão de
 * cada pessoa conectada a cada mensagem, e ajudou a esgotar a memória do banco.
 */
export function useConversasDoChat(usuarioId: string | null) {
  const [conversas, setConversas] = useState<ConversaPessoa[] | null>(null);
  const carregando = useRef(false);

  const carregar = useCallback(async () => {
    if (!usuarioId || carregando.current) return;
    carregando.current = true;
    try {
      setConversas(await conversasDaJanela());
    } finally {
      carregando.current = false;
    }
  }, [usuarioId]);

  useEffect(() => {
    if (!usuarioId) return;
    void carregar();
    let espera: ReturnType<typeof setTimeout> | null = null;
    const aviso = (e: Event) => {
      if ((e as CustomEvent<{ tipo?: string }>).detail?.tipo !== "mensagem") return;
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => void carregar(), 800);
    };
    window.addEventListener("publike:aviso", aviso);
    const relogio = setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, 60_000);
    // voltando à aba (a conversa pode ter sido lida no celular ou em outra aba): as não lidas na hora
    const voltou = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    document.addEventListener("visibilitychange", voltou);
    return () => {
      clearInterval(relogio);
      if (espera) clearTimeout(espera);
      window.removeEventListener("publike:aviso", aviso);
      document.removeEventListener("visibilitychange", voltou);
    };
  }, [carregar, usuarioId]);

  const marcarLida = useCallback((outroId: string) => {
    setConversas(
      (atual) =>
        atual?.map((c) => (c.outro_id === outroId ? { ...c, nao_lidas: 0, marcada_nao_lida: false } : c)) ?? null,
    );
  }, []);

  const naoLidas = (conversas ?? []).reduce((t, c) => t + (c.nao_lidas ?? 0), 0);
  return { conversas, carregar, marcarLida, naoLidas };
}
