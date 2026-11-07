// A vaga aberta ao lado da lista (Lista + detalhes, na vitrine): o que a rota /api/vaga/[id] devolve.

/** O que o painel "Lista + detalhes" mostra de um anúncio (já em texto, pronto para a tela). */
export type DetalheDaLista = {
  id: string;
  vaga: boolean;
  titulo: string;
  autor: { id: string; nome: string; conta: string; verificado: boolean; agencia: boolean };
  selos: string[];
  lugar: string;
  lugarAproximado: boolean;
  valor: string;
  ganhos: string[];
  contratante: string | null;
  contratacao: string | null;
  jornada: string | null;
  atende: string | null;
  horario: string | null;
  beneficios: string[];
  requisitos: string[];
  pessoas: number;
  publicado: string;
  noAr: string;
  preenchida: boolean;
  descricao: string;
};
