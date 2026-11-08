// O processo da conta e o padrão das vagas novas (claude/plano-etapas-obrigatorias-e-configuracoes.md; migração
// 20270315120000). Tudo desligado no padrão: o jeito "Simples" é o Publike de sempre.

export type MotivoAoTirar = "nao" | "opcional" | "obrigatorio";
export type JeitoDoProcesso = "simples" | "entrevista" | "completo" | "proprio";

export type Processo = {
  jeito: JeitoDoProcesso;
  entrevista_para_contratar: boolean;
  proposta_para_contratar: boolean;
  teste_antes_da_entrevista: boolean;
  motivo_ao_tirar: MotivoAoTirar;
  ok_do_cliente: boolean;
};

export type ProcessoDaConta = Processo & { administra: boolean };

export const PROCESSO_SIMPLES: Processo = {
  jeito: "simples",
  entrevista_para_contratar: false,
  proposta_para_contratar: false,
  teste_antes_da_entrevista: false,
  motivo_ao_tirar: "nao",
  ok_do_cliente: false,
};

/** Os três jeitos prontos. Escolher um liga as regras dele; mudar uma regra depois vira "do seu jeito". */
export const JEITOS: { valor: Exclude<JeitoDoProcesso, "proprio">; nome: string; texto: string; regras: Processo }[] = [
  {
    valor: "simples",
    nome: "Simples",
    texto: "Nada obrigatório. Você decide na hora, como hoje.",
    regras: PROCESSO_SIMPLES,
  },
  {
    valor: "entrevista",
    nome: "Com entrevista",
    texto: "Só contrata quem passou pela entrevista, e você pode dizer por que alguém saiu.",
    regras: { ...PROCESSO_SIMPLES, jeito: "entrevista", entrevista_para_contratar: true, motivo_ao_tirar: "opcional" },
  },
  {
    valor: "completo",
    nome: "Completo",
    texto: "Entrevista e proposta aceita para contratar, e o teste da vaga antes da entrevista.",
    regras: {
      ...PROCESSO_SIMPLES,
      jeito: "completo",
      entrevista_para_contratar: true,
      proposta_para_contratar: true,
      teste_antes_da_entrevista: true,
      motivo_ao_tirar: "opcional",
    },
  },
];

/** O jeito que bate com as regras (senão, "do seu jeito"). */
export function jeitoDasRegras(p: Processo): JeitoDoProcesso {
  const iguais = (a: Processo, b: Processo) =>
    a.entrevista_para_contratar === b.entrevista_para_contratar &&
    a.proposta_para_contratar === b.proposta_para_contratar &&
    a.teste_antes_da_entrevista === b.teste_antes_da_entrevista &&
    a.motivo_ao_tirar === b.motivo_ao_tirar &&
    !a.ok_do_cliente;
  return JEITOS.find((j) => iguais(p, j.regras))?.valor ?? "proprio";
}

export function lerProcesso(x: unknown): ProcessoDaConta | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const motivo = o.motivo_ao_tirar;
  const jeito = o.jeito;
  return {
    jeito: jeito === "entrevista" || jeito === "completo" || jeito === "proprio" ? jeito : "simples",
    entrevista_para_contratar: o.entrevista_para_contratar === true,
    proposta_para_contratar: o.proposta_para_contratar === true,
    teste_antes_da_entrevista: o.teste_antes_da_entrevista === true,
    motivo_ao_tirar: motivo === "opcional" || motivo === "obrigatorio" ? motivo : "nao",
    ok_do_cliente: o.ok_do_cliente === true,
    administra: o.administra === true,
  };
}

/** As regras que dá para pular (com o motivo), e o que falta em cada uma. */
export type Regra = "entrevista" | "proposta" | "teste" | "cliente";

export const REGRAS: Record<Regra, { falta: string; pular: string }> = {
  entrevista: { falta: "Falta a entrevista", pular: "Pular a entrevista" },
  proposta: { falta: "Falta a proposta aceita", pular: "Contratar sem a proposta" },
  teste: { falta: "Falta o teste da vaga", pular: "Pular o teste" },
  cliente: { falta: "Falta a escolha do cliente", pular: "Contratar sem a escolha do cliente" },
};

