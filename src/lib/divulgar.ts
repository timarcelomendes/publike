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
  { id: "empresas", nome: "Para empresas que anunciam vaga", texto: mensagemParaEmpresa() },
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

${LINKS}

Qualquer dúvida, é só me chamar.`,
  },
] as const;

