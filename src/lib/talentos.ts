// A aba Talentos: quem procura trabalho e escolheu aparecer. Quem visita vê o resumo;
// empresa, comércio e agência que entraram veem o currículo completo e convidam para uma
// vaga. O contato só aparece no match.

import type { Aderencia } from "./aderencia";

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

/**
 * "3 anos de experiência", "8 meses de experiência", "Tem experiência" (pôs onde trabalhou, mas sem as datas)
 * ou "Primeiro emprego".
 */
export function textoDaExperiencia(meses: number, temCargos = false) {
  if (!meses || meses < 1) return temCargos ? "Tem experiência" : "Primeiro emprego";
  if (meses < 12) return `${meses} ${meses === 1 ? "mês" : "meses"} de experiência`;
  const anos = Math.floor(meses / 12);
  return `${anos} ${anos === 1 ? "ano" : "anos"} de experiência`;
}

/** O que aparece em cima do cartão: o que a pessoa faz ou, sem isso, o último cargo. */
export function tituloDoTalento(t: Pick<TalentoResumo, "titulo" | "cargos">) {
  return t.titulo || t.cargos[0] || "Procura trabalho";
}

// ------------------------------------------------------------------ Para a sua vaga

/**
 * Tem aderência à vaga (11/11/2026, claude/plano-pesos-da-aderencia.md), pelo que o currículo mostra da função
 * (`a.funcao`, antes do perfil da vaga):
 * - vaga de experiência: já trabalhou na função, numa área parecida, estudou na área ou fez um curso dela (0,5 ou
 *   mais). Só as habilidades escritas não bastam, e bater a cidade, o horário e a escolaridade sem nada da função
 *   também não ("Atendente de Copom" para "Analista de sistemas"; o primeiro emprego sem nada da função, 03/11 e
 *   11/11/2026).
 * - vaga de entrada: o mesmo (o relatório do Admin de 11/11/2026 mostrou quase todos os talentos na lista com "70% de
 *   nota"); quem está no primeiro emprego sem nada da função chega pelo aviso de segunda e pelo convite automático.
 * - vaga sem função reconhecida no título: 50% ou mais de nota.
 * Fica de fora quem foi eliminado por uma pergunta e quem não tem algo que a vaga pede (escolaridade, CNH, horário).
 */
export function entraEmParaAVaga(a: Aderencia) {
  if (a.eliminado || a.faltam?.length) return false;
  if (a.funcao == null) return (a.nota ?? 0) >= 50;
  return a.funcao >= 0.5;
}

/**
 * O nível rígido ("Atende a vaga"): nenhum item da vaga que dá para conferir fica de fora (escolaridade, tempo de
 * experiência, CNH, horário, distância: cada um inteiro, nada "em parte") e a nota em 70% ou mais. Na vaga de
 * experiência, também trabalhou na mesma função (não só área parecida, estudo ou curso); na de entrada, a função não
 * precisa bater. O que o currículo não diz ("?") não conta contra.
 */
export function atendeAVaga(a: Aderencia) {
  if (!entraEmParaAVaga(a)) return false;
  if (a.perfil === "experiencia" && a.funcao !== null && a.funcao < 1) return false;
  const falta = a.criterios.some(
    (k) =>
      !k.extra &&
      !(k.funcao && a.perfil === "entrada") &&
      (k.ok === false || (k.ok === true && (k.parte ?? 1) < 1)),
  );
  return !falta && (a.nota ?? 0) >= 70;
}
