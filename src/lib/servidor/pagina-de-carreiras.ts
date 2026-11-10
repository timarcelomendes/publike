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

/**
 * As vagas no ar da conta, se é agência verificada (migração 20270407120000) e, quando o plano por faixa ficou pequeno,
 * até quando dá para mudar de faixa (30 dias, migração 20270412120000). Sem a migração, null.
 */
export type MinhaFaixa = {
  vagas_no_ar: number;
  agencia: boolean;
  passou: { plano: string; limite: number; prazo: string } | null;
};

export async function minhaFaixa(): Promise<MinhaFaixa | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("minha_faixa");
  if (error || !data || typeof data !== "object") return null;
  const o = data as { vagas_no_ar?: unknown; agencia?: unknown; passou?: unknown };
  const p = o.passou && typeof o.passou === "object" ? (o.passou as Record<string, unknown>) : null;
  return {
    vagas_no_ar: Number(o.vagas_no_ar) || 0,
    agencia: o.agencia === true,
    passou:
      p && typeof p.prazo === "string"
        ? { plano: String(p.plano ?? ""), limite: Number(p.limite) || 0, prazo: p.prazo }
        : null,
  };
}
