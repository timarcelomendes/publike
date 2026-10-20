import "server-only";
import { ehDecisao, type FinalistaDaVaga } from "@/lib/finalistas";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Leituras dos finalistas de uma vaga para a agência (o banco só deixa quem publicou ler).

/** Os finalistas da vaga, por pessoa. Sem acesso ou com erro: vazio. */
export async function finalistasDaVaga(anuncioId: string): Promise<Map<string, FinalistaDaVaga>> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("finalistas")
    .select("id, perfil_id, parecer, decisao, comentario, quem, decidido_em, criado_em")
    .eq("anuncio_id", anuncioId)
    .order("criado_em");
  if (error) {
    console.error(`Publike: falha ao ler os finalistas: ${error.message}`);
    return new Map();
  }
  return new Map((data ?? []).map((f) => [f.perfil_id, { ...f, decisao: ehDecisao(f.decisao) ? f.decisao : null }]));
}

export type LinkDosFinalistas = { token: string; expira_em: string; aberto_em: string | null; aberturas: number };

/** O link da vaga para o cliente (null: ainda não foi criado). */
export async function linkDosFinalistas(anuncioId: string): Promise<LinkDosFinalistas | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("links_finalistas")
    .select("token, expira_em, aberto_em, aberturas")
    .eq("anuncio_id", anuncioId)
    .maybeSingle();
  if (error) {
    console.error(`Publike: falha ao ler o link dos finalistas: ${error.message}`);
    return null;
  }
  return data;
}
