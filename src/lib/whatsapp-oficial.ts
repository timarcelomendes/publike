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

/**
 * O aceite dos avisos pela conversa (23/11/2026, migração 20270915120000): o wa.me com o pedido já escrito. A empresa
 * toca e envia; o atendimento liga o aviso pelo WhatsApp das contas do número e responde com quem está esperando.
 */
export const TEXTO_DO_ACEITE = "Quero receber meus candidatos pelo WhatsApp";

export function linkDoAceite(numero: string = WHATSAPP_OFICIAL.numero) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(TEXTO_DO_ACEITE)}`;
}

/** A mensagem é o pedido do aceite (a do link, ou parecida e curta: "quero receber os candidatos aqui"). */
export function pedeOsCandidatosAqui(texto: string) {
  const t = texto.trim();
  return t.length <= 120 && /\breceber\b.{0,20}\bcandidat/i.test(t);
}
