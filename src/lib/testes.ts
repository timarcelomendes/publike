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

/** Os testes da Publike (os ids fixos da migração 20261204120000), pela área. */
export const TESTES_DA_PUBLIKE = {
  caixa: "a7a10000-0000-4000-8000-000000000001",
  atendimento: "a7a10000-0000-4000-8000-000000000002",
  vendas: "a7a10000-0000-4000-8000-000000000003",
  cozinha: "a7a10000-0000-4000-8000-000000000004",
  estoque: "a7a10000-0000-4000-8000-000000000005",
  administrativo: "a7a10000-0000-4000-8000-000000000006",
  informatica: "a7a10000-0000-4000-8000-000000000007",
  portugues: "a7a10000-0000-4000-8000-000000000008",
  situacoes: "a7a10000-0000-4000-8000-000000000009",
} as const;
export type AreaDoTeste = keyof typeof TESTES_DA_PUBLIKE;

// pelo título da vaga, o primeiro que bater ("Atendente de caixa" é Caixa); o texto vem sem acento e entre espaços
const PELO_TITULO: [AreaDoTeste, RegExp][] = [
  ["caixa", / caixa /],
  [
    "cozinha",
    / (cozinh|chapeir|pizzaiol|confeit|padeir|salgadeir|churrasqueir|sushiman|copeir|merendeir|doceir|masseir|forneir|acougueir)/,
  ],
  [
    "estoque",
    / (repositor|estoquist|estoque|almoxarif|conferent|separador|expedicao|armazem|deposito|empilhadeir|carga e descarga|ajudante de carga)/,
  ],
  ["vendas", / (vendedor|vendas|consultor[a]? (comercial|de vendas)|representante comercial|promotor|televendas)/],
  [
    "atendimento",
    / (atendent|atendimento|recepcion|garcom|garconete|balconist|barista|cumim|hostess|telefonist|telemarketing|call center|sac )/,
  ],
  [
    "administrativo",
    / (administrativ|escritorio|secretari|faturamento|financeir|contas a (pagar|receber)|departamento pessoal|recursos humanos|rh |contabil|fiscal|comprador)/,
  ],
  ["informatica", / (digitador|informatica|suporte tecnico|help ?desk)/],
];

// sem nada no título, pela área da vaga; nas outras áreas, as situações de trabalho (servem para qualquer função)
const PELA_AREA: Record<string, AreaDoTeste> = {
  comercio: "atendimento",
  alimentacao: "cozinha",
  administrativo: "administrativo",
  financeiro: "administrativo",
  tecnologia: "informatica",
};

function semAcento(t: string) {
  return ` ${t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/** O teste da Publike que combina com a vaga, que entra nela ao publicar (grátis e opcional para o candidato). */
export function testeSugerido(titulo: string, categoria: string | null | undefined): AreaDoTeste {
  const t = semAcento(titulo);
  for (const [area, re] of PELO_TITULO) if (re.test(t)) return area;
  return (categoria && PELA_AREA[categoria]) || "situacoes";
}

/** "Teste Prático: Caixa" → "Caixa" (o nome do teste da Publike sem a marca, para listas curtas). */
export function nomeCurtoDoTeste(titulo: string) {
  return titulo.replace(/^Teste [pP]rático( Publike)?: /, "");
}

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
