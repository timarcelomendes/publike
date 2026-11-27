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
 * Pedir o link de entrar pela conversa (25/11/2026; migração 20271002120000): quem escreve "entrar" recebe na hora o
 * link de entrar com um toque, sem código, a qualquer hora (a mensagem da pessoa abre as 24 horas da Meta). Vale no
 * link vencido do aviso e no entrar do site, quando o código não pode sair.
 */
export const TEXTO_DO_ENTRAR = "entrar";

export function linkDoEntrar(numero: string = WHATSAPP_OFICIAL.numero) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(TEXTO_DO_ENTRAR)}`;
}

/** No entrar do site, fora das 24 horas (o código não sai): o "entrar" na conversa, no lugar do "oi" e do código. */
export const MANDE_ENTRAR = `Para entrar sem código, mande "entrar" para o Publike no WhatsApp ${WHATSAPP_OFICIAL.exibicao}: o link de entrar chega na hora.`;

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

/** O número do WhatsApp do telefone da Receita (55 + DDD + número); null: não dá. `celular`: começa com 9 (ou 6 a 9). */
export function whatsappDaReceita(telefone: string | null): { numero: string; celular: boolean } | null {
  const d = (telefone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").replace(/^0/, "");
  if (d.length !== 10 && d.length !== 11) return null;
  const celular = d.length === 11 ? d[2] === "9" : /[6-9]/.test(d[2]);
  return { numero: `55${d}`, celular };
}


/**
 * As vagas de contábil, fiscal e DP pela conversa (27/11/2026; a página /vagas/goiania/contabil-fiscal-e-dp e o anúncio
 * da área): o pedido já escrito. O atendimento manda as vagas da área e pede o currículo em PDF.
 */
export const TEXTO_DAS_VAGAS_CONTABEIS = "Quero vagas de contábil e fiscal";

export function linkDasVagasContabeis(numero: string = WHATSAPP_OFICIAL.numero) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(TEXTO_DAS_VAGAS_CONTABEIS)}`;
}
