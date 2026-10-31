import { montarRetorno } from "./retorno";
import { dataDaEntrevista } from "./recrutamento";

// O WhatsApp sem a integração (claude/plano-retorno-e-whatsapp.md, parte 2): o botão do quadro abre o WhatsApp
// da empresa com a mensagem do momento (a entrevista, Contratado, o retorno de quem não seguiu). Os mesmos
// textos viram os modelos da integração oficial (parte 3).

type EntrevistaDoMomento = { quando: string; formato: string; local: string | null; situacao: string };

export type MensagemDoMomento = {
  texto: string;
  /** o nome do botão */
  rotulo: string;
  /** leva o link do match no fim (o retorno não leva) */
  comLink: boolean;
};

const EM_ABERTO = ["marcada", "confirmada", "remarcar"];

/** A entrevista numa frase: "terça, 04/11 às 14h, presencial, na Rua 10, 250". */
export function fraseDaEntrevista(e: EntrevistaDoMomento) {
  const onde =
    e.formato === "video"
      ? `por vídeo${e.local ? `: ${e.local}` : ""}`
      : e.formato === "telefone"
        ? "por telefone (eu ligo nesse horário)"
        : `presencial${e.local ? `, na ${e.local}` : ""}`;
  return `${dataDaEntrevista(e.quando)}, ${onde}`;
}

/**
 * Os modelos para cadastrar na Meta (categoria utilidade) quando a conta for liberada (parte 3b). {{1}}, {{2}}…
 * são as variáveis, na ordem de `variaveis`; o botão abre o Publike (a parte variável do link vai no fim).
 */
export const MODELOS_WHATSAPP = [
  {
    nome: "candidatura_aceita",
    para: "candidato",
    quando: "match",
    variaveis: ["nome", "empresa", "vaga"],
    texto: "Oi, {{1}}! {{2}} aceitou a sua candidatura para {{3}}. Agora vocês podem conversar pelo Publike.",
    botao: "Abrir a conversa",
  },
  {
    nome: "entrevista_marcada",
    para: "candidato",
    quando: "entrevista marcada ou remarcada",
    variaveis: ["nome", "vaga", "quando e onde"],
    texto: "Oi, {{1}}! Sua entrevista para {{2}} ficou para {{3}}. Confirme ou peça para remarcar pelo Publike.",
    botao: "Confirmar",
  },
  {
    nome: "escolher_horario",
    para: "candidato",
    quando: "a empresa mandou horários para escolher",
    variaveis: ["nome", "vaga"],
    texto: "Oi, {{1}}! Chegaram horários para a sua entrevista para {{2}}. Escolha o melhor pelo Publike.",
    botao: "Escolher o horário",
  },
  {
    nome: "lembrete_entrevista",
    para: "candidato",
    quando: "véspera da entrevista, às 18h",
    variaveis: ["nome", "vaga", "quando e onde"],
    texto: "Oi, {{1}}! Amanhã tem a sua entrevista para {{2}}: {{3}}. Se não for dar, avise pelo Publike.",
    botao: "Ver a entrevista",
  },
  {
    nome: "andamento",
    para: "candidato",
    quando: "mudou de etapa",
    variaveis: ["nome", "vaga", "etapa"],
    texto: "Oi, {{1}}! A sua candidatura para {{2}} agora está em: {{3}}.",
    botao: "Ver a candidatura",
  },
  {
    nome: "retorno",
    para: "candidato",
    quando: "não seguiu (o texto da empresa vai no Publike)",
    variaveis: ["nome", "vaga", "empresa"],
    texto: "Oi, {{1}}. {{3}} deixou um retorno sobre a vaga de {{2}}. Veja no Publike, junto com vagas parecidas.",
    botao: "Ver o retorno",
  },
  {
    nome: "candidato_novo",
    para: "empresa",
    quando: "curtida nova",
    variaveis: ["nome da empresa", "candidato", "vaga"],
    texto: "Oi, {{1}}! {{2}} se candidatou à vaga de {{3}}. Aceite ou dispense pelo Publike.",
    botao: "Responder",
  },
  {
    nome: "lembrete_resposta",
    para: "empresa",
    quando: "curtida sem resposta há 24 h",
    variaveis: ["nome da empresa", "quantos", "vaga"],
    texto:
      "Oi, {{1}}! {{2}} pessoas esperam a sua resposta na vaga de {{3}}. Responder rápido faz a vaga aparecer mais.",
    botao: "Responder agora",
  },
] as const;

export function mensagemDoMomento(d: {
  nome: string;
  empresa: string;
  vaga: string;
  coluna: string;
  entrevista?: EntrevistaDoMomento | null;
  /** o texto do retorno da conta (null: o padrão) */
  retorno?: string | null;
}): MensagemDoMomento {
  const primeiro = d.nome.split(" ")[0];
  if (d.coluna === "nao_seguiu") {
    return {
      texto: montarRetorno(d.retorno ?? null, { nome: d.nome, vaga: d.vaga, empresa: d.empresa }),
      rotulo: "Mandar o retorno no WhatsApp",
      comLink: false,
    };
  }
  if (d.coluna === "contratado") {
    return {
      texto: `Olá, ${primeiro}! Aqui é da ${d.empresa}. Que bom ter você com a gente na vaga de ${d.vaga}. Vamos combinar o primeiro dia?`,
      rotulo: "Mandar no WhatsApp",
      comLink: false,
    };
  }
  if (d.entrevista?.situacao === "escolher") {
    return {
      texto: `Olá, ${primeiro}! Aqui é da ${d.empresa}. Mandei alguns horários para a sua entrevista na vaga de ${d.vaga}. Escolha o melhor para você no Publike:`,
      rotulo: "Avisar dos horários no WhatsApp",
      comLink: true,
    };
  }
  if (d.entrevista && EM_ABERTO.includes(d.entrevista.situacao)) {
    return {
      texto: `Olá, ${primeiro}! Aqui é da ${d.empresa}. Sua entrevista para a vaga de ${d.vaga} ficou para ${fraseDaEntrevista(d.entrevista)}. Pode confirmar por aqui?`,
      rotulo: "Avisar da entrevista no WhatsApp",
      comLink: true,
    };
  }
  return {
    texto: `Olá, ${primeiro}! Aqui é da ${d.empresa}, sobre a vaga de ${d.vaga} no Publike.`,
    rotulo: "WhatsApp",
    comLink: true,
  };
}
