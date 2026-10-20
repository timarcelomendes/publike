import "server-only";
import { colocacaoDoBanco, type Colocacao } from "@/lib/colocacoes";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Leituras das colocações da agência (o banco só deixa quem publicou a vaga ler).

const CAMPOS = "anuncio_id, perfil_id, inicio, taxa, paga, garantia_dias, saiu_em, nota";

/** As colocações de algumas vagas (ou de todas as minhas, sem a lista), por "anúncio:perfil". */
export async function colocacoesDasVagas(anuncioIds?: string[]): Promise<Map<string, Colocacao>> {
  if (anuncioIds && !anuncioIds.length) return new Map();
  const supabase = await criarClienteServidor();
  let consulta = supabase.from("colocacoes").select(CAMPOS).order("inicio", { ascending: false });
  if (anuncioIds) consulta = consulta.in("anuncio_id", anuncioIds);
  const { data, error } = await consulta;
  if (error) {
    console.error(`Publike: falha ao ler as colocações: ${error.message}`);
    return new Map();
  }
  return new Map((data ?? []).map((r) => [`${r.anuncio_id}:${r.perfil_id}`, colocacaoDoBanco(r)]));
}
