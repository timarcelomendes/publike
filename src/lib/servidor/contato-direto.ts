import "server-only";
import { MODO_DEMO } from "@/lib/config";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// Contato direto na vitrine de serviços: vale para todos os serviços da conta (o formulário de
// "Meus serviços" é um só). Quem curtir já dá match e os dois veem o contato.

/** Ligado ou não nos serviços da conta; sem serviço ainda, null (o formulário começa ligado). */
export async function contatoDiretoDosServicos(c: ClienteBanco, autorId: string): Promise<boolean | null> {
  const { data } = await c.from("anuncios").select("contato_direto").eq("autor_id", autorId).eq("tipo", "servico");
  if (!data?.length) return null;
  return data.some((a) => a.contato_direto);
}

/** Depois de salvar os serviços: a opção do formulário vale para todos eles. */
export async function salvarContatoDireto(c: ClienteBanco, autorId: string, formData: FormData) {
  const ligado = formData.get("contato_direto") === "on";
  const { error } = await c
    .from("anuncios")
    .update({ contato_direto: ligado })
    .eq("autor_id", autorId)
    .eq("tipo", "servico")
    .neq("contato_direto", ligado);
  if (error) console.warn("Publike: não deu para salvar o contato direto:", error.message);
}

/**
 * Quais destes anúncios (vagas ou serviços) têm contato direto: neles o match sai na hora, sem
 * aceite, e a mensagem do WhatsApp leva o link do anúncio (veja linkDoMatch). O que a pessoa não
 * pode ler (anúncio de outra conta fora do ar) fica como "com aceite".
 */
export async function anunciosComContatoDireto(ids: string[]): Promise<Set<string>> {
  const unicos = [...new Set(ids)].filter((id) => UUID.test(id)).slice(0, 200);
  if (MODO_DEMO || !unicos.length) return new Set();
  const { data, error } = await (
    await criarClienteServidor()
  )
    .from("anuncios")
    .select("id")
    .in("id", unicos)
    .eq("contato_direto", true);
  if (error) {
    console.error(`Publike: falha ao ler o contato direto dos anúncios: ${error.message}`);
    return new Set();
  }
  return new Set((data ?? []).map((a) => a.id));
}
