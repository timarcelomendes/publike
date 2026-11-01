import "server-only";
import { lerAutomacoes, type Automacoes } from "@/lib/automacoes";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// As automações da vaga e os números do processo (migração 20270109120000). null: sem a migração.

export async function automacoesDaVaga(anuncioId: string): Promise<Automacoes | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("automacoes_da_vaga", { p_anuncio: anuncioId });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler as automações: ${error.message}`);
    return null;
  }
  return lerAutomacoes(data);
}

export type NumerosDaVaga = {
  anuncio_id: string;
  titulo: string;
  status: string;
  criado_em: string;
  candidatos: number;
  respondidos: number;
  analise: number;
  entrevista: number;
  contratados: number;
  nao_seguiu: number;
  horas_resposta: number | null;
  dias_entrevista: number | null;
  dias_contratar: number | null;
};

export async function numerosDoProcesso(dias: number | null): Promise<NumerosDaVaga[] | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("numeros_do_processo", { p_dias: dias });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler os números: ${error.message}`);
    return null;
  }
  return (data ?? []).map((v) => ({
    ...v,
    horas_resposta: v.horas_resposta == null ? null : Number(v.horas_resposta),
    dias_entrevista: v.dias_entrevista == null ? null : Number(v.dias_entrevista),
    dias_contratar: v.dias_contratar == null ? null : Number(v.dias_contratar),
  }));
}

export async function numerosOrigem(
  dias: number | null,
  anuncioId: string | null = null,
): Promise<{ origem: string; candidatos: number; entrevista: number; contratados: number }[] | null> {
  const { data, error } = await (
    await criarClienteServidor()
  ).rpc("numeros_origem", { p_dias: dias, p_anuncio: anuncioId });
  if (error) return null;
  return data ?? [];
}
