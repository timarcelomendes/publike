"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { COOKIE_LOCAL, valorCookieLocal } from "@/lib/local";
import { criarLocal } from "@/lib/regioes";
import type { Resultado } from "@/lib/tipos";

const UM_ANO = 365 * 24 * 3600;

/** "Onde você mora?": guarda a cidade e o bairro neste navegador. */
export async function salvarLocal(cidade: string, bairro: string): Promise<Resultado> {
  const local = criarLocal(String(cidade), String(bairro ?? ""), "busca");
  if (!local) return { ok: false, erro: "Escolha uma cidade da lista." };
  (await cookies()).set(COOKIE_LOCAL, valorCookieLocal(local), {
    maxAge: UM_ANO,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  refresh();
  return { ok: true };
}

/** Esquece o que foi escolhido (volta a usar o perfil, ou o centro de Goiânia). */
export async function esquecerLocal(): Promise<Resultado> {
  (await cookies()).delete(COOKIE_LOCAL);
  refresh();
  return { ok: true };
}
