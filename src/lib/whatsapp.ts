import { montarRetorno } from "./retorno";
import { dataDaEntrevista } from "./recrutamento";

// O WhatsApp sem a integração (claude/plano-retorno-e-whatsapp.md, parte 2): o botão do quadro abre o WhatsApp
// da empresa com a mensagem do momento (a entrevista, Contratado, o retorno de quem não seguiu). Os modelos do
// WhatsApp oficial do Publike ficam em src/lib/servidor/whatsapp.ts.

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
        : e.formato === "publike"
          ? "por vídeo pelo Publike (o botão de entrar aparece na página da vaga)"
          : `presencial${e.local ? `, na ${e.local}` : ""}`;
  return `${dataDaEntrevista(e.quando)}, ${onde}`;
}

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
