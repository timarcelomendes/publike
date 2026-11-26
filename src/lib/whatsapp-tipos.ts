import { rotuloConta } from "./formato";

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
    // só para quem contrata desde 19/11/2026 (migração 20270809120000)
    nome: "Mensagem nova no chat que ficou sem ler (para quem contrata)",
    curto: "Mensagem no chat",
    para: "Quem contrata",
    economico: false,
  },
  // o convite do pacote (migração 20270718120000): só o que o pacote de candidatos fez; modelo de marketing
  {
    tipo: "convite",
    nome: "Vaga perto que combina (convite do pacote)",
    curto: "Vaga que combina",
    para: "Candidato",
    economico: true,
  },
  // "Quem você contratou?" (migração 20271006120000): o botão abre a página com o nome de cada aceito, sem entrar
  {
    tipo: "quem_contratou",
    nome: "\"Quem você contratou?\" (com os nomes, pelo link)",
    curto: "Quem você contratou?",
    para: "Quem contrata",
    economico: true,
  },
  // o aviso de vaga nova (migração 20271005120000): para quem procurou pela conversa, sem conta; o robô das filas manda
  // (não é escolha das Preferências: "Conversa" não aparece lá). Modelo de marketing
  {
    tipo: "aviso_de_vaga",
    nome: "Vaga nova do que a pessoa procurou na conversa",
    curto: "Vaga nova procurada",
    para: "Conversa",
    economico: false,
  },
  // o convite com a vaga pronta para a empresa que está contratando (migração 20271011120000): o robô das filas manda,
  // em lote, com o teto de Admin › Convites (desligado até a equipe ligar). Modelo de marketing
  {
    tipo: "convite_vaga_pronta",
    nome: "Convite com a vaga pronta (empresa que está contratando)",
    curto: "Convite da vaga pronta",
    para: "Empresa sem conta",
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
  convite: "Vagas perto de você que combinam com o seu currículo",
  quem_contratou: "“Quem você contratou?”, para contar com um toque",
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
 * Quem recebeu o aviso, para o Admin (18/11/2026, Marcelo: "quando a empresa ou o candidato recebeu WhatsApp"): o
 * candidato ou quem contrata, pelo tipo da conta (empresa, comércio, agência; a pessoa que publicou a vaga ou o
 * serviço). A mensagem do chat vai para os dois lados: fica só o tipo da conta.
 */
export function quemRecebeuWhatsapp(tipo: string, contaTipo: string | null) {
  const para = TIPOS_WHATSAPP.find((x) => x.tipo === tipo)?.para;
  if (para === "Candidato") return "candidato";
  if (!contaTipo) return para === "Quem contrata" ? "quem contrata" : "conta apagada";
  if (contaTipo === "pessoa") return para === "Quem contrata" ? "quem publicou" : "pessoa";
  return rotuloConta(contaTipo);
}

/** Por que o aviso não saiu, em palavras (os motivos que o robô grava; não são erros). */
export const PORQUE_NAO_SAIU: Record<string, string> = {
  "já viu no Publike": "a pessoa viu no Publike antes (a mensagem não fez falta)",
  // migração 20270804120000: o aviso apagado do sino não é "já viu" (antes, os dois eram um motivo só)
  "saiu do sino": "o aviso saiu do sino antes (trocado por um mais novo ou apagado)",
  "limite do dia da conta": "a conta já tinha recebido o limite do dia",
  "modo de teste": "o envio estava só para os números de teste",
  "parou de receber": "a pessoa parou de receber pelo WhatsApp",
  "desligou este aviso": "a pessoa desligou este aviso no WhatsApp (Preferências)",
  "limite do mês do grátis": "a empresa ou agência usou os avisos do mês do grátis",
  "limite do mês do plano": "a empresa ou agência usou os avisos do mês do plano",
};

/** O motivo de o aviso não ter saído, explicado (o "venceu" é o que esperou demais na fila). */
export function porqueNaoSaiu(motivo: string) {
  return PORQUE_NAO_SAIU[motivo] ?? (motivo.startsWith("venceu") ? `esperou demais na fila: ${motivo}` : motivo);
}

/** As respostas dos botões, como a pessoa tocou. */
export const RESPOSTAS_WHATSAPP: Record<string, string> = {
  sim: "Sim",
  ainda_nao: "Ainda não",
  desisti: "Desisti",
  comecei: "Comecei",
  nao_deu: "Não deu certo",
  nao: "Não",
};

/**
 * Os parâmetros do envio (Admin › WhatsApp › Parâmetros; migração 20270710120000), com os valores de antes, que eram
 * fixos no código. `faixa`: o mínimo e o máximo que o banco aceita (admin_salvar_whatsapp corta no que passar).
 * `limite_mes_gratis` e `limite_mes_plano` (migração 20270714120000): os avisos por mês de cada conta de quem contrata,
 * no grátis e com plano.
 */
export const PARAMETROS_WHATSAPP = {
  hora_inicio: { padrao: 8, faixa: [0, 23] },
  hora_fim: { padrao: 21, faixa: [1, 24] },
  por_conta_dia: { padrao: 4, faixa: [1, 20] },
  // 10 por dia (era 8 até a migração 20270715120000): os avisos do mês do plano cabem no mês
  por_conta_dia_empresa: { padrao: 10, faixa: [1, 40] },
  juntar_minutos: { padrao: 5, faixa: [0, 120] },
  intervalo_vaga_horas: { padrao: 3, faixa: [0, 48] },
  mensagem_minutos: { padrao: 10, faixa: [1, 240] },
  intervalo_conversa_horas: { padrao: 6, faixa: [0, 72] },
  validade_horas: { padrao: 24, faixa: [1, 72] },
  limite_mes_gratis: { padrao: 30, faixa: [0, 100_000] },
  limite_mes_plano: { padrao: 300, faixa: [0, 100_000] },
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
/** A de marketing (US$ 0,0625 desde 1/10/2026): o modelo do convite do pacote. */
export const TARIFA_MARKETING_USD = 0.0625;

/**
 * O custo das mensagens cobradas pela categoria do modelo de cada uma (`categorias`: a que a Meta deu, em
 * Admin › WhatsApp › Modelos). Sem a categoria, conta como utilidade.
 */
export function custoDasCobradas(porModelo: Record<string, number>, categorias: Record<string, string | undefined>) {
  let marketing = 0;
  let utilidade = 0;
  for (const [modelo, n] of Object.entries(porModelo)) {
    if (categorias[modelo] === "MARKETING") marketing += Number(n) || 0;
    else utilidade += Number(n) || 0;
  }
  return { marketing, utilidade, usd: marketing * TARIFA_MARKETING_USD + utilidade * TARIFA_WHATSAPP_USD };
}

/** "US$ 0,07" de um valor em dólares. */
export function emDolares(usd: number) {
  return `US$ ${usd.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function dolares(mensagens: number) {
  return `US$ ${(mensagens * TARIFA_WHATSAPP_USD).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
