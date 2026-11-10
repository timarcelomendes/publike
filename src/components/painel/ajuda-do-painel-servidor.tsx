import { obterMeuPerfil } from "@/lib/dados";
import { AjudaDoPainel } from "./ajuda-do-painel";

/** O "?" do painel só para quem contrata (empresa, comércio e agência), com o texto da agência quando muda. */
export async function AjudaDoPainelDaConta() {
  const perfil = await obterMeuPerfil().catch(() => null);
  if (!perfil || perfil.tipo === "pessoa") return null;
  return <AjudaDoPainel agencia={perfil.tipo === "agencia"} />;
}
