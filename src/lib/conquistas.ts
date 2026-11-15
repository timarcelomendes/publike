// As conquistas: o "comecei a trabalhar" que nasce do match (claude/plano-posts-e-conquistas.md, parte 2; migração
// 20270322120000).

/** Uma conquista no feed: primeiro nome e inicial, a vaga, a empresa e o bairro; `confirmada`: a empresa confirmou. */
export type Conquista = {
  anuncio_id: string;
  perfil_id: string;
  pessoa_nome: string;
  pessoa_foto: string | null;
  pessoa_tipo: string;
  categoria: string;
  bairro: string | null;
  cidade: string;
  empresa_id: string;
  empresa_nome: string;
  empresa_foto: string | null;
  titulo: string;
  /** a empresa confirmou (o selo "Confirmado pela empresa") */
  confirmada: boolean;
  parabens: number;
  dei_parabens: boolean;
  minha: boolean;
  quando: string;
};

/** O que a pessoa tem para responder: "Deu certo?" (resposta null) ou "Mostrar no Publike?" ("comecei"). */
export type ConquistaPendente = {
  anuncio_id: string;
  titulo: string;
  empresa_nome: string;
  resposta: string | null;
  categoria: string;
};

/** Quem disse que começou numa vaga da conta, esperando a confirmação. */
export type ConquistaParaConfirmar = {
  anuncio_id: string;
  perfil_id: string;
  titulo: string;
  nome: string;
  foto: string | null;
  respondida_em: string;
  /**
   * confirmar: a pessoa disse que começou; comecou: a empresa pôs em Contratado há 7 dias e o Publike pergunta;
   * chamaria: depois do sim, "Chamaria de novo?" (migração 20270526120000)
   */
  pergunta?: "confirmar" | "comecou" | "chamaria" | string;
};

/** "A empresa te respondeu?" (migração 20270526120000): 2 dias depois do contato numa vaga. */
export type PerguntaDeResposta = {
  anuncio_id: string;
  titulo: string;
  empresa_nome: string;
  perguntas: number;
};
