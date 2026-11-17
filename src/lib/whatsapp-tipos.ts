// Os avisos que saem pelo WhatsApp oficial (migrações 20270619120000 e 20270620120000), com o nome para o
// Admin › WhatsApp. Os mesmos tipos do gatilho notificacoes_para_whatsapp. `economico`: o que fica ligado no envio
// econômico (o que destrava a contratação e as perguntas com botões); o resto fica no sino, no e-mail e no celular.

// `curto`: o nome nas tabelas e nos erros do Admin.
export const TIPOS_WHATSAPP: { tipo: string; nome: string; curto: string; para: string; economico: boolean }[] = [
  { tipo: "match", nome: "A empresa aceitou a candidatura (match)", curto: "Match", para: "Candidato", economico: true },
  {
    tipo: "entrevista",
    nome: "Entrevista marcada ou horários para escolher",
    curto: "Entrevista",
    para: "Candidato",
    economico: true,
  },
  {
    tipo: "entrevista_lembrete",
    nome: "Lembrete na véspera da entrevista",
    curto: "Lembrete da entrevista",
    para: "Candidato",
    economico: true,
  },
  {
    tipo: "te_respondeu",
    nome: "\"A empresa te respondeu?\" (com botões)",
    curto: "A empresa te respondeu?",
    para: "Candidato",
    economico: true,
  },
  {
    tipo: "conquista_pergunta",
    nome: "\"Deu certo? Você começou?\" (com botões)",
    curto: "Deu certo?",
    para: "Candidato",
    economico: true,
  },
  { tipo: "dispensada", nome: "Retorno de quem não seguiu", curto: "Retorno", para: "Candidato", economico: false },
  {
    tipo: "curtida",
    nome: "Candidatura nova (ou pedido de serviço)",
    curto: "Candidatura nova",
    para: "Quem contrata",
    economico: true,
  },
  {
    tipo: "lembrete_curtida",
    nome: "Candidatos esperando resposta",
    curto: "Esperando resposta",
    para: "Quem contrata",
    economico: false,
  },
  {
    tipo: "ainda_espera",
    nome: "Candidato ainda espera o retorno",
    curto: "Ainda espera o retorno",
    para: "Quem contrata",
    economico: true,
  },
  {
    tipo: "conquista_confirmar",
    nome: "\"Começou a trabalhar?\" (com botões)",
    curto: "Começou a trabalhar?",
    para: "Quem contrata",
    economico: true,
  },
  {
    tipo: "interesse_local",
    nome: "\"Quero trabalhar aqui\"",
    curto: "Quero trabalhar aqui",
    para: "Quem contrata",
    economico: true,
  },
  {
    tipo: "mensagem",
    nome: "Mensagem nova no chat que ficou sem ler",
    curto: "Mensagem no chat",
    para: "Todos",
    economico: false,
  },
];

/**
 * Os avisos que a conta escolhe em Preferências (migração 20270711120000), com o nome para quem recebe. Quem procura
 * emprego vê os de candidato (e o pedido de serviço, se tem serviço); quem contrata, os de quem contrata. Só os que o
 * Publike manda hoje (Admin › WhatsApp › Parâmetros).
 */
const ROTULO_PARA_QUEM_RECEBE: Record<string, string> = {
  match: "A empresa aceitou a sua candidatura",
  entrevista: "Entrevista marcada ou horários para escolher",
  entrevista_lembrete: "Lembrete na véspera da entrevista",
  te_respondeu: "“A empresa te respondeu?”, para contar com um toque",
  conquista_pergunta: "“Deu certo? Você começou?”, para contar com um toque",
  dispensada: "O retorno de quem não seguiu com você",
  curtida: "Candidatura nova nas suas vagas (juntas por vaga)",
  lembrete_curtida: "Candidatos esperando a sua resposta",
  ainda_espera: "Candidato que ainda espera o seu retorno",
  conquista_confirmar: "“Começou a trabalhar?”, para confirmar com um toque",
  interesse_local: "“Quero trabalhar aqui”: currículo enviado para a sua empresa",
  mensagem: "Mensagem nova no chat",
};

export function avisosParaEscolher(conta: {
  tipoConta: string | null;
  temServicos: boolean;
  doPublikeDesligados: string[];
}): { tipo: string; rotulo: string }[] {
  const pessoa = (conta.tipoConta ?? "pessoa") === "pessoa";
  return TIPOS_WHATSAPP.filter((t) => !conta.doPublikeDesligados.includes(t.tipo))
    .filter((t) =>
      t.para === "Todos"
        ? true
        : pessoa
          ? t.para === "Candidato" || (t.tipo === "curtida" && conta.temServicos)
          : t.para === "Quem contrata",
    )
    .map((t) => ({
      tipo: t.tipo,
      rotulo: t.tipo === "curtida" && pessoa ? "Pedido novo nos seus serviços" : (ROTULO_PARA_QUEM_RECEBE[t.tipo] ?? t.nome),
    }));
}

export function nomeDoAvisoWhatsapp(tipo: string, curto = false) {
  const t = TIPOS_WHATSAPP.find((x) => x.tipo === tipo);
  return (curto ? t?.curto : t?.nome) ?? tipo;
}

/**
 * Os parâmetros do envio (Admin › WhatsApp › Parâmetros; migração 20270710120000), com os valores de antes, que eram
 * fixos no código. `faixa`: o mínimo e o máximo que o banco aceita (admin_salvar_whatsapp corta no que passar).
 */
export const PARAMETROS_WHATSAPP = {
  hora_inicio: { padrao: 8, faixa: [0, 23] },
  hora_fim: { padrao: 21, faixa: [1, 24] },
  por_conta_dia: { padrao: 4, faixa: [1, 20] },
  por_conta_dia_empresa: { padrao: 8, faixa: [1, 40] },
  juntar_minutos: { padrao: 5, faixa: [0, 120] },
  intervalo_vaga_horas: { padrao: 3, faixa: [0, 48] },
  mensagem_minutos: { padrao: 10, faixa: [1, 240] },
  intervalo_conversa_horas: { padrao: 6, faixa: [0, 72] },
  validade_horas: { padrao: 24, faixa: [1, 72] },
} as const;

export type ParametroWhatsapp = keyof typeof PARAMETROS_WHATSAPP;
export type ParametrosWhatsapp = Record<ParametroWhatsapp, number>;

/** Os parâmetros da configuração, com o valor de antes no que ainda não veio (banco sem a migração 20270710120000). */
export function parametrosWhatsapp(config: Partial<Record<ParametroWhatsapp, number | null>>): ParametrosWhatsapp {
  const p = {} as ParametrosWhatsapp;
  for (const k of Object.keys(PARAMETROS_WHATSAPP) as ParametroWhatsapp[]) {
    const v = Number(config[k]);
    p[k] = config[k] == null || !Number.isFinite(v) ? PARAMETROS_WHATSAPP[k].padrao : v;
  }
  return p;
}

/** "das 8h às 21h" (24 é meia-noite). */
export function horarioWhatsapp(inicio: number, fim: number) {
  return `das ${inicio}h às ${fim === 24 ? "24h (meia-noite)" : `${fim}h`}`;
}

/** A tarifa de utilidade da Meta no Brasil (US$ 0,0068 por mensagem entregue, desde julho de 2026). */
export const TARIFA_WHATSAPP_USD = 0.0068;

export function dolares(mensagens: number) {
  return `US$ ${(mensagens * TARIFA_WHATSAPP_USD).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
