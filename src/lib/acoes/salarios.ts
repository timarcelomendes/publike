"use server";

import { obterUsuario } from "@/lib/dados";
import { pracaDaCidade } from "@/lib/pracas";
import { faixaDoBanco, regiaoDaCidade, type FaixaSalarial } from "@/lib/salarios";
import { criarClientePublico } from "@/lib/supabase/servidor";

// Salário do mercado (claude/plano-salario-e-curriculo.md, parte 3): a faixa de uma função na região da cidade (o
// Novo Caged, migração 20270131120000) e a média das vagas parecidas no ar no Publike. Dados públicos e agregados.

export type MercadoDaFuncao = {
  faixa: FaixaSalarial;
  /** as vagas no ar da mesma função na praça, por mês, de outras contas (só com 3 ou mais) */
  publike: { n: number; media: number } | null;
};

/** A faixa da função para a cidade (a da praça; sem ela, a de Goiás), ou null. */
export async function mercadoDaFuncao(cbo: string, cidade: string): Promise<MercadoDaFuncao | null> {
  if (!/^\d{6}$/.test(String(cbo ?? ""))) return null;
  const regiao = regiaoDaCidade(String(cidade ?? "")) ?? "go";
  const banco = criarClientePublico();
  const cidades = [...(pracaDaCidade(String(cidade ?? ""))?.cidades ?? (cidade ? [cidade] : []))];
  // as vagas da própria conta não entram na média das parecidas
  const usuario = await obterUsuario().catch(() => null);
  const [{ data, error }, media] = await Promise.all([
    banco.rpc("salario_da_funcao", { p_cbo: cbo, p_regiao: regiao }),
    cidades.length
      ? banco.rpc("media_da_funcao_no_publike", {
          p_cbo: cbo,
          p_cidades: cidades,
          p_sem_autor: usuario?.id ?? null,
        })
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler a faixa de salário:", error.message);
    return null;
  }
  const f = data?.[0];
  if (!f) return null;
  const m = media.data?.[0];
  return {
    faixa: faixaDoBanco(f),
    publike: m && m.n >= 3 && m.media != null ? { n: m.n, media: Number(m.media) } : null,
  };
}
