import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Database } from "./tipos-banco";
import { MODO_DEMO, SUPABASE_URL } from "@/lib/config";
import { ehModerador } from "@/lib/dados";
import {
  adminConfigurado,
  confereChaveDoAdmin,
  COOKIE_ADMIN,
  ENDERECO_LOCAL,
} from "@/lib/servidor/admin-chave";
import { chaveSecretaSupabase } from "@/lib/servidor/ambiente";
import { criarClienteServidor } from "./servidor";

// O admin só existe no computador do dono do site (veja src/lib/servidor/admin-chave.ts).
// O banco faz a parte dele: as funções de admin só aceitam a chave secreta.

export type ClienteBanco = SupabaseClient<Database>;

export { adminConfigurado };

async function enderecoLocal() {
  await connection();
  const h = await headers();
  return ENDERECO_LOCAL.test(h.get("host") ?? "");
}

/** Admin ligado, endereço local e o cookie do link do terminal. */
export async function ehAdminLocal() {
  if (!adminConfigurado()) return false;
  if (!(await enderecoLocal())) return false;
  const cookie = (await cookies()).get(COOKIE_ADMIN)?.value;
  return confereChaveDoAdmin(cookie);
}

/** Admin ligado neste computador, mas o navegador ainda não abriu o link do terminal. */
export async function adminSemCookie() {
  return adminConfigurado() && (await enderecoLocal()) && !(await ehAdminLocal());
}

/** Cliente com a chave secreta. Só para o servidor, nunca para o navegador. */
export function criarClienteAdmin(): ClienteBanco {
  return createClient<Database>(SUPABASE_URL, chaveSecretaSupabase(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Páginas só do admin: fora do computador do dono, a página não existe. */
export async function exigirAdminLocal(): Promise<ClienteBanco> {
  if (!(await ehAdminLocal())) notFound();
  return criarClienteAdmin();
}

/** Para ações do admin: devolve o cliente ou null (sem jogar 404 numa ação). */
export async function clienteAdminOuNulo(): Promise<ClienteBanco | null> {
  return (await ehAdminLocal()) ? criarClienteAdmin() : null;
}

export type AcessoEquipe = { cliente: ClienteBanco; admin: boolean };

/** Anúncios e denúncias: o admin (no computador dele) ou um moderador logado. */
export async function acessoDaEquipe(): Promise<AcessoEquipe | null> {
  if (await ehAdminLocal()) return { cliente: criarClienteAdmin(), admin: true };
  if (MODO_DEMO) return null;
  if (await ehModerador()) return { cliente: await criarClienteServidor(), admin: false };
  return null;
}
