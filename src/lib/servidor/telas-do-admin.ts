import "server-only";
import { cache } from "react";
import { TELAS_DO_SITE } from "@/lib/admin/telas";
import { MODO_DEMO } from "@/lib/config";
import { ehModerador, obterUsuario, possoVerPainelNoSite } from "@/lib/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Quem vê cada tela do Admin no site no ar (migração 20270327120000, Admin › Quem vê cada tela). O admin do
// computador do dono vê tudo e não passa por aqui.

/** Antes da migração: como era (o moderador, a moderação; a equipe publike.org, os números). */
const SEM_A_LISTA = ["/admin/numeros", "/admin/denuncias", "/admin/anuncios", "/admin/vagas-do-dia", "/admin/curtidas"];

/**
 * As telas do Admin que a pessoa que entrou abre no site no ar, na ordem das abas: a marca "Somente publike.org" (o
 * banco), o que cada tela pede (moderador ou equipe publike.org) e só as telas que já funcionam no site.
 */
export const telasNoSite = cache(async (): Promise<string[]> => {
  if (MODO_DEMO || !(await obterUsuario())) return [];
  const [moderador, equipe] = await Promise.all([ehModerador(), possoVerPainelNoSite()]);
  if (!moderador && !equipe) return [];
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("minhas_telas_do_admin");
  const pela =
    error || !Array.isArray(data)
      ? SEM_A_LISTA.filter((t) => moderador || (equipe && t === "/admin/numeros"))
      : (data as string[]);
  return TELAS_DO_SITE.filter(
    (t) =>
      pela.includes(t.href) &&
      (t.precisa === "moderador" ? moderador : t.precisa === "equipe" ? equipe : moderador || equipe),
  ).map((t) => t.href);
});

/** A pessoa que entrou abre no site ao menos uma destas telas. */
export async function possoVerTela(rotas: string | string[]) {
  const minhas = await telasNoSite();
  return (Array.isArray(rotas) ? rotas : [rotas]).some((r) => minhas.includes(r));
}
