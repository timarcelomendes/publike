// Os indicadores da Visão geral num lugar só (claude/plano-indicadores-do-admin.md): o nome, como medir a meta e o
// texto do e-mail de segunda. O Painel, o e-mail e o Resumo da IA usam os mesmos.

import { oQueMudou, type Periodo } from "./o-que-mudou";

export type ChaveDaMeta = "encontros" | "vagas_novas" | "vagas_3_48h" | "de_novo" | "ativos";

export const METAS: { chave: ChaveDaMeta; nome: string; porcento: boolean }[] = [
  { chave: "encontros", nome: "Encontros", porcento: false },
  { chave: "vagas_novas", nome: "Vagas novas", porcento: false },
  { chave: "vagas_3_48h", nome: "Vagas com 3+ candidatos em 48 h", porcento: true },
  { chave: "de_novo", nome: "Empresas que publicaram de novo", porcento: true },
  { chave: "ativos", nome: "Pessoas ativas", porcento: false },
];

export type Metas = Partial<Record<ChaveDaMeta, number>>;

const parte = (n: number, de: number) => (de > 0 ? Math.round((100 * n) / de) : null);

/** O valor do indicador no período (as porcentagens já em %; null sem base). */
export function valorDoIndicador(chave: ChaveDaMeta, p: Periodo): number | null {
  const n = (k: string) => Number(p[k] ?? 0) || 0;
  switch (chave) {
    case "encontros":
      return n("encontros");
    case "vagas_novas":
      return n("vagas_novas");
    case "ativos":
      return p.ativos == null ? null : n("ativos");
    case "vagas_3_48h":
      return parte(n("vagas_48h_3"), n("vagas_48h"));
    case "de_novo":
      return parte(n("de_novo"), n("de_novo_base"));
  }
}

/**
 * Onde o valor está em relação à meta. As contagens têm meta por semana: num período de 30 dias, a meta vale 30/7
 * semanas. `agora` é a parte da meta já feita (0 a 100+), para a barra.
 */
export function progressoDaMeta(chave: ChaveDaMeta, valor: number | null, meta: number, dias: number) {
  const def = METAS.find((m) => m.chave === chave)!;
  const alvo = def.porcento ? meta : Math.round((meta * dias) / 7);
  if (valor == null) return { alvo, agora: 0, texto: def.porcento ? `Meta ${meta}%` : `Meta ${meta} por semana` };
  const falta = alvo - valor;
  const texto = def.porcento
    ? `Meta ${meta}% · ${falta > 0 ? `faltam ${falta} ${falta === 1 ? "ponto" : "pontos"}` : "batida"}`
    : `Meta ${meta} por semana${dias !== 7 ? ` (${alvo} no período)` : ""} · ${falta > 0 ? `faltam ${falta}` : "batida"}`;
  return { alvo, agora: alvo > 0 ? Math.round((100 * valor) / alvo) : 0, texto, porcento: def.porcento };
}

const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export type NumerosParaOEmail = { de: string; ate: string; atual: Periodo; antes: Periodo; metas?: Metas | null };

/** Os textos do e-mail de segunda: o período, uma linha por número (com o de antes e a meta) e o que mudou. */
export function textoDosNumerosDaSemana(x: NumerosParaOEmail) {
  const linhas = METAS.map((m) => {
    const a = valorDoIndicador(m.chave, x.atual);
    const b = valorDoIndicador(m.chave, x.antes);
    const v = (n: number | null) => (n == null ? "—" : m.porcento ? `${n}%` : fmt(n));
    const meta = x.metas?.[m.chave];
    const p = meta ? progressoDaMeta(m.chave, a, meta, 7) : null;
    return `• ${m.nome}: ${v(a)} (antes: ${v(b)})${p ? ` · ${p.texto}` : ""}`;
  });
  linhas.push(
    `• Candidaturas: ${fmt(Number(x.atual.candidaturas ?? 0))} (antes: ${fmt(Number(x.antes.candidaturas ?? 0))})`,
    `• Contratações: ${fmt(Number(x.atual.contratacoes ?? 0))} (antes: ${fmt(Number(x.antes.contratacoes ?? 0))})`,
  );
  const mudou = oQueMudou(x.atual, x.antes);
  return {
    periodo: `${diaMes(x.de)} a ${diaMes(x.ate)}`,
    numeros: linhas.join("\n"),
    mudou: mudou.length
      ? `O que mais mudou:\n${mudou.map((m) => `• ${m.texto}`).join("\n")}`
      : "Nada mudou muito em relação à semana antes (ou os números ainda são pequenos para comparar).",
  };
}
