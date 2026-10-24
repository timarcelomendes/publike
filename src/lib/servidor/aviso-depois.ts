import "server-only";
import { cookies } from "next/headers";
import { COOKIE_AVISO_DEPOIS, type AvisoDepois } from "@/lib/aviso-depois";

/** Marca o aviso para a próxima página (só nas ações, antes do redirect). */
export async function avisarDepois(chave: AvisoDepois) {
  try {
    (await cookies()).set(COOKIE_AVISO_DEPOIS, chave, { path: "/", maxAge: 60, sameSite: "lax", httpOnly: false });
  } catch {
    // fora de uma ação (não dá para gravar cookie): segue sem o aviso
  }
}
