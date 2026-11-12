import "server-only";
import { meuCurriculoNaVitrine, obterMeuCurriculo, obterMeuPerfil } from "@/lib/dados";

/**
 * O currículo de quem se candidata a uma vaga (12/11/2026, claude/plano-mais-curriculos.md):
 *   sem ........ pessoa sem currículo: a tela pede o currículo logo depois da curtida (e no "Deu match")
 *   naVitrine .. o currículo está à mostra na aba Talentos: o link dele vai na mensagem do WhatsApp
 * Serviço, conta que não é de pessoa ou sem dar para ler: nem um nem outro (a tela fica como era).
 */
export async function curriculoDeQuemCurte(
  tipoDoAnuncio: string | null | undefined,
): Promise<{ sem: boolean; naVitrine: boolean }> {
  const nada = { sem: false, naVitrine: false };
  if (tipoDoAnuncio !== "vaga") return nada;
  const perfil = await obterMeuPerfil().catch(() => null);
  if (perfil?.tipo !== "pessoa") return nada;
  const cv = await obterMeuCurriculo().catch(() => undefined);
  if (cv === undefined) return nada;
  if (cv === null) return { sem: true, naVitrine: false };
  return { sem: false, naVitrine: await meuCurriculoNaVitrine().catch(() => false) };
}
