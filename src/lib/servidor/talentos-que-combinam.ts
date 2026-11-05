import "server-only";
import type { CamposDaVaga } from "@/lib/aderencia";
import { formatarLugar } from "@/lib/formato";
import type { Curriculo } from "@/lib/tipos";
import { comoCurriculo, escolherTalentos, type TalentoParaCombinar } from "./combinam";
import { acessoFila } from "./filas";
import { comFuncaoDasVagas, comFuncoes } from "./funcoes-pelo-contexto";

// "Chegou um candidato que combina com a sua vaga" (claude/plano-talento-que-combina.md, 05/11/2026; migração
// 20270214120000): o robô das filas lê os currículos da aba Talentos que mudaram desde a última vez, faz a conta do %
// com as vagas no ar de cada conta da região (a mesma do "Talentos que combinam": 70% ou mais, sem "Outra área") e
// pede ao banco para avisar. O banco confere de novo: uma vez por pessoa e vaga, sem quem curtiu ou bloqueou, no
// máximo 3 por conta por dia.

type ContaComVagas = { conta_id: string; vagas: unknown; ja: string[] | null };

export async function avisarTalentosQueCombinam(limite = 30): Promise<{ avisados: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { avisados: 0 };
  const { cliente, chave } = acesso;
  const { data: mudados, error } = await cliente.rpc("servidor_talentos_mudados", { p_chave: chave, p_limite: limite });
  if (error) {
    if (error.code === "PGRST202") return { avisados: 0 };
    console.error("Publike: falha ao ler os talentos mudados:", error.message);
    return { avisados: 0, motivo: "Não foi possível ler os currículos novos para avisar as empresas." };
  }
  if (!mudados?.length) return { avisados: 0 };
  const ate = mudados[mudados.length - 1].atualizado_em;

  const { data: contas, error: e2 } = await cliente.rpc("servidor_contas_com_vagas", { p_chave: chave });
  if (e2) {
    console.error("Publike: falha ao ler as contas com vaga:", e2.message);
    return { avisados: 0, motivo: "Não foi possível ler as vagas para avisar as empresas." };
  }

  // a função (CBO) que a IA leu de cada vaga e de cada experiência: o % pelo contexto
  const semCbo = mudados
    .map((t) => ({ perfil_id: t.perfil_id, nome: t.nome, cidade: t.cidade, bairro: t.bairro, cv: comoCurriculo(t.curriculo) }))
    .filter((t): t is typeof t & { cv: Curriculo } => t.cv !== null);
  const cvs = await comFuncoes(semCbo.map((t) => t.cv));
  const talentos: TalentoParaCombinar[] = semCbo.map((t, i) => ({ ...t, cv: cvs[i] }));
  const listas = (contas ?? []) as ContaComVagas[];
  const todasAsVagas = await comFuncaoDasVagas(
    listas.flatMap((c) => (Array.isArray(c.vagas) ? (c.vagas as (CamposDaVaga & { id: string })[]) : [])),
  );
  const vagaComCbo = new Map(todasAsVagas.map((v) => [v.id, v]));

  let avisados = 0;
  const agora = Date.now();
  for (const c of listas) {
    const vagas = (Array.isArray(c.vagas) ? (c.vagas as (CamposDaVaga & { id: string })[]) : []).map(
      (v) => vagaComCbo.get(v.id) ?? v,
    );
    if (!vagas.length) continue;
    // cada pessoa na vaga em que combina mais (até 3 por conta por rodada; o banco segura o limite do dia)
    const boas = escolherTalentos(c.conta_id, vagas, talentos, new Set(c.ja ?? []), agora, 3);
    for (const b of boas) {
      const lugar = formatarLugar(b.t.bairro, b.t.cidade ?? "");
      const texto = `Chegou um candidato que combina com “${b.vaga}”: ${b.t.nome}${lugar ? `, ${lugar}` : ""}, ${b.m.nota ?? 0}% de match.`;
      const { data: avisou, error: e3 } = await cliente.rpc("servidor_avisar_talento", {
        p_chave: chave,
        p_conta: c.conta_id,
        p_anuncio: b.vagaId,
        p_perfil: b.t.perfil_id,
        p_texto: texto,
      });
      if (e3) console.error("Publike: falha ao avisar o talento:", e3.message);
      else if (avisou) avisados++;
    }
  }

  const { error: e4 } = await cliente.rpc("servidor_talentos_lidos_ate", { p_chave: chave, p_ate: ate });
  if (e4) console.error("Publike: falha ao marcar a leitura dos talentos:", e4.message);
  return { avisados };
}
