// Conexões entre quem está na aba Talentos e empresas, comércios e agências, sem precisar de
// vaga: um lado pede, o outro aceita ou recusa. Aceita: os contatos aparecem e abre uma conversa.

export type StatusConexao = "pendente" | "aceita" | "recusada";

/** Como está a conexão com uma conta, do meu lado (para os botões). */
export type EstadoConexao = { id: string; status: StatusConexao; pedi: boolean };

export type Conexao = {
  id: string;
  status: StatusConexao;
  /** fui eu (a minha conta) que pedi */
  pedi: boolean;
  outro_id: string;
  /** pessoa: "Maria S." até a conexão ser aceita */
  outro_nome: string;
  outro_foto: string | null;
  outro_tipo: string;
  outro_cidade: string;
  outro_bairro: string | null;
  /** o outro lado é talento na aba (dá para abrir o currículo em /talentos) */
  outro_na_vitrine: boolean;
  /** o recado do pedido */
  mensagem: string | null;
  criado_em: string;
  respondida_em: string | null;
  /** os contatos só vêm na conexão aceita */
  whatsapp: string | null;
  email: string | null;
  ultima_texto: string | null;
  ultima_em: string | null;
  ultima_minha: boolean;
  nao_lidas: number;
};

/** O recado do pedido: até 300 letras, sem telefone, e-mail ou link. */
export const MAX_RECADO_CONEXAO = 300;

/** Quem teve o pedido recusado espera esses dias para pedir de novo. */
export const DIAS_ESPERA_RECUSA = 30;

export function lerStatusConexao(valor: string): StatusConexao {
  return valor === "aceita" || valor === "recusada" ? valor : "pendente";
}

/** Onde fica a conexão com uma conta: o pedido, os contatos e a conversa. */
export function caminhoConexao(outroId: string) {
  return `/painel/conexoes/${outroId}`;
}

/** O número do menu: pedidos esperando a minha resposta e mensagens novas. */
export function pendenciasDeConexao(lista: Conexao[]) {
  return lista.reduce(
    (total, c) => total + (c.status === "pendente" && !c.pedi ? 1 : 0) + (c.status === "aceita" ? c.nao_lidas : 0),
    0,
  );
}

/** A data em que dá para pedir de novo, depois de um pedido recusado. */
export function pedirDeNovoEm(respondidaEm: string | null) {
  if (!respondidaEm) return null;
  return new Date(new Date(respondidaEm).getTime() + DIAS_ESPERA_RECUSA * 24 * 3600 * 1000).toISOString();
}
