import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { TESTES_DA_PUBLIKE, testeSugerido } from "@/lib/testes";

// Teste Prático (migração 20261204120000): o que as páginas leem do banco. Sem a migração, listas vazias.

/**
 * Ao publicar a vaga, o teste da Publike que combina com a função entra nela: grátis e opcional para o candidato
 * (migração 20261224120000). Falhou (o teste fora do ar, o banco sem a migração): a vaga sai sem teste, sem aviso.
 */
export async function porTesteSugerido(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  anuncioId: string,
  titulo: string,
  categoria: string | null,
) {
  const modelo = TESTES_DA_PUBLIKE[testeSugerido(titulo, categoria)];
  const { error } = await supabase.rpc("avaliacoes_salvar_na_vaga", {
    p_anuncio: anuncioId,
    p_itens: [{ modelo_id: modelo, obrigatoria: false }],
  });
  if (error) {
    if (error.code !== "PGRST202") console.warn(`Publike: a vaga saiu sem o teste sugerido: ${error.message}`);
    return false;
  }
  return true;
}

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
