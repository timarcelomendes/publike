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

/** As vagas no ar da conta e se é agência verificada (migração 20270407120000); sem a migração, null. */
export async function minhaFaixa(): Promise<{ vagas_no_ar: number; agencia: boolean } | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("minha_faixa");
  if (error || !data || typeof data !== "object") return null;
  const o = data as { vagas_no_ar?: unknown; agencia?: unknown };
  return { vagas_no_ar: Number(o.vagas_no_ar) || 0, agencia: o.agencia === true };
}
