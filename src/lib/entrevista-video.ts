// Entrevista gravada com IA (claude/plano-recursos-concorrentes.md, parte 2; migração 20270105120000): a empresa
// monta de 2 a 6 perguntas na vaga, o candidato grava pelo celular e a IA transcreve e resume. Peças usadas no
// navegador e no servidor.

export const MIN_PERGUNTAS = 2;
export const MAX_PERGUNTAS = 6;
/** Quanto tempo a pessoa tem para cada resposta. */
export const TEMPOS_RESPOSTA = [30, 60, 90, 120, 180] as const;
/** Dias para responder depois do pedido (o padrão) e os prazos que a vaga pode escolher (migração 20270225120000). */
export const DIAS_PARA_RESPONDER = 5;
export const PRAZOS_PARA_RESPONDER = [2, 3, 5, 7, 10] as const;
/** O bucket privado dos vídeos. */
export const BUCKET_VIDEO = "entrevistas-video";
/** Uns 4 MB por minuto: cabe na transcrição (até 25 MB) mesmo na resposta de 3 minutos. */
export const BITS_VIDEO = 450_000;
export const BITS_AUDIO = 64_000;

export type SituacaoVideo = "pedida" | "respondendo" | "enviada" | "vencida" | "apagada" | "cancelada";

export const SITUACOES_VIDEO: Record<SituacaoVideo, { nome: string; tom: "aviso" | "match" | "contorno" | "perigo" }> =
  {
    pedida: { nome: "Vídeo pedido", tom: "aviso" },
    respondendo: { nome: "Vídeo: respondendo", tom: "aviso" },
    enviada: { nome: "Vídeo: enviou", tom: "match" },
    vencida: { nome: "Vídeo: não respondeu", tom: "contorno" },
    apagada: { nome: "Vídeo apagado pela pessoa", tom: "contorno" },
    // quem contrata cancelou o pedido (migração 20270414120000)
    cancelada: { nome: "Vídeo cancelado", tom: "contorno" },
  };

export type ConfigVideo = {
  perguntas: { id: string; texto: string }[];
  segundos: number;
  segunda_chance: boolean;
  aceita_texto: boolean;
  pedir_a_todos: boolean;
  /** os dias para gravar depois do pedido */
  dias: number;
  /** vaga exclusiva para PCD: a resposta por texto fica sempre ligada */
  pcd: boolean;
  liberado: boolean;
};

/** A entrevista de um candidato, como o quadro vê (sem os arquivos). */
export type VideoNoQuadro = {
  id: string;
  situacao: SituacaoVideo;
  pedida_em: string;
  prazo: string;
  enviada_em: string | null;
  resumo: ResumoVideo | null;
  videos_apagados: boolean;
  /** quando quem contrata cancelou o pedido (migração 20270414120000) */
  cancelada_em: string | null;
};

export type ResumoVideo = { resumo: string; fortes: string[]; conferir: string[] };

/** Uma resposta para assistir: o link do vídeo vem pronto do servidor (vale poucos minutos). */
export type RespostaParaAssistir = {
  pergunta_id: string;
  pergunta: string;
  tipo: "video" | "texto" | null;
  url: string | null;
  duracao: number | null;
  texto: string | null;
  transcricao: string | null;
};

export type EntrevistaParaAssistir = {
  id: string;
  situacao: SituacaoVideo;
  enviada_em: string | null;
  resumo: ResumoVideo | null;
  /** os vídeos ainda podem ser vistos (antes dos 6 meses) */
  videos: boolean;
  vence_em: string;
  respostas: RespostaParaAssistir[];
};

/** O que o candidato vê da própria entrevista (`video_minha`). */
export type MinhaEntrevistaVideo = {
  id: string;
  vaga: string;
  empresa: string;
  situacao: SituacaoVideo;
  prazo: string;
  segundos: number;
  segunda_chance: boolean;
  aceita_texto: boolean;
  enviada_em: string | null;
  perguntas: {
    id: string;
    ordem: number;
    /** só depois de vista */
    texto: string | null;
    vista: boolean;
    tipo: "video" | "texto" | null;
    tentativas: number;
    caminho: string | null;
    duracao: number | null;
    resposta_texto: string | null;
    respondida: boolean;
  }[];
};

/** Perguntas para começar: as de todo processo e as da área da vaga. */
const GERAIS = [
  "Conte um pouco sobre você e sobre o seu último trabalho.",
  "Por que você quer trabalhar nesta vaga?",
  "Conte uma situação difícil no trabalho e como você resolveu.",
  "Qual horário e quais dias você pode trabalhar? Como você chega até aqui?",
];
const POR_AREA: [RegExp, string[]][] = [
  [
    /atend|recep|caixa|vend|loja|balc/i,
    [
      "Um cliente chegou irritado reclamando de um produto. O que você faz?",
      "Como você faz para vender mais sem forçar o cliente?",
    ],
  ],
  [
    /cozinh|chapa|lanch|restaur|garç|garc|padar|confeit/i,
    [
      "Conte como você organiza a cozinha num horário de muito movimento.",
      "Que cuidados de higiene você toma com os alimentos?",
    ],
  ],
  [
    /estoq|logíst|logist|almox|carga|motorista|entreg/i,
    [
      "Como você confere uma mercadoria que chegou?",
      "Conte como você organiza o trabalho para não atrasar uma entrega.",
    ],
  ],
  [
    /limpez|serviços gerais|servicos gerais|zelad|portar/i,
    ["Como você organiza a limpeza de um lugar grande no seu turno?", "O que você faz quando falta material?"],
  ],
  [
    /administ|auxiliar de escrit|assistente|financ|contáb|contab/i,
    [
      "Que programas você usa no computador e para quê?",
      "Conte como você organiza as tarefas quando tem muita coisa para entregar.",
    ],
  ],
];

/** As sugestões para a vaga: as da área (pelo título) primeiro, depois as gerais, sem repetir. */
export function sugestoesDePerguntas(titulo: string): string[] {
  const daArea = POR_AREA.find(([re]) => re.test(titulo))?.[1] ?? [];
  return [...new Set([...daArea, ...GERAIS])];
}

/** "1 min 30 s" a partir dos segundos. */
export function textoDoTempo(segundos: number) {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  if (!m) return `${s} s`;
  return s ? `${m} min ${s} s` : `${m} min`;
}

/** O tipo do arquivo que o navegador grava (Chrome e Android: webm; iPhone: mp4). */
export function formatoDeGravacao(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const opcoes = [
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
    { mime: "video/mp4;codecs=avc1,mp4a", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
  ];
  return opcoes.find((o) => MediaRecorder.isTypeSupported(o.mime)) ?? null;
}

export function lerResumoVideo(x: unknown): ResumoVideo | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((i): i is string => typeof i === "string") : []);
  return typeof o.resumo === "string"
    ? { resumo: o.resumo, fortes: lista(o.fortes), conferir: lista(o.conferir) }
    : null;
}
