// Os avisos que saem pelo WhatsApp oficial (migrações 20270619120000 e 20270620120000), com o nome para o
// Admin › WhatsApp. Os mesmos tipos do gatilho notificacoes_para_whatsapp. `economico`: o que fica ligado no envio
// econômico (o que destrava a contratação e as perguntas com botões); o resto fica no sino, no e-mail e no celular.

export const TIPOS_WHATSAPP: { tipo: string; nome: string; para: string; economico: boolean }[] = [
  { tipo: "match", nome: "A empresa aceitou a candidatura (match)", para: "Candidato", economico: true },
  { tipo: "entrevista", nome: "Entrevista marcada ou horários para escolher", para: "Candidato", economico: true },
  { tipo: "entrevista_lembrete", nome: "Lembrete na véspera da entrevista", para: "Candidato", economico: true },
  { tipo: "te_respondeu", nome: "\"A empresa te respondeu?\" (com botões)", para: "Candidato", economico: true },
  { tipo: "conquista_pergunta", nome: "\"Deu certo? Você começou?\" (com botões)", para: "Candidato", economico: true },
  { tipo: "dispensada", nome: "Retorno de quem não seguiu", para: "Candidato", economico: false },
  { tipo: "curtida", nome: "Candidatura nova (ou pedido de serviço)", para: "Quem contrata", economico: true },
  { tipo: "lembrete_curtida", nome: "Candidatos esperando resposta", para: "Quem contrata", economico: false },
  { tipo: "ainda_espera", nome: "Candidato ainda espera o retorno", para: "Quem contrata", economico: true },
  { tipo: "conquista_confirmar", nome: "\"Começou a trabalhar?\" (com botões)", para: "Quem contrata", economico: true },
  { tipo: "interesse_local", nome: "\"Quero trabalhar aqui\"", para: "Quem contrata", economico: true },
  { tipo: "mensagem", nome: "Mensagem nova no chat (sem ler há 10 min)", para: "Todos", economico: false },
];

/** A tarifa de utilidade da Meta no Brasil (US$ 0,0068 por mensagem entregue, desde julho de 2026). */
export const TARIFA_WHATSAPP_USD = 0.0068;

export function dolares(mensagens: number) {
  return `US$ ${(mensagens * TARIFA_WHATSAPP_USD).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
