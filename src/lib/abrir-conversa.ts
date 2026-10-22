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
