import "server-only";
import { MODO_DEMO } from "@/lib/config";
import type { FuncionalidadeIA } from "@/lib/ia-nomes";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { chaveDoServidor, chaveSecretaSupabase } from "./ambiente";

// Conta cada chamada da IA na funcionalidade dela (migração 20270210120000; Admin › IA mostra as chamadas e o custo
// dos últimos 30 dias). Só os números: o modelo que respondeu, os tokens e se falhou. Sem a migração, sem a chave do
// servidor ou com falha, nada acontece: contar nunca atrapalha a resposta.

/** Espera no máximo isso pelo banco (a pessoa está esperando a resposta da IA). */
const ESPERA = 1500;

export async function contarUsoDaIA(
  funcionalidade: FuncionalidadeIA,
  modelo: string,
  tokens: { entrada: number; saida: number } | null,
  falhou = false,
) {
  // como as filas (acessoFila): a chave do servidor ou, no computador de quem desenvolve, a chave secreta
  const chave = chaveDoServidor();
  if (MODO_DEMO || (!chave && !chaveSecretaSupabase())) return;
  try {
    const conta = (chave ? criarClientePublico() : criarClienteAdmin())
      .rpc("servidor_contar_uso_da_ia", {
        p_chave: chave ?? "",
        p_funcionalidade: funcionalidade,
        p_modelo: modelo.slice(0, 60),
        p_falhou: falhou,
        p_entrada: Math.round(tokens?.entrada ?? 0),
        p_saida: Math.round(tokens?.saida ?? 0),
      })
      .then(({ error }) => {
        if (error && error.code !== "PGRST202") console.error("Publike: falha ao contar o uso da IA:", error.message);
      });
    await Promise.race([conta, new Promise((r) => setTimeout(r, ESPERA))]);
  } catch (e) {
    console.error("Publike: falha ao contar o uso da IA:", e instanceof Error ? e.message : e);
  }
}
