// Nota de aderência: o quanto o candidato bate com o que a vaga pede.
// Conta só o que dá para saber (escolaridade, experiência e CNH pelo currículo,
// a cidade pelo perfil, as perguntas com a resposta que a empresa procura).
// Pergunta eliminatória respondida diferente: nota 0. Sem nada para comparar: sem nota.

import { ESCOLARIDADES, EXPERIENCIAS, nomeEscolaridade } from "./constantes";
import type { Curriculo } from "./tipos";
import { textoDaResposta, type Pergunta, type Respostas } from "./vaga-extra";

export type Criterio = {
  nome: string;
  /** null: não dá para saber (sem currículo, sem resposta) */
  ok: boolean | null;
  detalhe: string;
  eliminatorio?: boolean;
};

export type Aderencia = { nota: number | null; eliminado: boolean; criterios: Criterio[] };

type Vaga = {
  escolaridade_minima: string | null;
  experiencia: string | null;
  cnh: string | null;
  cidade: string;
  /** com a triagem junto (juntarTriagem) */
  perguntas: Pergunta[];
};

type Candidato = {
  curriculo: Pick<Curriculo, "escolaridade" | "experiencias" | "cnh"> | null;
  respostas: Respostas;
  cidade: string | null;
};

const MESES_PEDIDOS: Record<string, number> = { "6_meses": 6, "1_ano": 12, "2_anos": 24 };

/** Quantos meses de experiência, somando as do currículo (até hoje nas atuais). */
export function mesesDeExperiencia(experiencias: { inicio: string; fim: string | null }[], agora: number) {
  const hoje = new Date(agora);
  const mesHoje = hoje.getUTCFullYear() * 12 + hoje.getUTCMonth();
  const mes = (t: string) => {
    const m = /^(\d{4})-(\d{2})/.exec(t);
    return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
  };
  let total = 0;
  for (const e of experiencias) {
    const ini = mes(e.inicio);
    const fim = e.fim ? mes(e.fim) : mesHoje;
    if (ini !== null && fim !== null && fim >= ini) total += fim - ini + 1;
  }
  return total;
}

/** As categorias que a CNH cobre: D cobre C e B; AB é A e B. */
function categorias(cnh: string) {
  const c = cnh.toUpperCase();
  const set = new Set<string>();
  if (c.includes("A")) set.add("A");
  const pesadas = ["B", "C", "D", "E"];
  const maior = pesadas.filter((x) => c.includes(x)).map((x) => pesadas.indexOf(x));
  if (maior.length) for (let i = 0; i <= Math.max(...maior); i++) set.add(pesadas[i]);
  return set;
}

export function calcularAderencia(vaga: Vaga, c: Candidato, agora: number): Aderencia {
  const criterios: Criterio[] = [];
  const cv = c.curriculo;

  if (vaga.escolaridade_minima) {
    const pede = ESCOLARIDADES.findIndex((e) => e.valor === vaga.escolaridade_minima);
    const tem = cv?.escolaridade ? ESCOLARIDADES.findIndex((e) => e.valor === cv.escolaridade) : -1;
    criterios.push({
      nome: `Escolaridade: ${nomeEscolaridade(vaga.escolaridade_minima)}`,
      ok: tem < 0 ? null : tem >= pede,
      detalhe: tem < 0 ? "Sem escolaridade no currículo" : (nomeEscolaridade(cv?.escolaridade) ?? ""),
    });
  }

  const meses = vaga.experiencia ? MESES_PEDIDOS[vaga.experiencia] : undefined;
  if (meses) {
    const nome = EXPERIENCIAS.find((e) => e.valor === vaga.experiencia)?.nome ?? "Experiência";
    if (!cv) criterios.push({ nome: `Experiência: ${nome.toLowerCase()}`, ok: null, detalhe: "Sem currículo" });
    else {
      const tem = mesesDeExperiencia(cv.experiencias, agora);
      criterios.push({
        nome: `Experiência: ${nome.toLowerCase()}`,
        ok: tem >= meses,
        detalhe:
          tem === 0
            ? "Sem experiência no currículo"
            : tem < 12
              ? `${tem} meses`
              : `${Math.floor(tem / 12)} ano(s) e ${tem % 12} mes(es)`,
      });
    }
  }

  if (vaga.cnh) {
    const tem = cv?.cnh ? categorias(cv.cnh) : null;
    criterios.push({
      nome: `CNH ${vaga.cnh}`,
      ok: tem === null ? (cv ? false : null) : [...categorias(vaga.cnh)].every((x) => tem.has(x)),
      detalhe: cv?.cnh ? `Tem CNH ${cv.cnh}` : cv ? "Sem CNH no currículo" : "Sem currículo",
    });
  }

  if (c.cidade) {
    criterios.push({
      nome: `Mora em ${vaga.cidade}`,
      ok: c.cidade === vaga.cidade,
      detalhe: c.cidade === vaga.cidade ? "Mesma cidade da vaga" : `Mora em ${c.cidade}`,
    });
  }

  let eliminado = false;
  for (const p of vaga.perguntas) {
    if (!p.esperada) continue;
    const resposta = c.respostas[p.id];
    const ok = resposta ? resposta === p.esperada : null;
    if (p.eliminatoria && ok === false) eliminado = true;
    criterios.push({
      nome: p.nome,
      ok,
      detalhe: resposta
        ? `Respondeu: ${textoDaResposta(p, resposta)}`
        : `Não respondeu (procura: ${textoDaResposta(p, p.esperada)})`,
      eliminatorio: p.eliminatoria,
    });
  }

  const conhecidos = criterios.filter((x) => x.ok !== null);
  const nota = eliminado
    ? 0
    : conhecidos.length
      ? Math.round((100 * conhecidos.filter((x) => x.ok).length) / conhecidos.length)
      : null;
  return { nota, eliminado, criterios };
}
