"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { A_RECURSO, dataCurta, DIAS_GRATIS, ehRecursoPago, type RecursoPago } from "@/lib/recursos-pagos";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

// Os 15 dias grátis do Copiloto e dos Testes Publike (migração 20261215120000).

async function comConta(): Promise<string | null> {
  if (MODO_DEMO) return MENSAGEM_DEMO;
  if (!(await obterUsuario())) return "Entre na sua conta.";
  return null;
}

/** Abre o recurso na hora, por 15 dias. Cada conta experimenta cada recurso uma vez. */
export async function experimentarRecurso(recurso: RecursoPago): Promise<Resultado> {
  const sem = await comConta();
  if (sem) return { ok: false, erro: sem };
  if (!ehRecursoPago(recurso)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("experimentar_recurso", { p_recurso: recurso });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para liberar agora. Tente de novo.") };
  refresh();
  const ate = typeof data === "string" ? ` até ${dataCurta(data)}` : ` por ${DIAS_GRATIS} dias`;
  return { ok: true, mensagem: `Pronto: acesso ${A_RECURSO[recurso]} liberado${ate}.` };
}

/** Depois dos 15 dias: avisa o Publike de que a conta quer continuar. */
export async function queroContinuar(recurso: RecursoPago): Promise<Resultado> {
  const sem = await comConta();
  if (sem) return { ok: false, erro: sem };
  if (!ehRecursoPago(recurso)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("quero_continuar", { p_recurso: recurso });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para mandar agora. Tente de novo.") };
  refresh();
  return { ok: true, mensagem: "Recebemos. A gente fala com você em breve." };
}
