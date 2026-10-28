import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Testes Publike (migração 20261204120000): o que as páginas leem do banco. Sem a migração, listas vazias.

export async function testesDaVaga(anuncioId: string) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("avaliacoes_da_vaga", { p_anuncio: anuncioId });
  if (error && error.code !== "PGRST202") console.error(`Publike: falha ao ler os testes da vaga: ${error.message}`);
  return data ?? [];
}

/** Os meus testes desta vaga, por teste (modelo). */
export async function meusTestesDaVaga(anuncioId: string) {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("minhas_avaliacoes");
  return (data ?? []).filter((t) => t.anuncio_id === anuncioId);
}

export async function bibliotecaDeTestes() {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("avaliacoes_biblioteca");
  if (error && error.code !== "PGRST202") console.error(`Publike: falha ao ler os testes: ${error.message}`);
  return error ? null : (data ?? []);
}

export async function resultadosDosTestes(anuncioId: string) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("avaliacoes_resultados", { p_anuncio: anuncioId });
  if (error && error.code !== "PGRST202") console.error(`Publike: falha ao ler os resultados: ${error.message}`);
  return data ?? [];
}
