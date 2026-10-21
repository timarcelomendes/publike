import "server-only";
import { cookies } from "next/headers";
import { obterMeuPerfil } from "@/lib/dados";
import { COOKIE_MODO, lerModo, modoPadrao, type ModoPainel } from "@/lib/modo-painel";
import { obterIntencao } from "./intencao";

/**
 * O modo da conta (Contratar, Trabalhar ou Serviços): o escolhido no menu do painel ou, sem
 * escolha, o do tipo de conta e do que a pessoa disse que quer fazer. A home e o painel
 * usam a mesma conta, para nunca discordarem.
 */
export async function modoDaConta(): Promise<ModoPainel> {
  const [jar, perfil, intencao] = await Promise.all([
    cookies(),
    obterMeuPerfil().catch(() => null),
    obterIntencao().catch(() => null),
  ]);
  return lerModo(jar.get(COOKIE_MODO)?.value) ?? modoPadrao(perfil?.tipo, intencao);
}
