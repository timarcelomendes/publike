import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export type Responsavel = { responsavel: string; mostrar: boolean };

/**
 * O responsável da conta (empresa, comércio ou agência) e se o nome dele vai nas conversas e nos
 * recados. `null`: não tem. `undefined`: o banco ainda sem a migração (o campo não aparece no perfil).
 */
export async function meuResponsavel(): Promise<Responsavel | null | undefined> {
  if (MODO_DEMO || !(await obterUsuario())) return undefined;
  const { data, error } = await (await criarClienteServidor()).rpc("meu_responsavel");
  if (error) {
    // PGRST202: a função ainda não existe (migração por rodar)
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler o responsável da conta: ${error.message}`);
    return error.code === "PGRST202" ? undefined : null;
  }
  const linha = data?.[0];
  return linha ? { responsavel: linha.responsavel, mostrar: linha.mostrar } : null;
}
