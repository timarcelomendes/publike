import { SITE_URL } from "./config";

/**
 * O link que vai na mensagem do WhatsApp depois do match, para quem recebe abrir no Publike e
 * saber de onde vem a conversa:
 *   contato direto (o match sai na hora, sem aceite) ... a vaga (ou o serviço)
 *   com aceite, para quem publicou ...................... a ficha da pessoa (no serviço, os pedidos)
 *   com aceite, para quem curtiu ........................ a curtida aceita, em Minhas curtidas
 */
export function linkDoMatch({
  anuncioId,
  perfilId,
  para,
  direto,
  servico = false,
}: {
  anuncioId: string;
  /** quem curtiu (a ficha dela, para quem publicou) */
  perfilId: string;
  /** quem recebe a mensagem */
  para: "quem_publicou" | "quem_curtiu";
  /** a vaga (ou o serviço) tem contato direto: não teve aceite */
  direto: boolean;
  servico?: boolean;
}) {
  if (direto) return `${SITE_URL}/anuncio/${anuncioId}`;
  if (para === "quem_publicou") {
    return servico ? `${SITE_URL}/painel/anuncio/${anuncioId}` : `${SITE_URL}/painel/caixa?c=${anuncioId}:${perfilId}`;
  }
  return `${SITE_URL}/painel/curtidas?${servico ? "tipo=servico&" : ""}situacao=match`;
}

/** A mensagem com o link numa linha embaixo (o WhatsApp mostra a prévia do Publike). */
export function mensagemComLink(texto: string, link: string) {
  return `${texto}\n${link}`;
}
