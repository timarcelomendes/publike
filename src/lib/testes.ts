// Teste Prático (migração 20261204120000): o teste prático da função e as situações de trabalho que a
// empresa ou agência põe na vaga, e os testes da casa. Não é teste psicológico. Vale no navegador e no servidor.

export type TipoTeste = "pratico" | "situacoes";
export type OpcaoTeste = { id: string; texto: string; pontos: number };
export type QuestaoTeste = { id: string; enunciado: string; competencia?: string | null; opcoes: OpcaoTeste[] };

export const COMPETENCIAS: Record<string, string> = {
  atendimento: "Atendimento",
  equipe: "Trabalho em equipe",
  responsabilidade: "Responsabilidade",
  problemas: "Resolver problemas",
  etica: "Ética",
};

export const MAX_TESTES_NA_VAGA = 3;
export const MAX_QUESTOES = 20;

export const NAO_E_PSICOLOGICO =
  "Não é teste psicológico: mede o conhecimento da função e como a pessoa age em situações de trabalho. Ninguém é recusado pelo teste: o resultado ajuda quem decide.";

/** Como o resultado aparece: sem palavra que julgue a pessoa. */
export function faixaDoResultado(pontos: number, maximo: number) {
  const p = maximo > 0 ? pontos / maximo : 0;
  return p >= 0.8 ? "forte" : p >= 0.5 ? "bom" : "conversar na entrevista";
}

export function textoDoResultado(tipo: string, pontos: number | null, maximo: number | null) {
  if (pontos == null || !maximo) return "";
  return tipo === "pratico" ? `${pontos} de ${maximo} acertos` : `${Math.round((100 * pontos) / maximo)}%`;
}

/** As competências das situações de trabalho, na ordem da lista. */
export function competenciasDoResultado(v: unknown) {
  const o = (v ?? {}) as Record<string, { pontos?: number; maximo?: number }>;
  return Object.keys(COMPETENCIAS)
    .filter((c) => o[c]?.maximo)
    .map((c) => ({ id: c, nome: COMPETENCIAS[c], pontos: o[c].pontos ?? 0, maximo: o[c].maximo ?? 0 }));
}

/** As questões que vieram do banco (jsonb). */
export function questoesDoBanco(v: unknown): QuestaoTeste[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((q) => {
    const o = (q ?? {}) as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.enunciado !== "string" || !Array.isArray(o.opcoes)) return [];
    return [
      {
        id: o.id,
        enunciado: o.enunciado,
        competencia: typeof o.competencia === "string" ? o.competencia : null,
        opcoes: o.opcoes.flatMap((x) => {
          const k = (x ?? {}) as Record<string, unknown>;
          return typeof k.id === "string" && typeof k.texto === "string"
            ? [{ id: k.id, texto: k.texto, pontos: typeof k.pontos === "number" ? k.pontos : 0 }]
            : [];
        }),
      },
    ];
  });
}
