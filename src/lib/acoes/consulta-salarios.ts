"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Abrir a consulta completa de uma função (claude/plano-consulta-de-salarios.md; migração 20270218120000). O banco
// confere de novo quem pode, gasta uma consulta (sem assinatura e sem ter aberto a mesma função em 30 dias) e segura
// dois cliques juntos.

export type ResultadoConsulta =
  { ok: true; gastou: boolean; saldo: number } | { ok: false; erro: string };

export async function abrirConsultaDeSalario(
  cbo: string,
): Promise<ResultadoConsulta> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!/^\d{6}$/.test(String(cbo ?? "")))
    return { ok: false, erro: "Escolha a função de novo." };
  const usuario = await obterUsuario();
  if (!usuario)
    return { ok: false, erro: "Entre na sua conta para consultar." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("consultar_salario", {
    p_cbo: cbo,
  });
  if (error) {
    if (error.code === "PGRST202")
      return {
        ok: false,
        erro: "A consulta de salários ainda não está pronta.",
      };
    if (error.code === "42501") return { ok: false, erro: error.message };
    console.error(
      "Publike: falha ao abrir a consulta de salário:",
      error.message,
    );
    return { ok: false, erro: "Não deu para abrir a consulta. Tente de novo." };
  }
  const r = (data ?? {}) as {
    ok?: boolean;
    motivo?: string;
    gastou?: boolean;
    saldo?: number;
  };
  if (!r.ok) {
    return {
      ok: false,
      erro:
        r.motivo === "sem_dados"
          ? "Ainda não há contratações suficientes dessa função em Goiás. Nenhuma consulta foi gasta."
          : "Suas consultas acabaram. Publique mais vagas para ganhar outras, ou assine para consultar sem limite.",
    };
  }
  refresh();
  return { ok: true, gastou: r.gastou === true, saldo: Number(r.saldo ?? 0) };
}
