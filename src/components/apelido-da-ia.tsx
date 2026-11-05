"use client";

import { createContext, useContext, type ReactNode } from "react";
import { falasDaIA, type FalasDaIA } from "@/lib/ia-nomes";

// O apelido da IA para as telas do navegador (claude/plano-ia-por-funcionalidade.md): o layout lê uma vez
// (apelidoDaIA, guardado por horas) e passa por aqui. Sem provedor, "a IA".
const Apelido = createContext<string | null>(null);

export function ProvedorDoApelido({ apelido, children }: { apelido: string | null; children: ReactNode }) {
  return <Apelido value={apelido}>{children}</Apelido>;
}

/** "com Ipê", "por Ipê"… (ou "com a IA", "pela IA", sem apelido). */
export function useFalasDaIA() {
  return falasDaIA(useContext(Apelido));
}

/**
 * A IA no meio de um texto, com o apelido de agora: `<IA />` é "a IA" ou "Ipê"; `<IA forma="Nome" />`, no começo
 * da frase; `<IA forma="com" />`, "com a IA" ou "com Ipê". Serve também nas telas do servidor.
 */
export function IA({ forma = "nome" }: { forma?: Exclude<keyof FalasDaIA, "apelido"> }) {
  return <>{useFalasDaIA()[forma]}</>;
}

/** " (Ipê)" depois de "a IA do Publike", nos textos que descrevem a tecnologia (Privacidade); sem apelido, nada. */
export function ApelidoEntreParenteses() {
  const { apelido } = useFalasDaIA();
  return apelido ? <> ({apelido})</> : null;
}
