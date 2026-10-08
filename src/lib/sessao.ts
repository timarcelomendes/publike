import "server-only";
import { redirect } from "next/navigation";
import { obterMeuPerfil, obterUsuario, perfilCompleto } from "./dados";

/** Para páginas que exigem login: manda para /entrar e volta depois. */
export async function exigirUsuario(voltar: string) {
  const usuario = await obterUsuario();
  if (!usuario) redirect(`/entrar?next=${encodeURIComponent(voltar)}`);
  return usuario;
}

/** Para publicar e curtir: precisa de perfil com WhatsApp. */
export async function exigirPerfilCompleto(voltar: string) {
  const usuario = await exigirUsuario(voltar);
  const perfil = await obterMeuPerfil();
  if (!perfil || !perfilCompleto(perfil)) redirect(`/perfil?completar=1&next=${encodeURIComponent(voltar)}`);
  return { usuario, perfil };
}
