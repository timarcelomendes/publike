import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { faltaColuna } from "@/lib/servidor/comeca-ja";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// Só pelo chat do Publike, ou chat e WhatsApp (migração 20270221120000_conversa_so_no_chat.sql;
// claude/plano-so-chat-ou-whatsapp.md): como os candidatos falam com quem publicou depois do match. O site funciona
// antes da migração: sem a coluna, toda vaga é "ambos", como sempre foi.

export type ContatoPor = "ambos" | "chat";

/** A escolha da vaga ("ambos" sem a coluna, sem a vaga ou para quem não pode ler a vaga). */
export async function contatoPorDaVaga(id: string, cliente?: ClienteBanco): Promise<ContatoPor> {
  if (MODO_DEMO || !UUID.test(id)) return "ambos";
  const supabase = cliente ?? (await criarClienteServidor());
  const { data, error } = await supabase.from("anuncios").select("contato_por").eq("id", id).maybeSingle();
  if (error && !faltaColuna(error, "contato_por"))
    console.warn(`Publike: não deu para ler se a vaga é só pelo chat: ${error.message}`);
  return data?.contato_por === "chat" ? "chat" : "ambos";
}

/** Destes anúncios, os só pelo chat (os que a pessoa não pode ler ficam de fora). */
export async function vagasSoPeloChat(ids: string[], cliente?: ClienteBanco): Promise<Set<string>> {
  const unicos = [...new Set(ids)].filter((id) => UUID.test(id)).slice(0, 200);
  if (MODO_DEMO || !unicos.length) return new Set();
  const supabase = cliente ?? (await criarClienteServidor());
  const { data, error } = await supabase.from("anuncios").select("id").in("id", unicos).eq("contato_por", "chat");
  if (error) {
    if (!faltaColuna(error, "contato_por"))
      console.warn(`Publike: não deu para ler as vagas só pelo chat: ${error.message}`);
    return new Set();
  }
  return new Set((data ?? []).map((a) => a.id));
}

/** As vagas de quem publica que estão só pelo chat (a etiqueta em Meus anúncios). */
export async function minhasVagasSoPeloChat(autorId: string): Promise<Set<string>> {
  if (MODO_DEMO || !UUID.test(autorId)) return new Set();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("anuncios")
    .select("id")
    .eq("autor_id", autorId)
    .eq("tipo", "vaga")
    .eq("contato_por", "chat");
  if (error) {
    if (!faltaColuna(error, "contato_por"))
      console.warn(`Publike: não deu para ler as vagas só pelo chat: ${error.message}`);
    return new Set();
  }
  return new Set((data ?? []).map((a) => a.id));
}
