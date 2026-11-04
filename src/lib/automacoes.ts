// Automações por vaga e os números do processo (claude/plano-recursos-concorrentes.md, parte 6; migrações
// 20270109120000, 20270111120000 e 20270114120000).

import type { FormatoEntrevista } from "./recrutamento";

export const ETAPAS_COM_MENSAGEM = {
  analise: "Em análise",
  entrevista: "Entrevista",
  contratado: "Contratados",
} as const;
export type EtapaComMensagem = keyof typeof ETAPAS_COM_MENSAGEM;

export type RegraFeita =
  | "dispensar"
  | "mensagem"
  | "parado"
  | "recado"
  | "triagem"
  | "encerrar"
  | "preenchida"
  | "horarios"
  | "completa"
  | "perguntas";
const REGRAS_FEITAS: RegraFeita[] = [
  "dispensar",
  "mensagem",
  "parado",
  "recado",
  "triagem",
  "encerrar",
  "preenchida",
  "horarios",
  "completa",
  "perguntas",
];

export type FeitoDaAutomacao = {
  perfil_id: string;
  nome: string;
  regra: RegraFeita;
  detalhe: string;
  feito_em: string;
};

export type HorariosAutomaticos = { formato: FormatoEntrevista; local: string | null; duracao: number };

/** O que a empresa liga e desliga (e manda para salvar). */
export type RegrasDaVaga = {
  dispensarEliminados: boolean;
  /** a etapa (`analise`, `entrevista`, `contratado` ou `sub:<id>` de uma etapa própria) e o id da mensagem pronta */
  mensagens: Record<string, string>;
  paradoDias: number | null;
  /** o recado de recebimento (null: desligado) */
  recado: string | null;
  triagemParaAnalise: boolean;
  /** o retorno a quem ficou em Novos sem resposta há N dias (null: desligado) */
  encerrarDias: number | null;
  encerrarAoPreencher: boolean;
  /** marcar a vaga como preenchida quando os contratados chegam ao "Quantas pessoas" */
  preencherAoCompletar: boolean;
  horarios: HorariosAutomaticos | null;
  /** o "Pedir a todo novo candidato" da Entrevista em vídeo */
  videoATodos: boolean;
  /** no match, o chat pergunta o que a vaga precisa (ligada por padrão; claude/plano-match-no-chat.md) */
  perguntarNoMatch: boolean;
};

export type Automacoes = RegrasDaVaga & {
  /** a vaga tem pergunta eliminatória (sem ela, a regra não tem o que fazer) */
  temEliminatoria: boolean;
  triagem: { liberada: boolean; obrigatorios: number };
  video: { liberado: boolean; perguntas: number };
  /** quantos testes a vaga pede a quem se candidata */
  testes: number;
  /** o retorno da conta está ligado (sem ele, quem é dispensado não recebe aviso) */
  retornoLigado: boolean;
  /** a conta tem horários livres cadastrados */
  temHorarios: boolean;
  /** a conta tem as Automações personalizadas (o texto, os prazos, as regras com condição, copiar) */
  sobMedida: boolean;
  /** as vagas novas usam as regras desta vaga (origem) ou de outra */
  padrao: { origem: string | null; titulo: string | null } | null;
  outrasNoAr: number;
  /** quantas vezes cada regra agiu nesta vaga */
  contagem: Partial<Record<RegraFeita, number>>;
  registro: FeitoDaAutomacao[];
};

/** O recado que vem escrito ao ligar "Confirmar que a candidatura chegou". */
export const RECADO_PADRAO =
  "Oi, {nome}! Aqui é {empresa}: recebemos a sua candidatura para {vaga}. Vamos olhar com atenção e responder em até 5 dias.";

/** O lembrete e o retorno das automações prontas (outros prazos são das Automações personalizadas). */
export const PARADO_PRONTO = 5;
export const ENCERRAR_PRONTO = 7;

