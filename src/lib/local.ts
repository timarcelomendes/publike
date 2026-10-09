import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { obterMeuPerfil } from "./dados";
import { criarLocal, type Local } from "./regioes";

/** Cookie com a cidade e o bairro escolhidos em "Onde você mora?". */
export const COOKIE_LOCAL = "publike_local";

export function lerCookieLocal(valor: string | undefined): Local | null {
  if (!valor) return null;
  try {
    const p = new URLSearchParams(decodeURIComponent(valor));
    return criarLocal(p.get("c") ?? "", p.get("b") ?? "", "busca");
  } catch {
    return null;
  }
}

export function valorCookieLocal(local: Local) {
  return encodeURIComponent(new URLSearchParams({ c: local.cidade, b: local.bairro }).toString());
}

/**
 * Onde a pessoa mora, para pôr primeiro os anúncios de perto de casa:
 * o que ela escolheu na busca ou, se não escolheu, o bairro do perfil.
 */
export const obterLocal = cache(async (): Promise<Local | null> => {
  const escolhido = lerCookieLocal((await cookies()).get(COOKIE_LOCAL)?.value);
  if (escolhido) return escolhido;
  const perfil = await obterMeuPerfil();
  return perfil ? criarLocal(perfil.cidade, perfil.bairro ?? "", "perfil") : null;
});
