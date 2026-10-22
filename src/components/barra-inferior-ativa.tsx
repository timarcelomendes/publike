"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { ModoPainel } from "@/lib/modo-painel";
import { BarraInferiorBase, type AbaInferior } from "./barra-inferior-base";

export function BarraInferiorAtiva({ modo = "trabalhar" }: { modo?: ModoPainel }) {
  const caminho = usePathname();
  const tipo = useSearchParams().get("tipo");
  let ativo: AbaInferior = null;
  if (caminho === "/") ativo = "inicio";
  else if (modo === "trabalhar" && caminho.startsWith("/descobrir")) ativo = "segunda";
  else if (modo === "contratar" && caminho.startsWith("/painel/caixa")) ativo = "segunda";
  else if (modo === "servicos" && caminho.startsWith("/painel/anuncios") && tipo === "servico") ativo = "segunda";
  else if (caminho.startsWith("/publicar")) ativo = "publicar";
  else if (caminho.startsWith("/painel")) ativo = "painel";
  else if (caminho === "/perfil") ativo = "perfil";
  return <BarraInferiorBase ativo={ativo} modo={modo} />;
}
