import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lerAutomacoes, type Automacoes } from "@/lib/automacoes";
import { lerFaixas, proximosHorarios } from "@/lib/etapas-proprias";
import { ENTREVISTA_ABERTA } from "@/lib/recrutamento";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Database } from "@/lib/supabase/tipos-banco";

// As automações da vaga e os números do processo (migrações 20270109120000 e 20270111120000). null: sem a migração.

export async function automacoesDaVaga(anuncioId: string): Promise<Automacoes | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("automacoes_da_vaga", { p_anuncio: anuncioId });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler as automações: ${error.message}`);
    return null;
  }
  return lerAutomacoes(data);
}

/**
 * A automação "Oferecer os meus horários livres ao mover para Entrevista": quem tem match e ainda não tem entrevista
 * em aberto recebe 3 horários vagos da semana da conta para escolher (uma vez por pessoa). Devolve quantos receberam.
 */
export async function oferecerHorariosAutomaticos(
  supabase: SupabaseClient<Database>,
  anuncioId: string,
  perfis: string[],
): Promise<number> {
  if (!perfis.length) return 0;
  const { data, error } = await supabase.rpc("automacoes_da_vaga", { p_anuncio: anuncioId });
  if (error) return 0;
  const regra = lerAutomacoes(data).horarios;
  if (!regra) return 0;
  const [{ data: faixas }, { data: ocupados }, { data: curtidas }, { data: abertas }] = await Promise.all([
    supabase.rpc("meus_horarios_livres"),
    supabase.rpc("horarios_ocupados", { p_dias: 21 }),
    supabase.from("curtidas").select("perfil_id, status").eq("anuncio_id", anuncioId).in("perfil_id", perfis),
    supabase
      .from("entrevistas")
      .select("perfil_id")
      .eq("anuncio_id", anuncioId)
      .in("perfil_id", perfis)
      .in("situacao", ENTREVISTA_ABERTA),
  ]);
  const lista = lerFaixas(faixas);
  if (!lista.length) return 0;
  const ocupado = (ocupados ?? []).map((o) => ({
    inicio: new Date(o.inicio).getTime(),
    fim: new Date(o.fim).getTime(),
  }));
  const comMatch = new Set((curtidas ?? []).filter((c) => c.status === "match").map((c) => c.perfil_id));
  const comEntrevista = new Set((abertas ?? []).map((e) => e.perfil_id));
  let n = 0;
  for (const perfil of perfis) {
    if (!comMatch.has(perfil) || comEntrevista.has(perfil)) continue;
    const campos = proximosHorarios(lista, ocupado, Date.now(), { quantos: 3, duracaoMin: regra.duracao });
    if (campos.length < 2) break;
    // os campos vêm no horário de Brasília (sem horário de verão desde 2019)
    const opcoes = campos.map((c) => new Date(`${c}:00-03:00`).toISOString());
    const { error: erro } = await supabase.rpc("oferecer_horarios", {
      p_anuncio: anuncioId,
      p_perfil: perfil,
      p_opcoes: opcoes,
      p_formato: regra.formato,
      p_local: regra.local ?? "",
      p_obs: "",
      p_duracao: regra.duracao,
    });
    if (erro) {
      console.error(`Publike: a automação dos horários livres não ofereceu: ${erro.message}`);
      continue;
    }
    await supabase.rpc("automacao_anotar_horarios", { p_anuncio: anuncioId, p_perfil: perfil });
    for (const o of opcoes) {
      const inicio = new Date(o).getTime();
      ocupado.push({ inicio, fim: inicio + regra.duracao * 60_000 });
    }
    n++;
  }
  return n;
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
