import type { Curriculo } from "./tipos";

/**
 * Quanto o currículo está completo e o que falta, na ordem que mais ajuda a combinar com as
 * vagas (página Hoje do painel e cartão da conta na home).
 */
export function forcaDoCurriculo(c: Curriculo | null) {
  const itens: { feito: boolean; dica: string }[] = [
    {
      feito: Boolean(c?.titulo && c.habilidades?.length),
      dica: "Diga o que você faz e as suas habilidades: é o que as empresas veem primeiro.",
    },
    { feito: Boolean(c?.experiencias.length), dica: "Conte onde já trabalhou: é o que quem contrata lê primeiro." },
    { feito: Boolean(c?.disponibilidade.length), dica: "Diga os horários que pode: o % de match usa isso." },
    { feito: Boolean(c?.escolaridade), dica: "Coloque a escolaridade: muitas vagas pedem." },
    { feito: Boolean(c?.cursos.length), dica: "Liste cursos e certificados: contam no % de match." },
    { feito: Boolean(c?.arquivo), dica: "Anexe um PDF, se tiver: quem contrata pode baixar." },
  ];
  const feitos = itens.filter((i) => i.feito).length;
  return {
    pontos: c ? Math.round((100 * (feitos + 1)) / (itens.length + 1)) : 0,
    dica: itens.find((i) => !i.feito)?.dica ?? null,
  };
}
