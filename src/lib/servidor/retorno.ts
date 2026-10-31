import "server-only";
import { RETORNO_PADRAO, type RetornoDaConta } from "@/lib/retorno";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/** O retorno da conta de quem está vendo (null: a migração 20261230120000 ainda não rodou). */
export async function retornoDaConta(): Promise<RetornoDaConta | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("retorno_da_conta");
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler o retorno: ${error.message}`);
    return null;
  }
  const o = (data ?? {}) as Record<string, unknown>;
  return {
    ligado: o.ligado !== false,
    texto: typeof o.texto === "string" ? o.texto : null,
    padrao: typeof o.padrao === "string" ? o.padrao : RETORNO_PADRAO,
  };
}

/** Os retornos que a pessoa recebeu, por vaga (para "Não foi dessa vez" mostrar o texto). */
export async function retornosRecebidos(): Promise<Map<string, string>> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("notificacoes")
    .select("anuncio_id, texto")
    .eq("tipo", "dispensada")
    .order("criado_em", { ascending: false })
    .limit(200);
  if (error) return new Map();
  const m = new Map<string, string>();
  for (const n of data ?? []) if (n.anuncio_id && !m.has(n.anuncio_id)) m.set(n.anuncio_id, n.texto);
  return m;
}
