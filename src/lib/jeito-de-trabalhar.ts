// O jeito de trabalhar (migração 20270309120000; claude/plano-pedido-do-cliente-convites-e-testes.md, parte 6), no
// lugar de um teste comportamental: a pessoa conta do que gosta e o que prefere evitar (não é teste, não tem certo nem
// errado, tudo é opcional) e a vaga diz como é o dia a dia. No match, é um sinal: aparece, mas não muda a nota nem
// elimina ninguém. Os horários já estão na Disponibilidade do currículo. Vale no navegador e no servidor.

export const ITENS_DO_JEITO = [
  { id: "publico", vaga: "Atende o público", sim: "Gosto de atender o público", nao: "Prefiro não atender o público" },
  { id: "em_pe", vaga: "Fica em pé a maior parte do tempo", sim: "Topo trabalhar em pé", nao: "Prefiro trabalhar sentado" },
  { id: "peso", vaga: "Carrega peso", sim: "Topo carregar peso", nao: "Prefiro não carregar peso" },
  { id: "corrido", vaga: "Ritmo corrido", sim: "Gosto de ritmo corrido", nao: "Prefiro ritmo tranquilo" },
  { id: "equipe", vaga: "Trabalho em equipe", sim: "Gosto de trabalhar em equipe", nao: "Prefiro trabalhar sozinho" },
  { id: "rua", vaga: "Trabalho na rua (externo)", sim: "Topo trabalhar na rua", nao: "Prefiro um lugar fixo" },
  { id: "viagem", vaga: "Viaja a trabalho", sim: "Topo viajar a trabalho", nao: "Prefiro não viajar" },
] as const;

export type ItemDoJeito = (typeof ITENS_DO_JEITO)[number]["id"];
export const IDS_DO_JEITO = ITENS_DO_JEITO.map((i) => i.id) as ItemDoJeito[];

/** O que a pessoa marcou: "publico:sim", "peso:nao"... */
export type EscolhaDoJeito = `${ItemDoJeito}:${"sim" | "nao"}`;

export function lerJeito(lista: unknown): EscolhaDoJeito[] {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  return lista.filter((x): x is EscolhaDoJeito => {
    if (typeof x !== "string") return false;
    const [id, v] = x.split(":");
    if (!(IDS_DO_JEITO as string[]).includes(id) || (v !== "sim" && v !== "nao") || vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });
}

export function lerDiaADia(lista: unknown): ItemDoJeito[] {
  return Array.isArray(lista)
    ? [...new Set(lista.filter((x): x is ItemDoJeito => typeof x === "string" && (IDS_DO_JEITO as string[]).includes(x)))]
    : [];
}

/** As frases do que a pessoa marcou ("Gosto de atender o público", "Prefiro não carregar peso"). */
export function frasesDoJeito(jeito: string[] | null | undefined) {
  return lerJeito(jeito ?? []).map((e) => {
    const [id, v] = e.split(":");
    const item = ITENS_DO_JEITO.find((i) => i.id === id)!;
    return v === "sim" ? item.sim : item.nao;
  });
}

/**
 * O que combina e o que não combina entre o dia a dia da vaga e o jeito da pessoa (só os itens que os dois dizem), com
 * o nome do item da vaga ("Atende o público"). null: nada para comparar.
 */
export function compararJeito(diaADia: string[] | null | undefined, jeito: string[] | null | undefined) {
  const vaga = lerDiaADia(diaADia ?? []);
  const escolhas = new Map(lerJeito(jeito ?? []).map((e) => e.split(":") as [ItemDoJeito, "sim" | "nao"]));
  const combina: string[] = [];
  const naoCombina: string[] = [];
  for (const id of vaga) {
    const v = escolhas.get(id);
    if (!v) continue;
    const item = ITENS_DO_JEITO.find((i) => i.id === id)!;
    (v === "sim" ? combina : naoCombina).push(item.vaga);
  }
  return combina.length || naoCombina.length ? { combina, naoCombina } : null;
}
