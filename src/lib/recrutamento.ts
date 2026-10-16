// Peças do recrutamento usadas no navegador e no servidor: as colunas do quadro,
// as mensagens prontas que já vêm no Publike e as variáveis delas.

import type { EtapaCandidato } from "./constantes";

/** As colunas do quadro de uma vaga, na ordem. "Não seguiu" junta dispensados e desfeitos. */
export const COLUNAS_QUADRO: { etapa: EtapaCandidato; nome: string; ajuda: string }[] = [
  { etapa: "novo", nome: "Novos", ajuda: "Curtiram a vaga" },
  { etapa: "analise", nome: "Em análise", ajuda: "Você está olhando" },
  { etapa: "entrevista", nome: "Entrevista", ajuda: "Com entrevista marcada" },
  { etapa: "contratado", nome: "Contratados", ajuda: "Fim do processo" },
  { etapa: "nao_seguiu", nome: "Não seguiu", ajuda: "Dispensados ou que desistiram" },
];

/** Em qual coluna a pessoa está: dispensada ou com match desfeito vai para "Não seguiu". */
export function colunaDoCandidato(status: string, etapa: EtapaCandidato): EtapaCandidato {
  if (status === "dispensada" || status === "desfeito") return "nao_seguiu";
  if (status === "pendente" && (etapa === "entrevista" || etapa === "contratado")) return "novo";
  return etapa;
}

export type ModeloMensagem = { id: string; nome: string; texto: string; pronto?: boolean };

/** As que já vêm no Publike. {nome}, {vaga} e {empresa} são trocados na hora de mandar. */
export const MODELOS_PRONTOS: ModeloMensagem[] = [
  {
    id: "pronto-entrevista",
    nome: "Convite para entrevista",
    texto:
      "Olá, {nome}! Gostamos do seu perfil para a vaga de {vaga}. Podemos marcar uma entrevista? Qual o melhor dia e horário para você?",
    pronto: true,
  },
  {
    id: "pronto-documentos",
    nome: "Pedir documentos",
    texto:
      "Olá, {nome}! Para seguir com a vaga de {vaga}, precisamos de: RG, CPF, carteira de trabalho e comprovante de endereço. Pode trazer ou mandar foto por aqui?",
    pronto: true,
  },
  {
    id: "pronto-aprovado",
    nome: "Aprovado",
    texto:
      "Parabéns, {nome}! Você foi aprovado(a) para a vaga de {vaga} na {empresa}. Vamos combinar o primeiro dia de trabalho?",
    pronto: true,
  },
  {
    id: "pronto-nao-seguiu",
    nome: "Não seguiu (agradecimento)",
    texto:
      "Olá, {nome}. Obrigado pelo interesse na vaga de {vaga}. Desta vez seguimos com outra pessoa, mas vamos guardar seu contato para as próximas oportunidades.",
    pronto: true,
  },
];

/** Troca as variáveis do modelo pelos dados de cada candidato. */
export function preencherModelo(texto: string, dados: { nome: string; vaga: string; empresa: string }) {
  return texto
    .replaceAll("{nome}", dados.nome.split(" ")[0] || dados.nome)
    .replaceAll("{vaga}", dados.vaga)
    .replaceAll("{empresa}", dados.empresa);
}

export const FORMATOS_ENTREVISTA = {
  presencial: { nome: "Presencial", campo: "Endereço", exemplo: "Rua 10, 250, Setor Oeste (sala 3)" },
  video: { nome: "Por vídeo", campo: "Link da chamada", exemplo: "https://meet.google.com/abc-defg-hij" },
  telefone: { nome: "Por telefone", campo: "", exemplo: "" },
} as const;
export type FormatoEntrevista = keyof typeof FORMATOS_ENTREVISTA;

export const SITUACOES_ENTREVISTA: Record<string, { nome: string; tom: "aviso" | "match" | "contorno" | "perigo" }> = {
  marcada: { nome: "Aguardando confirmação", tom: "aviso" },
  confirmada: { nome: "Confirmada", tom: "match" },
  remarcar: { nome: "Pediu para remarcar", tom: "perigo" },
  cancelada: { nome: "Cancelada", tom: "contorno" },
  realizada: { nome: "Realizada", tom: "contorno" },
  faltou: { nome: "Não compareceu", tom: "perigo" },
};

/** "qua, 22/10 às 14h" no horário de Brasília. */
export function dataDaEntrevista(iso: string) {
  const d = new Date(iso);
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const semana = v("weekday").replace(".", "");
  const min = v("minute");
  return `${semana}, ${v("day")}/${v("month")} às ${Number(v("hour"))}h${min === "00" ? "" : min}`;
}
