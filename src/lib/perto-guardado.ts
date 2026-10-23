import { noPublike } from "./pracas";

/**
 * "Perto de mim" guardado no aparelho: a posição que o navegador deu, arredondada (~100 m), num
 * cookie por 24 horas. Nas próximas visitas a lista, a linha do tempo e o mapa contam dali sem pedir
 * de novo (com a permissão já dada, a posição se atualiza sozinha). Não vai para o banco. Desligar o
 * "Perto de mim" ou escolher contar de casa apaga.
 */
export const COOKIE_PERTO = "publike_perto";
export const DURACAO_PERTO = 24 * 3600;

type Ponto = { lat: number; lng: number };

/** "lat,lng" → o ponto (só dentro da região do Publike). */
export function lerPerto(valor: string | undefined | null): Ponto | null {
  if (!valor) return null;
  const [lat, lng] = decodeURIComponent(valor).split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const ponto = { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
  return noPublike(ponto) ? ponto : null;
}

/** No navegador: guarda (ou renova) a posição por 24 horas. */
export function guardarPerto(p: Ponto) {
  const seguro = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_PERTO}=${p.lat},${p.lng}; Max-Age=${DURACAO_PERTO}; Path=/; SameSite=Lax${seguro}`;
}

/** No navegador: esquece a posição (a pessoa desligou o "Perto de mim" ou quer contar de casa). */
export function esquecerPerto() {
  document.cookie = `${COOKIE_PERTO}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/** No navegador: a posição guardada, se ainda vale. */
export function pertoGuardadoNoNavegador(): Ponto | null {
  const par = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_PERTO}=`));
  return lerPerto(par?.slice(COOKIE_PERTO.length + 1));
}
