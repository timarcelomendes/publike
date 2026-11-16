import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { obterMeuPerfil, obterMinhaCasa } from "./dados";
import { COOKIE_PERTO, lerPerto } from "./perto-guardado";
import { PRACA_PADRAO, pracaDoPonto } from "./pracas";
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
    const [clat, clng] = (p.get("m") ?? "").split(",").map(Number);
    const centro = p.get("m") && Number.isFinite(clat) && Number.isFinite(clng) ? { lat: clat, lng: clng } : null;
    return criarLocal(p.get("c") ?? "", p.get("b") ?? "", "busca", { cep: ponto ? cep : null, ponto: cep ? ponto : null, centro });
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
  } else if (local.centro) {
    p.set("m", `${local.centro.lat},${local.centro.lng}`);
  }
  return encodeURIComponent(p.toString());
}

/**
 * Onde a pessoa mora, para pôr primeiro os anúncios de perto de casa:
 * o CEP de casa guardado na conta, o que ela escolheu neste navegador ou,
 * se não escolheu, o bairro do perfil. Com a localização do aparelho liberada (o cookie de 24 horas do "Perto de
 * mim"), as distâncias contam de onde ela está (16/11/2026), com o bairro do perfil no nome.
 */
export const obterLocal = cache(async (): Promise<Local | null> => {
  const casa = await obterMinhaCasa();
  if (casa) {
    const local = criarLocal(casa.cidade, casa.bairro, "casa", { cep: casa.cep, ponto: { lat: casa.lat, lng: casa.lng } });
    if (local) return local;
  }
  const pote = await cookies();
  const escolhido = lerCookieLocal(pote.get(COOKIE_LOCAL)?.value);
  if (escolhido) return escolhido;
  const perfil = await obterMeuPerfil();
  const aqui = lerPerto(pote.get(COOKIE_PERTO)?.value);
  if (aqui) {
    const cidade = (pracaDoPonto(aqui) ?? PRACA_PADRAO).cidade;
    const local = criarLocal(cidade, perfil?.cidade === cidade ? (perfil.bairro ?? "") : "", "aparelho", { centro: aqui });
    if (local) return local;
  }
  return perfil ? criarLocal(perfil.cidade, perfil.bairro ?? "", "perfil") : null;
});
