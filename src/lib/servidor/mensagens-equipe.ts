import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export type MensagemDaEquipe = {
  id: number;
  assunto: string;
  texto: string;
  criado_em: string;
  lida_em: string | null;
};

/** As mensagens que a equipe mandou para a conta. `null`: o banco ainda sem a migração. */
export async function minhasMensagensDaEquipe(): Promise<MensagemDaEquipe[] | null> {
  if (MODO_DEMO || !(await obterUsuario())) return [];
  const { data, error } = await (await criarClienteServidor()).rpc("minhas_mensagens_equipe");
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler as mensagens da equipe: ${error.message}`);
    return error.code === "PGRST202" ? null : [];
  }
  return data ?? [];
}
