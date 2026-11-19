import "server-only";
import { rascunhoValido, type TipoConvite } from "@/lib/convites";
import { criarClientePublico } from "@/lib/supabase/servidor";

/** O convite do link (só se ainda vale: quem disse que não quer não vê mais o convite). */
export async function conviteDoLink(token: string | undefined) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await criarClientePublico().rpc("convite_do_token", { p_token: token });
  const c = data?.[0];
  if (!c || c.status === "recusou") return null;
  return { token, nome: c.nome, tipo: c.tipo as TipoConvite, rascunho: rascunhoValido(c.rascunho) };
}

/**
 * A vaga que a empresa mandou pelo WhatsApp (o link da resposta, migração 20270806120000): o rascunho lido pela IA, de
 * quantas vagas o anúncio tinha e se já foi publicada. Abrir fica marcado (para os números do Admin).
 */
export async function vagaDoWhatsappDoLink(token: string | undefined) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { data, error } = await criarClientePublico().rpc("vaga_do_whatsapp", { p_token: token });
  if (error || !data) return null;
  const v = data as unknown as {
    empresa: string | null;
    rascunho: unknown;
    ordem: number;
    total: number;
    publicada: boolean;
    anuncio_id: string | null;
  };
  return {
    token,
    nome: v.empresa?.trim() || "sua empresa",
    rascunho: rascunhoValido(v.rascunho),
    ordem: Number(v.ordem) || 1,
    total: Number(v.total) || 1,
    publicada: Boolean(v.publicada),
    anuncioId: v.anuncio_id,
  };
}
