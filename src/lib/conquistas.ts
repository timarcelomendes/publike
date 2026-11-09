// As conquistas: o "comecei a trabalhar" que nasce do match (claude/plano-posts-e-conquistas.md, parte 2; migração
// 20270322120000).

/** Uma conquista no feed: primeiro nome e inicial, a área e o bairro; a empresa e a vaga só com a confirmação dela. */
export type Conquista = {
  anuncio_id: string;
  perfil_id: string;
  pessoa_nome: string;
  pessoa_foto: string | null;
  pessoa_tipo: string;
  categoria: string;
  bairro: string | null;
  cidade: string;
  empresa_id: string | null;
  empresa_nome: string | null;
  empresa_foto: string | null;
  titulo: string | null;
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
};
