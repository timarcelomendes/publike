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
