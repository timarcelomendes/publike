import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { ConviteDaLocalizacao } from "./convite-da-localizacao";

/**
 * O convite da localização (e, para a pessoa sem bairro no perfil, "É onde você mora?") no alto das páginas que
 * contam distância: o Início e Talentos. Lê o perfil (num Suspense).
 */
export async function LocalizacaoDaPagina() {
  if (MODO_DEMO) return null;
  const perfil = await obterMeuPerfil().catch(() => null);
  const pedirBairro = perfil && perfil.tipo === "pessoa" && !perfil.bairro?.trim() ? { cidade: perfil.cidade } : null;
  return <ConviteDaLocalizacao pedirBairro={pedirBairro} />;
}
