"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { PAGINAS_DE_MENSAGENS, type ModoPainel } from "@/lib/modo-painel";
import { abasDaBarra, BarraInferiorBase, type AbaInferior, type NumerosDaBarra } from "./barra-inferior-base";
import { useMensagensNovas } from "./numero-do-chat";

/** A aba acesa pelo endereço (as mensagens juntam conversas, conexões e matches). */
export function abaDoCaminho(caminho: string, tipo: string | null, modo: ModoPainel | null): AbaInferior {
  if (caminho === "/") return "inicio";
  if (caminho.startsWith("/entrar")) return "entrar";
  if (caminho.startsWith("/publicar")) return "publicar";
  if (PAGINAS_DE_MENSAGENS.some((p) => caminho.startsWith(p))) return "mensagens";
  if ((modo === null || modo === "trabalhar") && caminho.startsWith("/descobrir")) return "segunda";
  if (modo === "trabalhar" && caminho.startsWith("/painel/curtidas") && tipo !== "servico") return "terceira";
  if (modo === "contratar" && caminho.startsWith("/painel/caixa")) return "segunda";
  if (modo === "servicos" && caminho.startsWith("/painel/anuncios") && tipo === "servico") return "segunda";
  // quem presta serviço publica na vitrine
  if (modo === "servicos" && caminho.startsWith("/painel/servicos")) return "publicar";
  if (caminho.startsWith("/painel")) return "painel";
  return null;
}

export function BarraInferiorAtiva({ modo, numeros = {} }: { modo: ModoPainel | null; numeros?: NumerosDaBarra }) {
  const caminho = usePathname();
  const tipo = useSearchParams().get("tipo");
  // o número das mensagens acompanha o Chat (chega mensagem, a pessoa lê)
  const mensagens = useMensagensNovas(numeros.mensagens ?? 0);
  return (
    <BarraInferiorBase ativo={abaDoCaminho(caminho, tipo, modo)} abas={abasDaBarra(modo, { ...numeros, mensagens })} />
  );
}