/** A regra que o banco recusou (o hint do erro), ou null. */
export function regraDoErro(hint: string | null | undefined): Regra | null {
  const m = /^regra_(entrevista|proposta|teste|cliente)$/.exec(hint ?? "");
  return m ? (m[1] as Regra) : null;
}

// ---------------------------------------------------------------- o motivo de saída

export const MOTIVOS_SAIDA = [
  { valor: "nao_respondeu", nome: "Não respondeu" },
  { valor: "requisito", nome: "Não atende um requisito" },
  { valor: "faltou", nome: "Faltou à entrevista" },
  { valor: "outra_vaga", nome: "Escolheu outra vaga" },
  { valor: "outro_candidato", nome: "Outro candidato" },
  { valor: "vaga_fechou", nome: "A vaga fechou" },
  { valor: "outro", nome: "Outro motivo" },
] as const;
export type MotivoSaida = (typeof MOTIVOS_SAIDA)[number]["valor"];

export const ehMotivoSaida = (v: unknown): v is MotivoSaida =>
  typeof v === "string" && MOTIVOS_SAIDA.some((m) => m.valor === v);

export const nomeDoMotivo = (v: string) => MOTIVOS_SAIDA.find((m) => m.valor === v)?.nome ?? "Outro motivo";

/** Os motivos que a pessoa fica sabendo no retorno (os outros ficam só com a empresa). */
export const MOTIVOS_QUE_A_PESSOA_VE: MotivoSaida[] = ["vaga_fechou", "outro_candidato"];

// ---------------------------------------------------------------- o padrão das vagas novas

export type CurriculoPadrao = "regime" | "sempre" | "nunca";
export type TestePadrao = "opcional" | "antes" | "nenhum";

export type PropostaPadrao = {
  horario: string;
  beneficios: string;
  apresentar_onde: string;
  apresentar_hora: string;
};

export type Padroes = {
  curriculo: CurriculoPadrao;
  contato_direto: boolean;
  contato_por: "ambos" | "chat";
  /** como o formulário da vaga guarda (com a resposta procurada e a eliminatória) */
  perguntas: unknown[];
  tirar_eliminados: boolean;
  teste: TestePadrao;
  proposta: PropostaPadrao;
  /** null: a lista sugerida de sempre */
  documentos: string[] | null;
  taxa: number | null;
  garantia_dias: number | null;
};

export type PadroesDaConta = Padroes & { administra: boolean };

const texto = (x: unknown) => (typeof x === "string" ? x : "");

export function lerPadroes(x: unknown): PadroesDaConta | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const pr = (o.proposta && typeof o.proposta === "object" ? o.proposta : {}) as Record<string, unknown>;
  return {
    curriculo: o.curriculo === "sempre" || o.curriculo === "nunca" ? o.curriculo : "regime",
    contato_direto: o.contato_direto === true,
    contato_por: o.contato_por === "chat" ? "chat" : "ambos",
    perguntas: Array.isArray(o.perguntas) ? o.perguntas : [],
    tirar_eliminados: o.tirar_eliminados === true,
    teste: o.teste === "antes" || o.teste === "nenhum" ? o.teste : "opcional",
    proposta: {
      horario: texto(pr.horario),
      beneficios: texto(pr.beneficios),
      apresentar_onde: texto(pr.apresentar_onde),
      apresentar_hora: texto(pr.apresentar_hora),
    },
    documentos: Array.isArray(o.documentos) ? o.documentos.filter((d): d is string => typeof d === "string") : null,
    taxa: typeof o.taxa === "number" ? o.taxa : o.taxa != null && !Number.isNaN(Number(o.taxa)) ? Number(o.taxa) : null,
    garantia_dias: typeof o.garantia_dias === "number" ? o.garantia_dias : null,
    administra: o.administra === true,
  };
}

/** Depois do match, como os candidatos falam com quem publicou (o formulário da vaga e o padrão da conta). */
export const OPCOES_CONTATO_POR = [
  {
    valor: "ambos",
    nome: "Pelo chat do Publike e pelo WhatsApp",
    ajuda: "Quem der match vê o seu WhatsApp e pode chamar direto, além de conversar no chat.",
  },
  {
    valor: "chat",
    nome: "Só pelo chat do Publike",
    ajuda:
      "Seu WhatsApp, telefone e e-mail ficam guardados: a conversa é toda no chat. Você continua vendo o contato de quem curtiu.",
  },
] as const;
