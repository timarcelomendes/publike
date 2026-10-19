import "server-only";
import type { ClienteBanco } from "@/lib/supabase/admin";

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
