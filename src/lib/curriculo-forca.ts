import type { Curriculo } from "./tipos";

/** As partes que contam no quanto o currículo está completo. */
export type ParteDoCurriculo = {
  chave: "o-que-faz" | "experiencia" | "horarios" | "estudos" | "cursos" | "pdf";
  feito: boolean;
  dica: string;
};

/**
 * As partes do currículo, feitas ou não, na ordem que mais ajuda a combinar com as vagas. A tela do currículo
 * mostra cada uma ("O que falta"); a página Hoje do painel e o cartão da conta na home, a primeira que falta.
 */
export function partesDoCurriculo(c: Curriculo | null): ParteDoCurriculo[] {
  return [
    {
      chave: "o-que-faz",
      feito: Boolean(c?.titulo && c.habilidades?.length),
      dica: "Diga o que você faz e as suas habilidades: é o que as empresas veem primeiro.",
    },
    {
      chave: "experiencia",
      feito: Boolean(c?.experiencias.length),
      dica: "Conte onde já trabalhou: é o que quem contrata lê primeiro.",
    },
    {
      chave: "horarios",
      feito: Boolean(c?.disponibilidade.length),
      dica: "Diga os horários que pode: o % de match usa isso.",
    },
    { chave: "estudos", feito: Boolean(c?.escolaridade), dica: "Coloque a escolaridade: muitas vagas pedem." },
    { chave: "cursos", feito: Boolean(c?.cursos.length), dica: "Liste cursos e certificados: contam no % de match." },
    { chave: "pdf", feito: Boolean(c?.arquivo), dica: "Anexe um PDF, se tiver: quem contrata pode baixar." },
  ];
}

/**
 * Quanto o currículo está completo e o que falta, na ordem que mais ajuda a combinar com as
 * vagas (página Hoje do painel, cartão da conta na home e a tela do currículo).
 */
export function forcaDoCurriculo(c: Curriculo | null) {
  const itens = partesDoCurriculo(c);
  const feitos = itens.filter((i) => i.feito).length;
  return {
    pontos: c ? Math.round((100 * (feitos + 1)) / (itens.length + 1)) : 0,
    dica: itens.find((i) => !i.feito)?.dica ?? null,
  };
}
