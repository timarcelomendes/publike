import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

// Limite simples por endereço de internet, na memória do servidor. Não é a
// única proteção (o banco também limita), mas barra quem dispara em sequência.

const USOS = new Map<string, number[]>();

/** Endereço de internet de quem pediu (na Vercel, o primeiro de x-forwarded-for). */
export async function enderecoDeQuemPediu() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "local").split(",")[0].trim();
}

/** O endereço embaralhado: dá para contar sem guardar o endereço de verdade. */
export function embaralhar(texto: string) {
  return createHash("sha256").update(`publike:${texto}`).digest("hex").slice(0, 32);
}

/** true se ainda cabe mais um uso de `chave` na janela; já conta este uso. */
export function dentroDoLimite(chave: string, maximo: number, janelaMs: number) {
  const agora = Date.now();
  const recentes = (USOS.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (recentes.length >= maximo) return false;
  recentes.push(agora);
  if (USOS.size > 10_000) USOS.clear();
  USOS.set(chave, recentes);
  return true;
}
