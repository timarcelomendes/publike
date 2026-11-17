"use client";

import { useEffect } from "react";
import { registrarVisitaDaHome } from "@/lib/acoes/home";

/**
 * Grava a abertura da home depois que a página aparece (para a marca "Você parou aqui") e, em Serviços e em Posts, que
 * a pessoa viu a aba (o que chegou até agora deixa de contar como novidade). Trocar de aba grava de novo.
 */
export function RegistrarVisita({ aba }: { aba: string }) {
  useEffect(() => {
    registrarVisitaDaHome(aba).catch(() => {});
  }, [aba]);
  return null;
}
