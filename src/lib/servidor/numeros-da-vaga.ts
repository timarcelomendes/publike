import "server-only";
import { cache } from "react";
import { MODO_DEMO } from "@/lib/config";
import { abaDaEtapa, esperaResposta } from "@/lib/constantes";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// Os números de uma vaga (pedido de 01/11/2026): a linha do alto da vaga (quem espera a resposta, em entrevista,
// contratados) e a aba Números (as candidaturas por dia e as visitas). As etapas são as de Candidatos
// (`abaDaEtapa`): os mesmos números do quadro, da lista e dos cartões de Vagas.

export type CandidaturaDaVaga = {
  perfil_id: string;
  status: string;
  aceita_em: string | null;
  criado_em: string;
  aba: ReturnType<typeof abaDaEtapa>;
};

/** As candidaturas da vaga, com a etapa de cada uma (null: não deu para ler). Uma leitura só por página. */
export const candidaturasDaVaga = cache(async (anuncioId: string): Promise<CandidaturaDaVaga[] | null> => {
  if (MODO_DEMO || !UUID.test(anuncioId)) return null;
  const supabase = await criarClienteServidor();
  const [curtidas, etapas] = await Promise.all([
    supabase.from("curtidas").select("perfil_id, status, aceita_em, criado_em").eq("anuncio_id", anuncioId),
    supabase.rpc("etapas_dos_candidatos", { p_anuncio: anuncioId }),
  ]);
  if (curtidas.error) {
    console.error(`Publike: falha ao ler os candidatos da vaga: ${curtidas.error.message}`);
    return null;
  }
  // sem as etapas (erro na leitura), todos contam como Novos, como na lista
  const etapaDe = new Map((etapas.data ?? []).map((e) => [e.perfil_id, e.etapa]));
  return (curtidas.data ?? []).map((c) => ({
    ...c,
    aba: abaDaEtapa({ status: c.status, etapa: etapaDe.get(c.perfil_id) }),
  }));
});

export type ContagemDaVaga = {
  /** o número da aba Candidatos: todos, menos os dispensados */
  total: number;
  /** esperam a resposta (aceitar ou dispensar) */
  esperam: number;
  analise: number;
  entrevista: number;
  contratados: number;
};

export function contarCandidaturas(lista: CandidaturaDaVaga[]): ContagemDaVaga {
  const n: ContagemDaVaga = { total: 0, esperam: 0, analise: 0, entrevista: 0, contratados: 0 };
  for (const c of lista) {
    if (c.status !== "dispensada") n.total++;
    if (esperaResposta(c)) n.esperam++;
    if (c.aba === "analise" || c.aba === "entrevista" || c.aba === "contratados") n[c.aba]++;
  }
  return n;
}

/** Quantas vezes a vaga foi aberta (sem contar quem publicou; só enquanto está no ar). null: não deu para ler. */
export async function visitasDaVaga(anuncioId: string): Promise<number | null> {
  if (MODO_DEMO || !UUID.test(anuncioId)) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("anuncio_visitas")
    .select("total")
    .eq("anuncio_id", anuncioId)
    .maybeSingle();
  if (error) return null;
  return data?.total ?? 0;
}
