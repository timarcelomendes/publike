"use server";

import { criarClientePublico } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

// A empresa que recebeu o convite e não quer: o convite vira "Não quis" e o admin não manda mais.

export async function recusarConvite(token: string): Promise<Resultado> {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token))
    return { ok: false, erro: "Link de convite inválido." };
  const { error } = await criarClientePublico().rpc("recusar_convite", { p_token: token });
  if (error) return { ok: false, erro: "Não deu para registrar agora. Tente de novo." };
  return { ok: true, mensagem: "Pronto: não vamos mandar mais convites. Obrigado pela resposta!" };
}
