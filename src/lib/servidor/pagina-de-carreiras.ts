import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * A Página de carreiras da conta já está liberada (10 vagas publicadas, cortesia da equipe ou uma assinatura paga
 * valendo; migração 20270406120000). Sem a migração ou com erro, false: a tela de assinar segue normal e o servidor
 * do pagamento confere de novo.
 */
export async function paginaDeCarreirasLiberada(): Promise<boolean> {
  const { data, error } = await (await criarClienteServidor()).rpc("minha_pagina_de_vagas");
  if (error || !data || typeof data !== "object") return false;
  return (data as { liberada?: unknown }).liberada === true;
}
