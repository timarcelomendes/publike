import { cookies } from "next/headers";
import { MODO_DEMO } from "@/lib/config";
import {
  COOKIE_BAIRRO_ADIADO,
  COOKIE_BAIRRO_PERTO,
  COOKIE_CONVITE_LOCAL_ADIADO,
  COOKIE_PERMISSAO_LOCAL,
  lerBairroPerto,
  lerPermissao,
  type InicioDoConvite,
} from "@/lib/convite-local";
import { obterMeuPerfil } from "@/lib/dados";
import { COOKIE_PERTO, lerPerto } from "@/lib/perto-guardado";
import { ConviteDaLocalizacao } from "./convite-da-localizacao";

/**
 * O convite da localização (e, para a pessoa sem bairro no perfil, "É onde você mora?") no alto das páginas que
 * contam distância: o Início e Talentos. Lê o perfil e os cookies e decide aqui o que aparece (17/11/2026): vem no
 * HTML, junto com o que está em volta, e não aparece depois empurrando a página (src/lib/convite-local.ts).
 */
export async function LocalizacaoDaPagina() {
  if (MODO_DEMO) return null;
  const [perfil, jar] = await Promise.all([obterMeuPerfil().catch(() => null), cookies()]);
  const pedirBairro = perfil && perfil.tipo === "pessoa" && !perfil.bairro?.trim() ? { cidade: perfil.cidade } : null;
  // o bairro de onde a pessoa estava (o navegador anotou na abertura anterior)
  const bairro =
    pedirBairro && !jar.has(COOKIE_BAIRRO_ADIADO) ? lerBairroPerto(jar.get(COOKIE_BAIRRO_PERTO)?.value) : null;
  const permissao = lerPermissao(jar.get(COOKIE_PERMISSAO_LOCAL)?.value);
  // o convite: sem a posição guardada, sem o "Agora não" e com a permissão ainda por pedir (ou nunca vista)
  const convite =
    !lerPerto(jar.get(COOKIE_PERTO)?.value) &&
    !jar.has(COOKIE_CONVITE_LOCAL_ADIADO) &&
    permissao !== "granted" &&
    permissao !== "denied";
  const inicial: InicioDoConvite = bairro ? { tipo: "bairro", bairro } : convite ? { tipo: "convite" } : { tipo: "nada" };
  return <ConviteDaLocalizacao pedirBairro={pedirBairro} inicial={inicial} />;
}
