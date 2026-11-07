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

// Quem já usou o chat neste navegador (abriu pelo botão ou mandou uma pergunta): o chat não abre mais sozinho
// para ele (o convite de quem não entrou, em botao-assistente.tsx). Quem só fechou sem usar continua recebendo.
const CHAVE_USOU = "publike_chat_usou";

export function marcarQueUsouOChat() {
  try {
    window.localStorage.setItem(CHAVE_USOU, "1");
  } catch {
    // sem armazenamento: nada a guardar
  }
}

export function jaUsouOChat() {
  try {
    return window.localStorage.getItem(CHAVE_USOU) === "1";
  } catch {
    return true;
  }
}

// Quem não entrou e já tocou em Curtir ou foi publicar (neste navegador): o chat da saída não aparece para ele.
const CHAVE_AGIU = "publike_visitante_agiu";

export function marcarQueAgiu() {
  try {
    window.localStorage.setItem(CHAVE_AGIU, "1");
  } catch {
    // sem armazenamento: nada a guardar
  }
}

export function jaAgiu() {
  try {
    return window.localStorage.getItem(CHAVE_AGIU) === "1";
  } catch {
    return true;
  }
}

// Perguntas que vêm de fora da conversa: a busca da página de ajuda, quando não
// acha a resposta, manda o que a pessoa digitou para a conversa que está na tela.

let naTela = 0;
let pedida: string | null = null;
const ouvintesDaTela = new Set<() => void>();

function avisarTela() {
  for (const o of ouvintesDaTela) o();
}

/** A conversa avisa que está na tela e passa a receber as perguntas mandadas (devolve a função que desliga). */
export function conversaNaTela(aoPedir: () => void) {
  naTela++;
  ouvintesDaTela.add(aoPedir);
  avisarTela();
  return () => {
    naTela--;
    ouvintesDaTela.delete(aoPedir);
    avisarTela();
  };
}

/** Tem uma conversa na tela para receber a pergunta? */
export function useTemConversaNaTela() {
  return useSyncExternalStore(
    (avisar) => {
      ouvintesDaTela.add(avisar);
      return () => ouvintesDaTela.delete(avisar);
    },
    () => naTela > 0,
    () => false,
  );
}

/** Manda uma pergunta para a conversa da tela, como se a pessoa tivesse escrito lá. */
export function perguntarNaConversa(texto: string) {
  pedida = texto;
  avisarTela();
}

/** A conversa pega a pergunta mandada (uma vez só). */
export function tirarPerguntaPedida() {
  const p = pedida;
  pedida = null;
  return p;
}
