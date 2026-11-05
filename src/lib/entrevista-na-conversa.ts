// A entrevista na conversa (claude/plano-entrevista-na-conversa.md; migração 20270206120000): a mensagem de
// "Entrevista marcada" (ou remarcada) e a de "Escolha o horário" trazem a entrevista, com a situação dela. O banco
// mantém a situação (a página da vaga, o cancelamento, "realizada" ou "faltou" também mudam a mensagem).

export type EstadoDaEntrevistaNaMensagem =
  | "aberta"
  | "confirmada"
  | "remarcar"
  | "escolhido"
  /** remarcada ou com outros horários: vale a mensagem mais nova */
  | "substituida"
  | "cancelada"
  /** realizada ou faltou */
  | "encerrada";

export type EntrevistaNaMensagem = {
  id: string;
  /** marcada: um horário; horarios: para o candidato escolher um */
  tipo: "marcada" | "horarios";
  quando: string | null;
  opcoes: string[];
  formato: string;
  local: string | null;
  obs: string | null;
  duracao: number;
  /** o título da vaga (para o evento da agenda) */
  vaga: string;
  estado: EstadoDaEntrevistaNaMensagem;
  /** o horário que o candidato escolheu (tipo horarios) */
  escolhido: string | null;
};

const ESTADOS: EstadoDaEntrevistaNaMensagem[] = [
  "aberta",
  "confirmada",
  "remarcar",
  "escolhido",
  "substituida",
  "cancelada",
  "encerrada",
];

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** A entrevista da mensagem (o jsonb do banco), ou null quando a mensagem não é de entrevista. */
export function lerEntrevistaDaMensagem(x: unknown): EntrevistaNaMensagem | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || (o.tipo !== "marcada" && o.tipo !== "horarios")) return null;
  const estado = ESTADOS.find((e) => e === o.estado) ?? "aberta";
  return {
    id: o.id,
    tipo: o.tipo,
    quando: texto(o.quando),
    opcoes: Array.isArray(o.opcoes) ? o.opcoes.filter((v): v is string => typeof v === "string") : [],
    formato: texto(o.formato) ?? "presencial",
    local: texto(o.local),
    obs: texto(o.obs),
    duracao: typeof o.duracao === "number" && o.duracao > 0 ? o.duracao : 30,
    vaga: texto(o.vaga) ?? "",
    estado,
    escolhido: texto(o.escolhido),
  };
}

/** O horário que vale para a agenda: o marcado ou o escolhido. */
export function horarioDaEntrevista(e: EntrevistaNaMensagem): string | null {
  return e.tipo === "horarios" ? e.escolhido : e.quando;
}
