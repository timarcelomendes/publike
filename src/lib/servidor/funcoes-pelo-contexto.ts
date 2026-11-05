import "server-only";
import { createHash } from "node:crypto";
import type { Candidato } from "@/lib/aderencia";
import { criarClientePublico } from "@/lib/supabase/servidor";

// O % pela função que cada lado descreve (claude/plano-match-pelo-contexto.md, 05/11/2026). A IA lê o cargo e o
// "o que você fazia" de cada experiência (o robô das filas, em funcao.ts) e guarda a ocupação da CBO por uma
// impressão do texto (privado.funcoes_das_experiencias: só a impressão e o código, sem o texto). Aqui, na hora de
// calcular o %, o servidor põe a ocupação em cada experiência (`cbo`) e a da vaga (privado.funcoes_das_vagas).
// Sem a migração ou com falha, nada muda: o % fica na conta das palavras do título.

/** O texto sem acento, em minúsculas e sem pontuação (o mesmo jeito de comparar em todo lugar). */
function limpo(texto: string | null | undefined) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A impressão de uma experiência: o cargo e o que a pessoa fazia (mudou um, muda a impressão). */
export function chaveDaExperiencia(e: { cargo: string; descricao?: string | null }) {
  return createHash("sha256").update(`${limpo(e.cargo)}|${limpo(e.descricao)}`).digest("hex").slice(0, 40);
}

type ComExperiencias = { experiencias?: Pick<NonNullable<Candidato["curriculo"]>, "experiencias">["experiencias"] };

/**
 * Os currículos com a ocupação da CBO em cada experiência (uma leitura no banco para todos). Devolve cópias: o
 * currículo de quem chamou não muda (o `cbo` não pode ir parar no formulário nem ser salvo). O `cbo` que já vier
 * no currículo é jogado fora: só vale o que o robô guardou (quem edita o próprio currículo não escolhe o seu).
 */
export async function comFuncoes<T extends ComExperiencias | null | undefined>(curriculos: T[]): Promise<T[]> {
  const chaves = curriculos.flatMap((c) => (c?.experiencias ?? []).filter(Boolean).map(chaveDaExperiencia));
  if (!chaves.length) return curriculos;
  let porChave = new Map<string, string>();
  try {
    const { data, error } = await criarClientePublico().rpc("funcoes_das_experiencias", {
      p_chaves: [...new Set(chaves)].slice(0, 2000),
    });
    if (error) {
      if (error.code !== "PGRST202") console.error("Publike: falha ao ler as funções das experiências:", error.message);
    } else porChave = new Map((data ?? []).map((l) => [l.chave, l.cbo]));
  } catch (e) {
    console.error("Publike: falha ao ler as funções das experiências:", e instanceof Error ? e.message : e);
  }
  return curriculos.map((c) =>
    c?.experiencias?.length
      ? ({
          ...c,
          experiencias: c.experiencias.map((e) => {
            if (!e) return e;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { cbo: _veio, ...resto } = e;
            const cbo = porChave.get(chaveDaExperiencia(e));
            return cbo ? { ...resto, cbo } : resto;
          }),
        } as T)
      : c,
  );
}

/** Um currículo só (o de quem procura). */
export async function comFuncoesDoCurriculo<T extends ComExperiencias | null | undefined>(curriculo: T): Promise<T> {
  return (await comFuncoes([curriculo]))[0];
}

/** As vagas com a ocupação da CBO guardada (cópias; as que já têm ficam como estão). */
export async function comFuncaoDasVagas<T extends { id: string; cbo?: string | null }>(vagas: T[]): Promise<T[]> {
  const faltam = vagas.filter((v) => !v.cbo);
  if (!faltam.length) return vagas;
  try {
    const porVaga = new Map<string, string>();
    for (let i = 0; i < faltam.length; i += 200) {
      const { data, error } = await criarClientePublico().rpc("funcoes_das_vagas", {
        p_ids: [...new Set(faltam.slice(i, i + 200).map((v) => v.id))],
      });
      if (error) {
        if (error.code !== "PGRST202") console.error("Publike: falha ao ler as funções das vagas:", error.message);
        return vagas;
      }
      for (const l of data ?? []) if (l.cbo) porVaga.set(l.anuncio_id, l.cbo);
    }
    return vagas.map((v) => (!v.cbo && porVaga.has(v.id) ? { ...v, cbo: porVaga.get(v.id) } : v));
  } catch (e) {
    console.error("Publike: falha ao ler as funções das vagas:", e instanceof Error ? e.message : e);
    return vagas;
  }
}
