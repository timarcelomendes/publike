import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { FaixaOlhando } from "./faixa-olhando";

/** No alto de todas as páginas (layout): a faixa da equipe vendo como o dono (migração 20270919120000). */
export async function OlhandoComoDono() {
  const usuario = await obterUsuario().catch(() => null);
  if (!usuario?.olhando) return null;
  const perfil = await obterMeuPerfil().catch(() => null);
  return <FaixaOlhando conta={perfil?.nome || "o dono"} />;
}
