"use client";

import { useEffect } from "react";
import { lerMensagensDaEquipe } from "@/lib/acoes/mensagens-equipe";

/** Depois que a página aparece, marca as mensagens da equipe como lidas. */
export function LerMensagensDaEquipe() {
  useEffect(() => {
    lerMensagensDaEquipe().catch(() => {});
  }, []);
  return null;
}
