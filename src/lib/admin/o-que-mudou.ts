// "O que mudou" (claude/plano-indicadores-do-admin.md, parte 5): até 3 linhas com as maiores mudanças do período contra
// o anterior, por regras simples, sem IA. Função pura: o Painel e o e-mail de segunda usam a mesma.
// Sem importações do site, para dar para testar com o node direto.

/** Os números de um período (o mesmo formato de admin_indicadores). */
export type Periodo = Record<string, number | null | undefined>;

export type Mudanca = { chave: string; texto: string; sentido: "sobe" | "desce" };

/** Contagem: menos que isso nos dois períodos não entra. */
export const MINIMO = 10;
/** A mudança precisa passar disso (em %, nas contagens; em pontos, nas porcentagens). */
export const LIMITE_PORCENTO = 15;
export const LIMITE_PONTOS = 5;

const CONTAGENS: { chave: string; nome: string }[] = [
  { chave: "visitantes", nome: "Visitantes" },
  { chave: "contas_novas", nome: "Contas novas" },
  { chave: "candidaturas", nome: "Candidaturas" },
  { chave: "encontros", nome: "Encontros" },
  { chave: "vagas_novas", nome: "Vagas novas" },
  { chave: "ativos", nome: "Pessoas ativas" },
  { chave: "contratacoes", nome: "Contratações" },
];

const PARTES: { chave: string; nome: string; n: string; de: string }[] = [
  { chave: "vagas_3_48h", nome: "Vagas com 3+ candidatos em 48 h", n: "vagas_48h_3", de: "vagas_48h" },
  {
    chave: "respondidas",
    nome: "Candidaturas respondidas por alguém",
    n: "respondidas_gente",
    de: "candidaturas",
  },
];

const num = (p: Periodo, k: string) => Number(p[k] ?? 0) || 0;
const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

export function oQueMudou(atual: Periodo, antes: Periodo, maximo = 3): Mudanca[] {
  const candidatos: (Mudanca & { tamanho: number })[] = [];
  for (const c of CONTAGENS) {
    if (atual[c.chave] == null || antes[c.chave] == null) continue;
    const a = num(atual, c.chave);
    const b = num(antes, c.chave);
    if (a < MINIMO || b < MINIMO) continue;
    const v = Math.round(((a - b) / b) * 100);
    if (Math.abs(v) < LIMITE_PORCENTO) continue;
    candidatos.push({
      chave: c.chave,
      sentido: v > 0 ? "sobe" : "desce",
      texto: `${c.nome}: ${fmt(a)}, ${Math.abs(v)}% a ${v > 0 ? "mais" : "menos"} que o período anterior (eram ${fmt(b)}).`,
      tamanho: Math.abs(v),
    });
  }
  for (const p of PARTES) {
    const da = num(atual, p.de);
    const db = num(antes, p.de);
    if (da < MINIMO || db < MINIMO) continue;
    const a = Math.round((100 * num(atual, p.n)) / da);
    const b = Math.round((100 * num(antes, p.n)) / db);
    const v = a - b;
    if (Math.abs(v) < LIMITE_PONTOS) continue;
    candidatos.push({
      chave: p.chave,
      sentido: v > 0 ? "sobe" : "desce",
      texto: `${p.nome}: ${a}%, ${Math.abs(v)} ${Math.abs(v) === 1 ? "ponto" : "pontos"} a ${v > 0 ? "mais" : "menos"} (eram ${b}%).`,
      // um ponto vale como 3% numa contagem, para as duas réguas competirem
      tamanho: Math.abs(v) * 3,
    });
  }
  return candidatos
    .sort((x, y) => y.tamanho - x.tamanho)
    .slice(0, maximo)
    .map(({ chave, texto, sentido }) => ({ chave, texto, sentido }));
}
