import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { obterMeuPerfil, obterMinhaCasa } from "./dados";
import { arredondarCasa, criarLocal, type Local } from "./regioes";

/** Cookie com a cidade, o bairro e (se a pessoa deu) o CEP e o ponto arredondado de casa. */
export const COOKIE_LOCAL = "publike_local";

export function lerCookieLocal(valor: string | undefined): Local | null {
  if (!valor) return null;
  try {
    const p = new URLSearchParams(decodeURIComponent(valor));
    const [lat, lng] = (p.get("p") ?? "").split(",").map(Number);
    const ponto = Number.isFinite(lat) && Number.isFinite(lng) && p.get("p") ? arredondarCasa({ lat, lng }) : null;
    const cep = /^\d{8}$/.test(p.get("z") ?? "") ? p.get("z") : null;
    return criarLocal(p.get("c") ?? "", p.get("b") ?? "", "busca", { cep, ponto });
  } catch {
    return null;
  }
}

export function valorCookieLocal(local: Local) {
  const p = new URLSearchParams({ c: local.cidade, b: local.bairro });
  if (local.ponto && local.cep) {
    const r = arredondarCasa(local.ponto);
    p.set("p", `${r.lat},${r.lng}`);
    p.set("z", local.cep);
  }
  return encodeURIComponent(p.toString());
}

/**
 * Onde a pessoa mora, para pôr primeiro os anúncios de perto de casa:
 * o CEP de casa guardado na conta, o que ela escolheu neste navegador ou,
 * se não escolheu, o bairro do perfil.
 */
export const obterLocal = cache(async (): Promise<Local | null> => {
  const casa = await obterMinhaCasa();
  if (casa) {
    const local = criarLocal(casa.cidade, casa.bairro, "casa", { cep: casa.cep, ponto: { lat: casa.lat, lng: casa.lng } });
    if (local) return local;
  }
  const escolhido = lerCookieLocal((await cookies()).get(COOKIE_LOCAL)?.value);
  if (escolhido) return escolhido;
  const perfil = await obterMeuPerfil();
  return perfil ? criarLocal(perfil.cidade, perfil.bairro ?? "", "perfil") : null;
});
