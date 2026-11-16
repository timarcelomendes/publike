// Conexões entre quem está na aba Talentos e empresas, comércios e agências, sem precisar de
// vaga: um lado pede, o outro aceita ou recusa. Aceita: os contatos aparecem e abre uma conversa.
// Nos planos, o pedido de uma empresa a um talento já vem com o contato e a conversa aberta (o contato no convite,
// migração 20270626120000), se o talento não desligou.

export type StatusConexao = "pendente" | "aceita" | "recusada";

/** Como está a conexão com uma conta, do meu lado (para os botões). */
export type EstadoConexao = {
  id: string;
  status: StatusConexao;
  pedi: boolean;
  /** pedido pendente com o contato já liberado (o contato no convite) */
  contato?: boolean;
};

/**
 * Por que o contato não veio no pedido: sem o plano, o limite das 24 horas, o talento desligou, o talento ainda está
 * no prazo do aviso (já estava no Publike) ou não se aplica (não é empresa pedindo a um talento visível).
 */
export type MotivoSemContato = "sem_plano" | "limite" | "desligado" | "aviso" | "fora";

export function lerMotivoSemContato(valor: unknown): MotivoSemContato | null {
  return valor === "sem_plano" || valor === "limite" || valor === "desligado" || valor === "aviso" || valor === "fora"
    ? valor
    : null;
}

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
  /** os contatos vêm na conexão aceita ou no pedido com o contato liberado */
  whatsapp: string | null;
  email: string | null;
  ultima_texto: string | null;
  ultima_em: string | null;
  ultima_minha: boolean;
  nao_lidas: number;
  /** pedido pendente com o contato liberado pelo plano de quem pediu: o nome inteiro, os contatos e a conversa */
  contato_liberado: boolean;
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

/** O número do menu: pedidos esperando a minha resposta (as mensagens contam em Conversas). */
export function pendenciasDeConexao(lista: Conexao[]) {
  return lista.filter((c) => c.status === "pendente" && !c.pedi).length;
}

/** A data em que dá para pedir de novo, depois de um pedido recusado. */
export function pedirDeNovoEm(respondidaEm: string | null) {
  if (!respondidaEm) return null;
  return new Date(new Date(respondidaEm).getTime() + DIAS_ESPERA_RECUSA * 24 * 3600 * 1000).toISOString();
}
