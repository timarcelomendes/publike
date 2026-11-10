import { lerConversa, type MensagemModeracao } from "@/lib/conversa-moderacao";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/** Quem publicou: a conversa com a moderação do próprio anúncio (sem a migração, vazia). */
export async function minhaConversaModeracao(anuncioId: string): Promise<MensagemModeracao[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("minha_conversa_moderacao", { p_anuncio: anuncioId });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler a conversa com a moderação: ${error.message}`);
    return [];
  }
  return lerConversa(data);
}

/** A moderação: as conversas dos anúncios, por anúncio (sem a migração, nenhuma). */
export async function conversasDaModeracao(c: ClienteBanco, anuncios: string[]) {
  const porAnuncio = new Map<string, MensagemModeracao[]>();
  if (!anuncios.length) return porAnuncio;
  const { data, error } = await c.rpc("equipe_conversas_moderacao", { p_anuncios: anuncios.slice(0, 200) });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler as conversas da moderação: ${error.message}`);
    return porAnuncio;
  }
  for (const linha of data ?? []) {
    const [m] = lerConversa([linha]);
    if (!m) continue;
    const lista = porAnuncio.get(linha.anuncio_id) ?? [];
    lista.push(m);
    porAnuncio.set(linha.anuncio_id, lista);
  }
  return porAnuncio;
}

/** A moderação: os anúncios removidos em que quem publicou escreveu e ainda espera resposta. */
export async function explicacoesPendentes(c: ClienteBanco) {
  const { data, error } = await c.rpc("equipe_explicacoes_pendentes");
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler as explicações pendentes: ${error.message}`);
    return [];
  }
  return data ?? [];
}
