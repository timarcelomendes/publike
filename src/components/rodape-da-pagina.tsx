"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Telas que funcionam como app (painel, perfil): o rodapé de uma linha só, porque elas já têm a
// barra de baixo no celular. Em "Entrar" (o código de 6 números), nenhum: só o que a pessoa precisa.
const SEM_RODAPE = /^\/entrar(\/|$)/;
const RODAPE_CURTO = /^\/(painel|perfil)(\/|$)/;

export function RodapeDaPagina({ completo, curto }: { completo: ReactNode; curto: ReactNode }) {
  const caminho = usePathname() ?? "/";
  if (SEM_RODAPE.test(caminho)) return null;
  if (RODAPE_CURTO.test(caminho)) return curto;
  return completo;
}
