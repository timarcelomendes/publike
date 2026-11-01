// Automações por vaga e os números do processo (claude/plano-recursos-concorrentes.md, parte 6; migração
// 20270109120000).

export const ETAPAS_COM_MENSAGEM = {
  analise: "Em análise",
  entrevista: "Entrevista",
  contratado: "Contratados",
} as const;
export type EtapaComMensagem = keyof typeof ETAPAS_COM_MENSAGEM;

export type FeitoDaAutomacao = {
  perfil_id: string;
  nome: string;
  regra: "dispensar" | "mensagem" | "parado";
  detalhe: string;
  feito_em: string;
};

export type Automacoes = {
  dispensarEliminados: boolean;
  mensagens: Partial<Record<EtapaComMensagem, string>>;
  paradoDias: number | null;
  /** a vaga tem pergunta eliminatória (sem ela, a regra não tem o que fazer) */
  temEliminatoria: boolean;
  registro: FeitoDaAutomacao[];
};

export function lerAutomacoes(x: unknown): Automacoes {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const m = (o.mensagens && typeof o.mensagens === "object" ? o.mensagens : {}) as Record<string, unknown>;
  const mensagens: Automacoes["mensagens"] = {};
  for (const k of Object.keys(ETAPAS_COM_MENSAGEM) as EtapaComMensagem[])
    if (typeof m[k] === "string") mensagens[k] = m[k] as string;
  const dias = Number(o.parado_dias);
  return {
    dispensarEliminados: o.dispensar_eliminados === true,
    mensagens,
    paradoDias: Number.isInteger(dias) && dias >= 2 && dias <= 30 ? dias : null,
    temEliminatoria: o.tem_eliminatoria === true,
    registro: (Array.isArray(o.registro) ? o.registro : [])
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
      .filter((r) => r.regra === "dispensar" || r.regra === "mensagem" || r.regra === "parado")
      .map((r) => ({
        perfil_id: String(r.perfil_id),
        nome: String(r.nome ?? ""),
        regra: r.regra as FeitoDaAutomacao["regra"],
        detalhe: String(r.detalhe ?? ""),
        feito_em: String(r.feito_em),
      })),
  };
}

/** O que a regra fez, numa frase ("Dispensada pela pergunta eliminatória"). */
export function textoDoFeito(f: FeitoDaAutomacao) {
  if (f.regra === "dispensar") return "dispensado pela pergunta eliminatória, com o retorno";
  if (f.regra === "mensagem")
    return `recebeu a mensagem de ${ETAPAS_COM_MENSAGEM[f.detalhe as EtapaComMensagem] ?? "etapa"}`;
  return "entrou no lembrete de parados";
}

export const PERIODOS_NUMEROS = { "30": "Últimos 30 dias", "90": "Últimos 90 dias", tudo: "Desde o começo" } as const;
export type PeriodoNumeros = keyof typeof PERIODOS_NUMEROS;

export function diasDoPeriodo(p: string | undefined): { periodo: PeriodoNumeros; dias: number | null } {
  if (p === "30" || p === "90") return { periodo: p, dias: Number(p) };
  if (p === "tudo") return { periodo: "tudo", dias: null };
  return { periodo: "90", dias: 90 };
}

/** De onde veio a candidatura, em palavras. */
export function nomeDaOrigem(origem: string) {
  if (origem === "de_fora") return "Chamados por você (de fora do Publike)";
  if (origem === "convite") return "Convidados por você no Publike";
  if (origem === "direto") return "Acharam a vaga no Publike";
  const campanha = origem.startsWith("campanha:") ? origem.slice(9) : origem;
  if (campanha === "google") return "Anúncio no Google";
  if (["meta", "facebook", "instagram", "fb", "ig"].includes(campanha)) return "Instagram e Facebook";
  if (campanha === "whatsapp" || campanha === "wa") return "WhatsApp";
  return `Divulgação: ${campanha}`;
}

/** "3,5 h", "2 dias", "—". */
export function textoDoTempo(valor: number | null, unidade: "h" | "d") {
  if (valor == null) return "—";
  const n = Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (unidade === "h") return valor < 1 ? "menos de 1 h" : `${n} h`;
  return valor < 1 ? "menos de 1 dia" : Number(valor) === 1 ? "1 dia" : `${n} dias`;
}

/** "40%" de quem entrou na etapa anterior (nada quando a base é zero). */
export function taxa(parte: number, todo: number) {
  return todo > 0 ? `${Math.round((parte / todo) * 100)}%` : "";
}
