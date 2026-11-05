import "server-only";
import { cache } from "react";
import { lerExperiencias } from "@/lib/dados";
import { faixaDoBanco, type FaixaSalarial } from "@/lib/salarios";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { comFuncoes } from "./funcoes-pelo-contexto";

// A consulta de salários de quem contrata (claude/plano-consulta-de-salarios.md, parte 1; migração 20270218120000):
// o saldo de consultas, a consulta completa de uma função (o banco só devolve a quem assina ou já abriu a função nos
// últimos 30 dias) e quantas pessoas da aba Talentos já trabalharam na função.

export type SalariosDaConta = {
  saldo: number;
  assinante: boolean;
  /** quantas vagas novas faltam para as próximas 2 consultas */
  vagasFaltam: number;
  /** as funções abertas nos últimos 30 dias (abrir de novo não gasta) */
  consultadas: Map<string, string>;
};

/** O saldo e as funções já abertas (dá as 5 de boas-vindas na primeira vez); null sem a migração ou sem contratar. */
export const salariosDaConta = cache(
  async (): Promise<SalariosDaConta | null> => {
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("salarios_da_conta");
    if (error) {
      if (error.code !== "PGRST202")
        console.error(
          "Publike: falha ao ler as consultas de salário:",
          error.message,
        );
      return null;
    }
    if (!data || typeof data !== "object") return null;
    const o = data as Record<string, unknown>;
    const consultadas = new Map<string, string>();
    for (const c of Array.isArray(o.consultadas) ? o.consultadas : []) {
      const x = c as { cbo?: unknown; em?: unknown };
      if (typeof x.cbo === "string" && typeof x.em === "string")
        consultadas.set(x.cbo, x.em);
    }
    return {
      saldo: Number(o.saldo ?? 0),
      assinante: o.assinante === true,
      vagasFaltam: Number(o.vagas_faltam ?? 5),
      consultadas,
    };
  },
);

/** O que as vagas do Publike da praça oferecem por mês (só com 5 vagas ou mais, de 3 contas ou mais). */
export type NoPublike = {
  n: number;
  contas: number;
  p25: number;
  p50: number;
  p75: number;
};

export type ConsultaCompleta = {
  regioes: FaixaSalarial[];
  publike: NoPublike | null;
};

/** A consulta completa de uma função; null quando a conta ainda não abriu (ou a função não tem dados). */
export async function consultaCompleta(
  cbo: string,
  cidades: readonly string[],
): Promise<ConsultaCompleta | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("consulta_de_salario", {
    p_cbo: cbo,
    p_cidades: [...cidades],
  });
  if (error) {
    if (error.code !== "PGRST202")
      console.error(
        "Publike: falha ao ler a consulta de salário:",
        error.message,
      );
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const o = data as { regioes?: unknown; publike?: unknown };
  const regioes = (Array.isArray(o.regioes) ? o.regioes : []).map((r) =>
    faixaDoBanco(r as Parameters<typeof faixaDoBanco>[0]),
  );
  const p = o.publike as Record<string, unknown> | null | undefined;
  return {
    regioes,
    publike: p
      ? {
          n: Number(p.n),
          contas: Number(p.contas),
          p25: Number(p.p25),
          p50: Number(p.p50),
          p75: Number(p.p75),
        }
      : null,
  };
}

/**
 * Quantas pessoas da aba Talentos nas cidades da praça já trabalharam na função (a ocupação que o robô leu de cada
 * experiência). Só o número: sem nome nem contato.
 */
export async function talentosDaFuncao(
  cbo: string,
  cidades: readonly string[],
): Promise<number> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("experiencias_da_vitrine", {
    p_cidades: [...cidades],
  });
  if (error) {
    if (error.code !== "PGRST202")
      console.error(
        "Publike: falha ao ler os talentos da função:",
        error.message,
      );
    return 0;
  }
  const cvs = await comFuncoes(
    (data ?? []).map((t) => ({
      experiencias: lerExperiencias(t.experiencias),
    })),
  );
  return cvs.filter((c) => c?.experiencias?.some((e) => e?.cbo === cbo)).length;
}