/** O que só as Automações personalizadas fazem (o banco confere igual em `aplicar_automacoes`): null se cabe nas prontas. */
export function precisaDoSobMedida(r: RegrasDaVaga, antes: RegrasDaVaga): string | null {
  if (Object.keys(r.mensagens).length && JSON.stringify(r.mensagens) !== JSON.stringify(antes.mensagens))
    return "a mensagem pronta por etapa";
  if (r.dispensarEliminados && !antes.dispensarEliminados) return "dispensar pela pergunta eliminatória";
  if (r.triagemParaAnalise && !antes.triagemParaAnalise) return "a Triagem com IA mandar para Em análise";
  if (r.recado !== null && r.recado.trim() !== RECADO_PADRAO && r.recado !== antes.recado) return "o texto do recado";
  if (r.paradoDias !== null && r.paradoDias !== PARADO_PRONTO && r.paradoDias !== antes.paradoDias)
    return "o prazo do lembrete";
  if (r.encerrarDias !== null && r.encerrarDias !== ENCERRAR_PRONTO && r.encerrarDias !== antes.encerrarDias)
    return "o prazo do retorno";
  return null;
}

export const FORMATOS_AUTOMATICOS: FormatoEntrevista[] = ["presencial", "telefone", "video", "publike"];

const numero = (x: unknown, min: number, max: number) => {
  const n = Number(x);
  return x !== null && x !== undefined && x !== "" && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

export function lerAutomacoes(x: unknown): Automacoes {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const m = (o.mensagens && typeof o.mensagens === "object" ? o.mensagens : {}) as Record<string, unknown>;
  const mensagens: Record<string, string> = {};
  for (const [k, v] of Object.entries(m)) if (typeof v === "string" && v) mensagens[k] = v;
  const h = (o.horarios && typeof o.horarios === "object" ? o.horarios : null) as Record<string, unknown> | null;
  const formato =
    h && FORMATOS_AUTOMATICOS.includes(h.formato as FormatoEntrevista) ? (h.formato as FormatoEntrevista) : null;
  const t = (o.triagem && typeof o.triagem === "object" ? o.triagem : {}) as Record<string, unknown>;
  const v = (o.video && typeof o.video === "object" ? o.video : {}) as Record<string, unknown>;
  const p = (o.padrao && typeof o.padrao === "object" ? o.padrao : null) as Record<string, unknown> | null;
  const c = (o.contagem && typeof o.contagem === "object" ? o.contagem : {}) as Record<string, unknown>;
  const contagem: Automacoes["contagem"] = {};
  for (const r of REGRAS_FEITAS) if (Number(c[r]) > 0) contagem[r] = Number(c[r]);
  return {
    dispensarEliminados: o.dispensar_eliminados === true,
    mensagens,
    paradoDias: numero(o.parado_dias, 2, 30),
    recado: typeof o.recado === "string" && o.recado.trim() ? o.recado : null,
    triagemParaAnalise: o.triagem_para_analise === true,
    encerrarDias: numero(o.encerrar_dias, 3, 60),
    encerrarAoPreencher: o.encerrar_ao_preencher === true,
    preencherAoCompletar: o.preencher_ao_completar === true,
    horarios:
      h && formato
        ? {
            formato,
            local: typeof h.local === "string" && h.local ? h.local : null,
            duracao: numero(h.duracao, 15, 180) ?? 30,
          }
        : null,
    videoATodos: v.a_todos === true,
    perguntarNoMatch: o.perguntar_no_match !== false,
    temEliminatoria: o.tem_eliminatoria === true,
    triagem: { liberada: t.liberada === true, obrigatorios: Number(t.obrigatorios) || 0 },
    video: { liberado: v.liberado === true, perguntas: Number(v.perguntas) || 0 },
    testes: Number(o.testes) || 0,
    retornoLigado: o.retorno_ligado !== false,
    temHorarios: o.tem_horarios === true,
    sobMedida: o.sob_medida === true,
    padrao: p
      ? {
          origem: typeof p.origem === "string" ? p.origem : null,
          titulo: typeof p.titulo === "string" ? p.titulo : null,
        }
      : null,
    outrasNoAr: Number(o.outras_no_ar) || 0,
    contagem,
    registro: (Array.isArray(o.registro) ? o.registro : [])
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
      .filter((r) => REGRAS_FEITAS.includes(r.regra as RegraFeita))
      .map((r) => ({
        perfil_id: String(r.perfil_id),
        nome: String(r.nome ?? ""),
        regra: r.regra as RegraFeita,
        detalhe: String(r.detalhe ?? ""),
        feito_em: String(r.feito_em),
      })),
  };
}

/** O nome de uma etapa com mensagem: as de hoje e as próprias da conta (`sub:<id>`). */
export function nomeDaEtapaComMensagem(chave: string, proprias: Map<string, string>) {
  return ETAPAS_COM_MENSAGEM[chave as EtapaComMensagem] ?? proprias.get(chave) ?? "uma etapa";
}

/** O que a regra fez, numa frase ("dispensado pela pergunta eliminatória"). */
export function textoDoFeito(f: FeitoDaAutomacao, proprias: Map<string, string> = new Map()) {
  switch (f.regra) {
    case "dispensar":
      return "foi dispensado pela pergunta eliminatória e recebeu o retorno";
    case "mensagem":
      return `recebeu a mensagem de ${nomeDaEtapaComMensagem(f.detalhe, proprias)}`;
    case "parado":
      return "entrou no lembrete de parados";
    case "recado":
      return "recebeu o recado de que a candidatura chegou";
    case "triagem":
      return "foi para Em análise pela Triagem com IA";
    case "encerrar":
      return "ficou sem resposta em Novos e recebeu o retorno";
    case "preenchida":
      return "saiu do processo quando a vaga foi preenchida";
    case "horarios":
      return "recebeu os seus horários livres para escolher";
    case "completa":
      return "foi contratado e completou a vaga: ela foi marcada como preenchida";
    case "perguntas":
      return f.detalhe === "retomada"
        ? "recebeu no chat as perguntas da vaga, pelo aviso dos matches sem contato"
        : "recebeu no chat as perguntas da vaga, no match";
  }
}

/** O recado como a pessoa recebe (o mesmo que o banco monta). */
export function montarRecado(texto: string, d: { nome: string; vaga: string; empresa: string }) {
  return texto
    .replaceAll("{nome}", d.nome.split(" ")[0] || d.nome)
    .replaceAll("{vaga}", d.vaga)
    .replaceAll("{empresa}", d.empresa)
    .slice(0, 300);
}

/** O que falta para salvar (o banco recusaria): o texto do aviso, ou null. */
export function faltaParaSalvar(r: RegrasDaVaga): string | null {
  if (r.recado !== null && r.recado.trim().length < 10) return "Escreva o recado (pelo menos 10 letras).";
  if (r.horarios?.formato === "presencial" && !r.horarios.local?.trim())
    return "Escreva o endereço da entrevista presencial.";
  if (r.horarios?.formato === "video" && !/^https:\/\//i.test(r.horarios.local?.trim() ?? ""))
    return "Cole o link da chamada (começa com https://).";
  return null;
}

/** Quantas das automações prontas estão ligadas. */
export function regrasLigadas(r: RegrasDaVaga) {
  return [
    r.recado !== null,
    r.horarios !== null,
    r.paradoDias !== null,
    r.encerrarDias !== null,
    r.preencherAoCompletar,
    r.perguntarNoMatch,
  ].filter(Boolean).length;
}
/**
 * As 6 automações prontas e grátis (decisão do Marcelo, 01/11/2026; a de perguntar no match, 04/11/2026); o resto
 * são as regras personalizadas.
 */
export const TOTAL_DE_REGRAS = 6;

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
  if (unidade === "h") {
    if (valor < 1) return "menos de 1 h";
    // de 2 dias para cima, em dias ("97,2 h" vira "4 dias")
    if (valor >= 48) return `${Math.round(valor / 24)} dias`;
    return `${Math.round(valor)} h`;
  }
  return valor < 1 ? "menos de 1 dia" : Number(valor) === 1 ? "1 dia" : `${n} dias`;
}

/** "40%" de quem entrou na etapa anterior (nada quando a base é zero). */
export function taxa(parte: number, todo: number) {
  return todo > 0 ? `${Math.round((parte / todo) * 100)}%` : "";
}
