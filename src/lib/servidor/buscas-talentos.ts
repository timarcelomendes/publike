import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// As buscas salvas de Talentos de quem contrata (migração 20270308120000). null: sem a migração.

export type BuscaSalva = { id: string; nome: string; texto: string | null; cidade: string | null; avisar: boolean };

export async function minhasBuscasDeTalentos(): Promise<BuscaSalva[] | null> {
  if (MODO_DEMO) return null;
  const { data, error } = await (await criarClienteServidor())
    .from("buscas_talentos")
    .select("id, nome, texto, cidade, avisar")
    .order("criado_em", { ascending: false })
    .limit(20);
  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") console.error(`Publike: falha ao ler as buscas salvas: ${error.message}`);
    return null;
  }
  return data ?? [];
}
