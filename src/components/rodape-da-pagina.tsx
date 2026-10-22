"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Telas que funcionam como app (painel, perfil) e todas as de quem tem conta: o rodapé de uma
// linha só (o grande, com os links para o Google e o "o que é o Publike", é para o visitante).
// Em "Entrar" (o código de 6 números), nenhum: só o que a pessoa precisa.
const SEM_RODAPE = /^\/entrar(\/|$)/;
const RODAPE_CURTO = /^\/(painel|perfil)(\/|$)/;

export function RodapeDaPagina({
  completo,
  curto,
  logado = false,
}: {
  completo: ReactNode;
  curto: ReactNode;
  logado?: boolean;
}) {
  const caminho = usePathname() ?? "/";
  if (SEM_RODAPE.test(caminho)) return null;
  if (logado || RODAPE_CURTO.test(caminho)) return curto;
  return completo;
}
