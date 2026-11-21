// O WhatsApp oficial do Publike (o mesmo da Ajuda), para o código de entrar pelo WhatsApp (20/11/2026; migração
// 20270818120000). A Meta só deixa mandar mensagem livre a quem escreveu nas últimas 24 horas: fora disso, a pessoa
// manda antes um "oi" e pede o código de novo. Vale no site e no servidor (a tela de entrar, o Meu perfil e o gancho).

/** Os dígitos como a Meta guarda (sem o 9, para o wa.me) e o número como as pessoas conhecem. */
export const WHATSAPP_OFICIAL = { numero: "556284771907", exibicao: "(62) 98477-1907" } as const;

export const MANDE_UM_OI = `Para receber o código no WhatsApp, mande antes um oi para o Publike no ${WHATSAPP_OFICIAL.exibicao} e peça o código de novo.`;

/** O wa.me do Publike com o "Oi" já escrito. `numero`: o da Meta, quando o site sabe; senão, o oficial. */
export function linkDoOi(numero: string = WHATSAPP_OFICIAL.numero) {
  return `https://wa.me/${numero}?text=${encodeURIComponent("Oi")}`;
}
