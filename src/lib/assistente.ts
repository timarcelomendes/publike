// Assistente de ajuda (chat). Tipos que o navegador e o servidor usam.

export type MensagemChat = { de: "pessoa" | "assistente"; texto: string };

export type CartaoChat =
  | { tipo: "anuncio"; id: string; titulo: string; linha: string; valor: string }
  | { tipo: "empresa"; id: string; nome: string; linha: string };

export type AcaoChat = "nenhuma" | "pedir_login" | "sugerir";

export type RespostaChat =
  | { ok: true; texto: string; acao: AcaoChat; cartoes: CartaoChat[]; verMais: string | null }
  | { ok: false; erro: string };

/** Mensagens por hora: quem não tem conta tira dúvidas; com conta, também busca vagas e empresas. */
export const LIMITES_CHAT = { visitante: 15, conta: 40 } as const;

/** Tamanho de cada mensagem e quantas vão de volta para a IA (a conversa fica só no navegador). */
export const TAMANHO_MENSAGEM_CHAT = 600;
export const HISTORICO_CHAT = 12;

export const PERGUNTAS_INICIAIS = [
  "Como funciona o match?",
  "É grátis mesmo?",
  "Quero achar vagas perto de casa",
  "Quais empresas estão contratando?",
];
