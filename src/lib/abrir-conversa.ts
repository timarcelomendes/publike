// Abrir a conversa com uma pessoa no Chat do canto da tela, de qualquer lugar da página
// (por exemplo, o "Deu match!" da vaga). Sem o Chat na página, quem chamou segue o link
// da conversa em tela cheia.

export const EVENTO_ABRIR_CONVERSA = "publike:abrir-conversa";

export type PedidoConversa = {
  /** a outra pessoa (a conversa é uma por pessoa) */
  outroId: string;
  outroNome: string;
  outroFoto?: string | null;
  /** de onde vem a conversa (o título da vaga), até ela abrir */
  titulo?: string;
};

let chatNaPagina = false;

/** O Chat avisa que está na página (e quando sai). */
export function marcarChatNaPagina(sim: boolean) {
  chatNaPagina = sim;
}

/** Pede ao Chat para abrir a conversa. Devolve false sem o Chat (aí vale o link). */
export function pedirConversa(pedido: PedidoConversa) {
  if (!chatNaPagina) return false;
  window.dispatchEvent(new CustomEvent<PedidoConversa>(EVENTO_ABRIR_CONVERSA, { detail: pedido }));
  return true;
}

/**
 * Deu match: a conversa abre sozinha, sem a pessoa precisar tocar em nada. Com o Chat na página, no Chat do canto
 * (o "Deu match!" continua na tela, com o WhatsApp); sem ele, a conversa em tela cheia.
 */
export function abrirConversaDoMatch(pedido: PedidoConversa, ir: (caminho: string) => void) {
  if (!pedirConversa(pedido)) ir(`/painel/conversas/${pedido.outroId}`);
}

// Deu match com o WhatsApp de quem publicou liberado: a pergunta "Quer falar agora?" (PerguntaDoMatch, no Chat do
// canto) e, respondida, a conversa no Chat. Na hora da curtida (contato direto) e, para os outros matches, no primeiro
// acesso depois deles.
export const EVENTO_DEU_MATCH = "publike:deu-match";

export type PedidoDoMatch = {
  /** a conversa com quem publicou, que abre no Chat depois da pergunta */
  conversa: PedidoConversa | null;
  /** o WhatsApp de quem publicou (sem ele, não pergunta: só abre a conversa) */
  whatsapp: string | null;
  /** a mensagem pronta (a 1ª linha aparece na pergunta; a 2ª é o link da vaga) */
  mensagem: string;
  /** para contar o toque no WhatsApp (Admin › Curtidas) */
  anuncioId: string;
  perfilId: string;
  servico?: boolean;
  /** false: o match veio do aceite de quem publicou (a pergunta ao entrar); sem: o contato direto */
  direto?: boolean;
  /** a vaga é só pelo chat do Publike (sem o WhatsApp): a pergunta oferece abrir a conversa */
  soChat?: boolean;
};

let perguntaNaPagina = false;

/** A pergunta do match avisa que está na página (e quando sai). */
export function marcarPerguntaDoMatchNaPagina(sim: boolean) {
  perguntaNaPagina = sim;
}

/**
 * Deu match: com o WhatsApp de quem publicou liberado, pergunta se a pessoa quer falar agora (o WhatsApp abre no
 * toque dela, com a mensagem pronta); respondida a pergunta, ou sem o WhatsApp, a conversa abre no Chat.
 */
export function avisarDeuMatch(pedido: PedidoDoMatch, ir: (caminho: string) => void) {
  // a pergunta decide: com o WhatsApp, pergunta; sem ele (só pelo chat), abre a conversa e marca o match como
  // perguntado (para a pergunta não aparecer depois, ao entrar)
  if (perguntaNaPagina) {
    window.dispatchEvent(new CustomEvent<PedidoDoMatch>(EVENTO_DEU_MATCH, { detail: pedido }));
    return;
  }
  if (pedido.conversa) abrirConversaDoMatch(pedido.conversa, ir);
}

// No celular, quem tem conta abre o Chat pelo ícone do cabeçalho (o botão do canto some, para não
// cobrir os cartões). O ícone pede para abrir e o Chat conta as mensagens não lidas para ele.
export const EVENTO_ABRIR_CHAT = "publike:abrir-chat";
export const EVENTO_NAO_LIDAS = "publike:chat-nao-lidas";

let ultimasNaoLidas: number | null = null;

/** O Chat avisa quantas mensagens não lidas há (o ícone do cabeçalho mostra o número). */
export function avisarNaoLidas(n: number) {
  ultimasNaoLidas = n;
  window.dispatchEvent(new CustomEvent<number>(EVENTO_NAO_LIDAS, { detail: n }));
}

/** O último número que o Chat contou (null antes de ele contar). */
export function naoLidasDoChat() {
  return ultimasNaoLidas;
}

/** Pede ao Chat para abrir (na aba que tem novidade). Devolve false sem o Chat na página. */
export function pedirChat() {
  if (!chatNaPagina) return false;
  window.dispatchEvent(new Event(EVENTO_ABRIR_CHAT));
  return true;
}
