import "server-only";
import { lerCompetencias, type AvaliacaoNoQuadro, type Competencia } from "@/lib/avaliacao-time";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// A avaliação em time (migração 20270107120000): o que o quadro e o Comparar leem. null: sem a migração.

export async function fichaDaVaga(anuncioId: string): Promise<Competencia[] | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("ficha_avaliacao", { p_anuncio: anuncioId });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler a ficha de avaliação: ${error.message}`);
    return null;
  }
  return lerCompetencias(data);
}

export async function avaliacoesTimeDaVaga(anuncioId: string): Promise<Map<string, AvaliacaoNoQuadro> | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("avaliacoes_time_da_vaga", { p_anuncio: anuncioId });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler as avaliações do time: ${error.message}`);
    return null;
  }
  return new Map(
    (data ?? []).map((a) => [
      a.perfil_id,
      {
        total: a.total,
        avaliei: a.avaliei,
        media: a.media == null ? null : Number(a.media),
        seguir: a.seguir,
        talvez: a.talvez,
        nao_seguir: a.nao_seguir,
      },
    ]),
  );
}
