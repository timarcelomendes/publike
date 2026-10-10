"use client";

import { useSyncExternalStore } from "react";
import type { CartaoChat, AcaoChat, MensagemChat } from "@/lib/assistente";

// A conversa com o assistente fica só neste navegador (nesta aba, enquanto ela
// estiver aberta): o botão flutuante e a página de ajuda mostram a mesma.

export type ItemConversa = MensagemChat & { cartoes?: CartaoChat[]; acao?: AcaoChat; verMais?: string | null };

const CHAVE = "publike_assistente";
let itens: ItemConversa[] | null = null;
const ouvintes = new Set<() => void>();

function ler(): ItemConversa[] {
  if (itens) return itens;
  try {
    const salvo = JSON.parse(window.sessionStorage.getItem(CHAVE) ?? "[]");
    itens = Array.isArray(salvo) ? (salvo as ItemConversa[]).slice(-40) : [];
  } catch {
    itens = [];
  }
  return itens;
}

export function mudarConversa(novos: ItemConversa[]) {
  itens = novos.slice(-40);
  try {
    window.sessionStorage.setItem(CHAVE, JSON.stringify(itens));
  } catch {
    // sem armazenamento: vale até recarregar
  }
  for (const o of ouvintes) o();
}

const VAZIA: ItemConversa[] = [];

export function useConversa() {
  return useSyncExternalStore(
    (avisar) => {
      ouvintes.add(avisar);
      return () => ouvintes.delete(avisar);
    },
    ler,
    () => VAZIA,
  );
}
