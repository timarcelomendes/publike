"use client";

import { usePathname } from "next/navigation";
import { BarraInferiorBase, type AbaInferior } from "./barra-inferior-base";

export function BarraInferiorAtiva() {
  const caminho = usePathname();
  let ativo: AbaInferior = null;
  if (caminho === "/") ativo = "inicio";
  else if (caminho.startsWith("/publicar")) ativo = "publicar";
  else if (caminho.startsWith("/painel")) ativo = "painel";
  else if (caminho === "/perfil") ativo = "perfil";
  return <BarraInferiorBase ativo={ativo} />;
}
