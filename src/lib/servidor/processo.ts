import "server-only";
import { lerPadroes, lerProcesso, type PadroesDaConta, type ProcessoDaConta } from "@/lib/processo";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// O processo e o padrão da conta (migração 20270315120000). Sem a migração: null (a tela fica como antes).

export async function processoDaConta(): Promise<ProcessoDaConta | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("processo_da_conta");
  if (error) return null;
  return lerProcesso(data);
}

export async function padroesDaConta(): Promise<PadroesDaConta | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("padroes_da_conta");
  if (error) return null;
  return lerPadroes(data);
}

/** Por que as pessoas saíram do processo (os Resultados). null: sem a migração. */
export async function numerosSaidas(dias: number | null, anuncioId: string | null = null) {
  const { data, error } = await (await criarClienteServidor()).rpc("numeros_saidas", {
    p_dias: dias,
    p_anuncio: anuncioId,
  });
  if (error) return null;
  return (data ?? []).map((x) => ({ motivo: x.motivo, pessoas: Number(x.pessoas) }));
}
