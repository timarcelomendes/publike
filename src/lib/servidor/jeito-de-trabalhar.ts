import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { lerDiaADia, lerJeito, type EscolhaDoJeito, type ItemDoJeito } from "@/lib/jeito-de-trabalhar";
import { faltaColuna } from "@/lib/servidor/comeca-ja";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// O jeito de trabalhar (migração 20270309120000): as leituras. Sem a migração, mapas vazios (o match fica igual).

/** O jeito das pessoas que a conta pode ver (em Talentos ou que curtiram uma vaga dela), por perfil. */
export async function jeitosDasPessoas(ids: string[]): Promise<Map<string, EscolhaDoJeito[]>> {
  const validos = [...new Set(ids.filter((i) => UUID.test(i)))].slice(0, 200);
  if (MODO_DEMO || !validos.length) return new Map();
  const { data, error } = await (await criarClienteServidor()).rpc("jeitos_de_trabalhar", { p_perfis: validos });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler o jeito de trabalhar: ${error.message}`);
    return new Map();
  }
  return new Map((data ?? []).map((r) => [r.perfil_id, lerJeito(r.jeito)]));
}

/** Como é o dia a dia de cada vaga (as da conta, ou no ar), por id. */
export async function diaADiaDasVagas(ids: string[]): Promise<Map<string, ItemDoJeito[]>> {
  const validos = [...new Set(ids.filter((i) => UUID.test(i)))].slice(0, 200);
  if (MODO_DEMO || !validos.length) return new Map();
  const { data, error } = await (await criarClienteServidor()).from("anuncios").select("id, dia_a_dia").in("id", validos);
  if (error) {
    if (!faltaColuna(error, "dia_a_dia")) console.error(`Publike: falha ao ler o dia a dia das vagas: ${error.message}`);
    return new Map();
  }
  return new Map((data ?? []).map((r) => [r.id, lerDiaADia(r.dia_a_dia)]));
}

/** O meu jeito de trabalhar (o da pessoa logada). null: sem currículo ou sem a migração. */
export async function meuJeitoDeTrabalhar(pessoa: string): Promise<EscolhaDoJeito[] | null> {
  if (MODO_DEMO || !UUID.test(pessoa)) return null;
  const { data, error } = await (await criarClienteServidor())
    .from("curriculos")
    .select("jeito")
    .eq("perfil_id", pessoa)
    .maybeSingle();
  if (error || !data) return null;
  return lerJeito(data.jeito);
}
