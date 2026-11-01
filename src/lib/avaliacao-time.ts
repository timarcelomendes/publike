// Avaliação e decisão em time (claude/plano-recursos-concorrentes.md, parte 4; migração 20270107120000): a ficha
// de competências da vaga, a nota de 1 a 5 de cada pessoa da equipe (e do gestor, pelo link dos finalistas) e a
// recomendação. Cada um só vê as notas dos outros depois de dar a sua.

export const MAX_COMPETENCIAS = 8;

export type Recomendacao = "seguir" | "talvez" | "nao_seguir";

export const RECOMENDACOES: Record<Recomendacao, { nome: string; tom: "match" | "aviso" | "contorno" }> = {
  seguir: { nome: "Seguir", tom: "match" },
  talvez: { nome: "Talvez", tom: "aviso" },
  nao_seguir: { nome: "Não seguir", tom: "contorno" },
};

export function ehRecomendacao(x: unknown): x is Recomendacao {
  return x === "seguir" || x === "talvez" || x === "nao_seguir";
}

export type Competencia = { id: string; nome: string };

export type AvaliacaoDeAlguem = {
  quem: string;
  minha: boolean;
  pelo_link: boolean;
  notas: Record<string, number>;
  recomendacao: Recomendacao;
  comentario: string | null;
  quando: string;
};

export type AvaliacoesDoCandidato = { total: number; avaliei: boolean; avaliacoes: AvaliacaoDeAlguem[] };

/** No quadro: quantos avaliaram e, quando eu já avaliei, a média e as recomendações. */
export type AvaliacaoNoQuadro = {
  total: number;
  avaliei: boolean;
  media: number | null;
  seguir: number | null;
  talvez: number | null;
  nao_seguir: number | null;
};

const GERAIS = ["Experiência na função", "Comunicação", "Pontualidade e disponibilidade", "Vontade de aprender"];
const POR_AREA: [RegExp, string[]][] = [
  [/atend|recep|caixa|vend|loja|balc/i, ["Atendimento ao cliente", "Organização no caixa"]],
  [/cozinh|chapa|lanch|restaur|garç|garc|padar|confeit/i, ["Higiene e cuidado com os alimentos", "Agilidade"]],
  [/estoq|logíst|logist|almox|carga|motorista|entreg/i, ["Organização", "Cuidado com a mercadoria"]],
  [/limpez|serviços gerais|servicos gerais|zelad|portar/i, ["Capricho", "Cuidado com o material"]],
  [/administ|escrit|assistente|financ|contáb|contab/i, ["Computador e planilhas", "Organização"]],
];

/** As competências para começar a ficha: as da área (pelo título) e as gerais, até 5. */
export function sugestoesDeCompetencias(titulo: string): string[] {
  const daArea = POR_AREA.find(([re]) => re.test(titulo))?.[1] ?? [];
  return [...new Set([...daArea, ...GERAIS])].slice(0, 5);
}

/** A média das notas de uma avaliação (null: sem notas). */
export function mediaDasNotas(notas: Record<string, number>): number | null {
  const v = Object.values(notas).filter((n) => typeof n === "number");
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

export function textoDaMedia(n: number | null) {
  return n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function lerCompetencias(x: unknown): Competencia[] {
  return (Array.isArray(x) ? x : [])
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
    .map((c) => ({ id: String(c.id), nome: String(c.nome) }))
    .filter((c) => /^c[1-8]$/.test(c.id) && c.nome);
}

export function lerAvaliacoesDoCandidato(x: unknown): AvaliacoesDoCandidato | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const lista = (Array.isArray(o.avaliacoes) ? o.avaliacoes : []) as Record<string, unknown>[];
  return {
    total: Number(o.total) || 0,
    avaliei: o.avaliei === true,
    avaliacoes: lista.map((a) => ({
      quem: String(a.quem ?? "Alguém da equipe"),
      minha: a.minha === true,
      pelo_link: a.pelo_link === true,
      notas: (a.notas && typeof a.notas === "object" ? a.notas : {}) as Record<string, number>,
      recomendacao: ehRecomendacao(a.recomendacao) ? a.recomendacao : "talvez",
      comentario: typeof a.comentario === "string" ? a.comentario : null,
      quando: String(a.quando ?? ""),
    })),
  };
}
