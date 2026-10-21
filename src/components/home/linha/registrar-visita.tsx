"use client";

import { useEffect } from "react";
import { registrarVisitaDaHome } from "@/lib/acoes/home";

/** Grava a abertura da home depois que a página aparece (para a marca "Você parou aqui"). */
export function RegistrarVisita() {
  useEffect(() => {
    registrarVisitaDaHome().catch(() => {});
  }, []);
  return null;
}
