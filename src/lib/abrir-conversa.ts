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
