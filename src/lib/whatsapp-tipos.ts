// Os avisos que saem pelo WhatsApp oficial (migração 20270619120000), com o nome para o Admin › WhatsApp. Os mesmos
// tipos do gatilho notificacoes_para_whatsapp.

export const TIPOS_WHATSAPP: { tipo: string; nome: string; para: string }[] = [
  { tipo: "match", nome: "A empresa aceitou a candidatura (match)", para: "Candidato" },
  { tipo: "entrevista", nome: "Entrevista marcada ou horários para escolher", para: "Candidato" },
  { tipo: "entrevista_lembrete", nome: "Lembrete na véspera da entrevista", para: "Candidato" },
  { tipo: "te_respondeu", nome: "\"A empresa te respondeu?\" (com botões)", para: "Candidato" },
  { tipo: "conquista_pergunta", nome: "\"Deu certo? Você começou?\" (com botões)", para: "Candidato" },
  { tipo: "dispensada", nome: "Retorno de quem não seguiu", para: "Candidato" },
  { tipo: "curtida", nome: "Candidatura nova (ou pedido de serviço)", para: "Quem contrata" },
  { tipo: "lembrete_curtida", nome: "Candidatos esperando resposta", para: "Quem contrata" },
  { tipo: "ainda_espera", nome: "Candidato ainda espera o retorno", para: "Quem contrata" },
  { tipo: "conquista_confirmar", nome: "\"Começou a trabalhar?\" (com botões)", para: "Quem contrata" },
  { tipo: "interesse_local", nome: "\"Quero trabalhar aqui\"", para: "Quem contrata" },
  { tipo: "mensagem", nome: "Mensagem nova no chat (sem ler há 10 min)", para: "Todos" },
];
