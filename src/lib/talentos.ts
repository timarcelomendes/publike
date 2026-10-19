// A aba Talentos: quem procura trabalho e escolheu aparecer. Quem visita vê o resumo;
// empresa, comércio e agência que entraram veem o currículo completo e convidam para uma
// vaga. O contato só aparece no match.

/** No máximo, quantas habilidades no currículo (o banco confere de novo). */
export const MAX_HABILIDADES = 15;

/** Sugestões para tocar e pôr nas habilidades (dá para escrever outras). */
export const HABILIDADES_SUGERIDAS = [
  "Atendimento ao cliente",
  "Vendas",
  "Caixa",
  "Cozinha",
  "Limpeza",
  "Organização",
  "Estoque",
  "Informática básica",
  "Excel",
  "Direção",
  "Pontualidade",
  "Trabalho em equipe",
  "Cuidar de crianças",
  "Cuidar de idosos",
  "Manutenção",
  "Liderança",
] as const;

/** Quantos talentos por página na aba. */
export const TALENTOS_POR_PAGINA = 24;

/** Até onde dá para ir nas páginas (o banco também limita): ninguém copia a aba inteira. */
export const MAX_PAGINAS_TALENTOS = 10;

/** O resumo de uma pessoa na aba (o mesmo para todos). */
export type TalentoResumo = {
  perfil_id: string;
  nome: string;
  cidade: string;
  bairro: string | null;
  titulo: string | null;
  habilidades: string[];
  cursos: string[];
  escolaridade: string | null;
  cnh: string | null;
  disponibilidade: string[];
  cargos: string[];
  meses_experiencia: number;
  atualizado_em: string;
};

/** "3 anos de experiência", "8 meses de experiência" ou "Primeiro emprego". */
export function textoDaExperiencia(meses: number) {
  if (!meses || meses < 1) return "Primeiro emprego";
  if (meses < 12) return `${meses} ${meses === 1 ? "mês" : "meses"} de experiência`;
  const anos = Math.floor(meses / 12);
  return `${anos} ${anos === 1 ? "ano" : "anos"} de experiência`;
}

/** O que aparece em cima do cartão: o que a pessoa faz ou, sem isso, o último cargo. */
export function tituloDoTalento(t: Pick<TalentoResumo, "titulo" | "cargos">) {
  return t.titulo || t.cargos[0] || "Procura trabalho";
}
