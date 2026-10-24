import "server-only";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Triagem } from "@/lib/vaga-extra";

// A triagem das perguntas da vaga (a resposta procurada e se elimina) fica em
// vaga_triagem, que só quem publicou lê: a vaga em si é pública.

/**
 * Grava a triagem depois de salvar a vaga. `undefined`: o formulário não mandou, fica como está.
 * Devolve o erro do banco (a vaga já salvou: quem chama avisa a pessoa e a equipe).
 */
export async function salvarTriagem(cliente: ClienteBanco, anuncioId: string, triagem: Triagem | undefined) {
  if (triagem === undefined) return null;
  const { error } = await cliente
    .from("vaga_triagem")
    .upsert({ anuncio_id: anuncioId, criterios: triagem, atualizado_em: new Date().toISOString() });
  if (error) console.error(`Publike: falha ao guardar a triagem da vaga: ${error.message}`);
  return error;
}

/** A triagem de uma vaga minha (vazia se não houver ou se não for minha). */
export async function obterTriagem(anuncioId: string, cliente?: ClienteBanco): Promise<Triagem> {
  const c = cliente ?? (await criarClienteServidor());
  const { data } = await c.from("vaga_triagem").select("criterios").eq("anuncio_id", anuncioId).maybeSingle();
  return (data?.criterios ?? {}) as Triagem;
}

/** A triagem de várias vagas minhas, por id. */
export async function obterTriagens(anuncioIds: string[]): Promise<Map<string, Triagem>> {
  if (!anuncioIds.length) return new Map();
  const c = await criarClienteServidor();
  const { data } = await c.from("vaga_triagem").select("anuncio_id, criterios").in("anuncio_id", anuncioIds);
  return new Map((data ?? []).map((l) => [l.anuncio_id, (l.criterios ?? {}) as Triagem]));
}
