// As mensagens de Admin › Convites › Divulgar (23/11/2026): fora do componente do cliente, porque a lista de contatos
// (no servidor) monta a mensagem de cada empresa com a vaga dela.

import { WHATSAPP_OFICIAL } from "@/lib/whatsapp-oficial";

const TEXTO_DO_PUBLICAR = "Olá! Quero publicar uma vaga pelo WhatsApp.";
const LINK_DO_WHATSAPP = `https://wa.me/${WHATSAPP_OFICIAL.numero}?text=${encodeURIComponent(TEXTO_DO_PUBLICAR)}`;
const LINKS = `👉 Pelo WhatsApp: ${LINK_DO_WHATSAPP}\n👉 Pelo site: https://publike.org/publicar`;

/** Para a empresa que anunciou vaga em outro lugar: a vaga dela no começo, quando se sabe. */
export function mensagemParaEmpresa(vaga?: string | null) {
  const v = (vaga ?? "").trim();
  return `Olá! Vi que vocês estão contratando${v ? ` (${v})` : ""}. Sou o Marcelo, do Publike, o site de vagas de Goiânia e Anápolis.

Vocês podem publicar a vaga grátis direto pelo WhatsApp: é só mandar a vaga em texto ou foto, e o Publike monta, publica e já mostra as pessoas prontas para assumir, perto da empresa.

${LINKS}`;
}

export const MENSAGENS_DE_DIVULGAR = [
  {
    id: "empresas",
    nome: "Para empresas que anunciam vaga",
    texto: mensagemParaEmpresa(),
  },
  {
    id: "contabilidades",
    nome: "Para contabilidades",
    texto: `Olá! Sou o Marcelo, do Publike, o site de vagas de Goiânia e Anápolis.

Se algum cliente de vocês precisar contratar, ele pode publicar a vaga grátis direto pelo WhatsApp: é só mandar a vaga em texto ou foto, e o Publike monta, publica e já mostra as pessoas prontas para assumir.

${LINKS}

Se puderem repassar aos clientes, ajuda muito. Obrigado!`,
  },
  {
    id: "gestao",
    nome: "Para gestão de pessoas e RH",
    texto: `Olá! Sou o Marcelo, do Publike, o site de vagas de Goiânia e Anápolis.

Vocês podem publicar as vagas dos seus clientes no Publike, grátis e sem limite de candidatos, e já ver as pessoas prontas para assumir. O jeito mais rápido é pelo WhatsApp: mande a vaga em texto ou foto, e o Publike monta e publica.

Os candidatos chegam no WhatsApp de vocês: quem curte a vaga e é aceito chama direto, e o número não fica exposto no anúncio.

${LINKS}

Qualquer dúvida, é só me chamar.`,
  },
] as const;

/**
 * Para a empresa que chegou ao limite do grátis da Triagem no mês (Admin › Convites › Divulgar › "Chegaram ao limite
 * da Triagem", migração 20270917130000): quem ainda não experimentou ganha a oferta dos 15 dias; quem já experimentou,
 * os preços à venda (sem preço, só o link).
 */
export function mensagemDoLimite(d: {
  gratis: number;
  /** "2026-11" */
  mes: string;
  vaga?: string | null;
  experimentou: boolean;
  precoTriagem: number | null;
  precoPlano: number | null;
}) {
  const [ano, m] = d.mes.split("-").map(Number);
  const nomeMes = (n: number) =>
    new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(ano, n - 1, 15)),
    );
  const reais = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const v = (d.vaga ?? "").trim();
  const precos = [
    d.precoTriagem !== null &&
      `a Triagem sai por ${reais(d.precoTriagem)} por mês`,
    d.precoPlano !== null &&
      `o Plano Empresa, com todos os recursos, por ${reais(d.precoPlano)}`,
  ].filter(Boolean);
  const oferta = !d.experimentou
    ? "Vocês ainda podem experimentar 15 dias grátis, com tudo liberado, e a IA lê todos os candidatos:"
    : precos.length
      ? `Para a IA ler todos os candidatos, ${precos.join(", ou ")}:`
      : "Para a IA ler todos os candidatos:";
  return `Olá! Sou o Marcelo, do Publike. Vi que a Triagem com IA já leu os ${d.gratis} candidatos grátis de ${nomeMes(m)} nas vagas de vocês${v ? ` (${v})` : ""}.

A Triagem lê todos os currículos e separa quem atende os requisitos da vaga, sem olhar nome, foto ou contato. Quem decide são vocês.

${oferta}
👉 https://publike.org/painel/copiloto

Em ${nomeMes(m === 12 ? 1 : m + 1)}, os ${d.gratis} grátis voltam. Qualquer dúvida, é só me chamar.`;
}
