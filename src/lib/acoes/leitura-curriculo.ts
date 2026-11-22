"use server";

import { refresh } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// "Não é isso? Corrigir" (migração 20270826120000): a pessoa tira uma função indicada pela leitura do currículo. Ela
// some da busca de Talentos e não volta, nem numa leitura nova.
export async function tirarFuncaoIndicada(cbo: string): Promise<{ ok: boolean; erro?: string }> {
  if (!/^\d{6}$/.test(cbo)) return { ok: false, erro: "Função inválida." };
  const c = await criarClienteServidor();
  const { error } = await c.rpc("tirar_funcao_indicada", { p_cbo: cbo });
  if (error) return { ok: false, erro: "Não deu para tirar agora. Tente de novo." };
  refresh();
  return { ok: true };
}
