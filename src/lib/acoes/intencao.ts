"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { COOKIE_INTENCAO, lerIntencao } from "@/lib/intencao";
import type { Resultado } from "@/lib/tipos";

/** Guarda neste navegador o que a pessoa quer fazer no Publike (um ano). */
export async function salvarIntencao(valor: string): Promise<Resultado> {
  const intencao = lerIntencao(valor);
  if (!intencao) return { ok: false, erro: "Escolha uma das opções." };
  (await cookies()).set(COOKIE_INTENCAO, intencao, {
    maxAge: 365 * 24 * 3600,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  refresh();
  return { ok: true };
}
