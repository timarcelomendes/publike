import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import type { DiaDoMutirao, MeuMutirao, Mutirao, SituacaoMutirao } from "@/lib/mutirao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// As leituras do mutirão (migração 20270417120000): sem a migração, null e as telas mostram o aviso.

export async function situacaoDoMutirao(): Promise<SituacaoMutirao | null> {
  if (MODO_DEMO) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("mutirao_situacao");
  if (error || !data) return null;
  return data as SituacaoMutirao;
}

export async function meusMutiroes(): Promise<Mutirao[] | null> {
  if (MODO_DEMO) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("meus_mutiroes");
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler os mutirões:", error.message);
    return null;
  }
  return (data as Mutirao[] | null) ?? [];
}

export async function diaDoMutirao(id: string): Promise<DiaDoMutirao | null> {
  if (MODO_DEMO || !UUID.test(id)) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("mutirao_do_dia", { p_mutirao: id });
  if (error || !data) return null;
  return data as DiaDoMutirao;
}

export async function meuMutirao(entrevista: string): Promise<MeuMutirao | null> {
  if (MODO_DEMO || !UUID.test(entrevista)) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("meu_mutirao", { p_entrevista: entrevista });
  if (error || !data) return null;
  return data as MeuMutirao;
}

/** As vagas no ar da conta, para escolher as do mutirão. */
export async function minhasVagasNoAr(): Promise<{ id: string; titulo: string }[]> {
  if (MODO_DEMO) return [];
  const usuario = await obterUsuario();
  if (!usuario) return [];
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("anuncios")
    .select("id, titulo")
    .eq("autor_id", usuario.id)
    .eq("tipo", "vaga")
    .eq("status", "ativo")
    .order("criado_em", { ascending: false })
    .limit(100);
  if (error) console.error("Publike: falha ao ler as vagas para o mutirão:", error.message);
  return data ?? [];
}
