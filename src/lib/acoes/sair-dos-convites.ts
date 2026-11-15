"use server";

import { criarClientePublico } from "@/lib/supabase/servidor";

/** "Não quero receber" do convite (migração 20270608120000): o convite vira "Não quis" e o CNPJ sai das listas. */
export async function sairDosConvites(token: string): Promise<{ ok: boolean }> {
  if (typeof token !== "string" || token.length < 8 || token.length > 100) return { ok: false };
  const { data, error } = await criarClientePublico().rpc("sair_dos_convites", { p_token: token });
  return { ok: !error && Boolean(data) };
}
