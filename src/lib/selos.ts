// Os selos de reputação de quem publica vaga (25/11/2026, migração 20271004120000; Marcelo: "Preciso dar destaque aos
// anúncios das empresas, agências e anunciantes que respondem rápido, tem boa reputação"; escolhas "Selo e sobe na
// lista" e, para quem anuncia como pessoa, sem CNPJ, "Histórico no Publike"). O banco faz a conta
// (privado.selos_calculados, refeita a cada meia hora); aqui ficam os textos, os pontos da linha do tempo e o que falta
// no painel, sem nada do servidor (o cartão, a vaga, o perfil, o painel e os testes usam).
//
// - Responde rápido: quem se candidatou confirma ("A empresa te respondeu?": 7 de cada 10 dizem sim, com 3 respostas
//   ou mais, nos últimos 90 dias), ou quem publicou responde 7 de cada 10 candidaturas pelo Publike, em geral em até
//   2 dias, a maior parte com alguém clicando, e entra pelo menos uma vez por semana. Some com o "Ainda está aberta?"
//   sem resposta.
// - Bem avaliada: nota do processo seletivo 4,5 ou mais, com 3 avaliações ou mais.
// - Contratou pelo Publike: quem foi contratado confirmou que começou, ou quem publicou contou quem contratou (está em
//   Contratados) e a pessoa não disse "Não deu certo" (migração 20271006120000).
// - Denúncia confirmada (90 dias) ou conta suspensa: sem selo nenhum.

import { formatarNumero, plural } from "./formato";

export type Selos = {
  respondeRapido: boolean;
  /** de onde veio o "Responde rápido": quem se candidatou confirmou (pessoas) ou as respostas pelo Publike (painel) */
  respondePor: "pessoas" | "painel" | null;
  bemAvaliada: boolean;
  nota: number | null;
  avaliacoes: number;
  /** quantas pessoas foram contratadas pelo Publike (a pessoa confirmou, ou está em Contratados sem "Não deu certo") */
  contratou: number;
};

const numero = (x: unknown) => (x === null || x === undefined || x === "" ? null : Number(x));

/** Uma linha de `selos_das_vagas` ou `selos_das_contas`. */
export function selosDoBanco(r: {
  responde_rapido: boolean | null;
  responde_por: string | null;
  bem_avaliada: boolean | null;
  nota: number | string | null;
  avaliacoes: number | null;
  contratou: number | null;
}): Selos {
  return {
    respondeRapido: Boolean(r.responde_rapido),
    respondePor: r.responde_por === "pessoas" || r.responde_por === "painel" ? r.responde_por : null,
    bemAvaliada: Boolean(r.bem_avaliada),
    nota: numero(r.nota),
    avaliacoes: Number(r.avaliacoes ?? 0),
    contratou: Number(r.contratou ?? 0),
  };
}

export const temSelos = (s: Selos | null | undefined): s is Selos =>
  Boolean(s && (s.respondeRapido || s.bemAvaliada || s.contratou > 0));

export type ChaveDoSelo = "responde" | "avaliada" | "contratou";

export type SeloVisivel = {
  chave: ChaveDoSelo;
  texto: string;
  /** no tíquete da linha do tempo, que é estreito: "4,7" no lugar de "Bem avaliada · 4,7" (com a estrela) */
  curto: string;
  explicacao: string;
};

/** A nota com vírgula: 4,7. */
export const notaComVirgula = (n: number) => n.toFixed(1).replace(".", ",");

/** "de cada 10": 0,75 → 8. */
const deCada10 = (parte: number) => Math.round(parte * 10);

/** "todas as" ou "8 de cada 10" (antes de "candidaturas"). */
const quantasDeCada10 = (parte: number) => (deCada10(parte) >= 10 ? "todas as" : `${deCada10(parte)} de cada 10`);

function prazo(horas: number) {
  if (horas < 24) return "no mesmo dia";
  if (horas < 48) return "em 1 dia";
  return `em ${Math.round(horas / 24)} dias`;
}

/** Quem publicou, no texto: a empresa, a agência, o comércio ou, para pessoa, quem publicou. */
function quem(tipo: string | null | undefined) {
  if (tipo === "agencia") return { o: "a agência", O: "A agência" };
  if (tipo === "comercio") return { o: "o comércio", O: "O comércio" };
  if (tipo === "pessoa") return { o: "quem publicou", O: "Quem publicou" };
  return { o: "a empresa", O: "A empresa" };
}

/** Os selos que aparecem (na ordem: responde, avaliada, contratou), com a explicação do balão. */
export function selosVisiveis(s: Selos | null | undefined, tipo?: string | null): SeloVisivel[] {
  if (!temSelos(s)) return [];
  const q = quem(tipo);
  const lista: SeloVisivel[] = [];
  if (s.respondeRapido)
    lista.push({
      chave: "responde",
      texto: "Responde rápido",
      curto: "Responde rápido",
      explicacao:
        s.respondePor === "painel"
          ? `${q.O} responde 7 de cada 10 candidaturas ou mais pelo Publike, em geral em até 2 dias.`
          : `Quem se candidatou confirmou: 7 de cada 10 ou mais disseram que ${q.o} respondeu, nos últimos 90 dias.`,
    });
  if (s.bemAvaliada && s.nota !== null)
    lista.push({
      chave: "avaliada",
      texto: `Bem avaliada · ${notaComVirgula(s.nota)}`,
      curto: notaComVirgula(s.nota),
      explicacao: `Nota ${notaComVirgula(s.nota)} de 5 no processo seletivo, em ${plural(s.avaliacoes, "avaliação", "avaliações")} de quem se candidatou.`,
    });
  if (s.contratou > 0)
    lista.push({
      chave: "contratou",
      texto: s.contratou === 1 ? "Contratou pelo Publike" : `Contratou ${formatarNumero(s.contratou)} pelo Publike`,
      curto: "Contratou pelo Publike",
      explicacao:
        s.contratou === 1
          ? "Uma pessoa que se candidatou pelo Publike foi contratada aqui."
          : `${formatarNumero(s.contratou)} pessoas que se candidataram pelo Publike foram contratadas aqui.`,
    });
  return lista;
}

/**
 * A linha do tempo ("Relevantes", src/lib/relevancia.ts): quem tem selo sobe um pouco, sem passar na frente do que está
 * mais perto (até 30) ou combina mais com o currículo (até 35).
 */
export function pontosDosSelos(s: Selos | null | undefined) {
  if (!s) return 0;
  return (s.respondeRapido ? 8 : 0) + (s.bemAvaliada ? 5 : 0) + (s.contratou > 0 ? 3 : 0);
}

// ------------------------------------------------------------------------------------------------ o painel

/** A conta ao vivo de quem está no painel (`meus_selos`), com os números do que falta. */
export type SituacaoDosSelos = Selos & {
  teSim: number;
  teAindaNao: number;
  respostaTaxa: number | null;
  respostaHoras: number | null;
  respostaAutomaticas: number | null;
  parado: boolean | null;
  semResposta: number;
  denuncia: boolean;
  suspensa: boolean;
  contratouTotal: number;
  vagasNoAr: number;
};

export function situacaoDosSelosDoBanco(j: unknown): SituacaoDosSelos | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  return {
    ...selosDoBanco({
      responde_rapido: Boolean(o.responde_rapido),
      responde_por: typeof o.responde_por === "string" ? o.responde_por : null,
      bem_avaliada: Boolean(o.bem_avaliada),
      nota: numero(o.nota),
      avaliacoes: numero(o.avaliacoes),
      contratou: numero(o.contratou),
    }),
    teSim: numero(o.te_sim) ?? 0,
    teAindaNao: numero(o.te_ainda_nao) ?? 0,
    respostaTaxa: numero(o.resposta_taxa),
    respostaHoras: numero(o.resposta_horas),
    respostaAutomaticas: numero(o.resposta_automaticas),
    parado: o.parado === null || o.parado === undefined ? null : Boolean(o.parado),
    semResposta: numero(o.sem_resposta) ?? 0,
    denuncia: Boolean(o.denuncia),
    suspensa: Boolean(o.suspensa),
    contratouTotal: numero(o.contratou_total) ?? 0,
    vagasNoAr: numero(o.vagas_no_ar) ?? 0,
  };
}

export type ItemDosSelos = {
  chave: ChaveDoSelo;
  titulo: string;
  ganho: boolean;
  texto: string;
  link?: { href: string; texto: string };
};

/** No painel: cada selo, se já tem e, se não, o que falta (com os números da conta). */
export function oQueFalta(s: SituacaoDosSelos): ItemDosSelos[] {
  // a denúncia confirmada e a suspensão tiram todos
  const bloqueio = s.suspensa
    ? "Com a conta suspensa, os selos não aparecem."
    : s.denuncia
      ? "Uma denúncia confirmada nos últimos 90 dias tira os selos."
      : null;

  // Responde rápido
  let responde: ItemDosSelos;
  if (s.respondeRapido) {
    const total = s.teSim + s.teAindaNao;
    responde = {
      chave: "responde",
      titulo: "Responde rápido",
      ganho: true,
      texto:
        s.respondePor === "pessoas" && total > 0
          ? `${deCada10(s.teSim / total)} de cada 10 pessoas que se candidataram disseram que você respondeu.`
          : `Você responde ${quantasDeCada10(s.respostaTaxa ?? 0.7)} candidaturas pelo Publike${
              s.respostaHoras !== null ? `, em geral ${prazo(s.respostaHoras)}` : ""
            }.`,
    };
  } else {
    const partes: string[] = [];
    let link: ItemDosSelos["link"];
    if (bloqueio) partes.push(bloqueio);
    else {
      if (s.semResposta > 0) {
        partes.push(
          `${s.semResposta === 1 ? "Uma vaga está" : `${formatarNumero(s.semResposta)} vagas estão`} com o "Ainda está aberta?" sem resposta. Enquanto isso, o selo não aparece.`,
        );
        link = { href: "/painel/anuncios?tipo=vaga", texto: "Responder nas suas vagas" };
      }
      // o que quem se candidatou disse
      const total = s.teSim + s.teAindaNao;
      if (total === 0)
        partes.push(
          "Dois dias depois de cada contato, o Publike pergunta a quem se candidatou se você respondeu. Com 3 respostas e 7 de cada 10 dizendo que sim, o selo aparece.",
        );
      else if (total < 3)
        partes.push(
          `Até agora, ${plural(total, "pessoa respondeu", "pessoas responderam")} (${formatarNumero(s.teSim)} ${s.teSim === 1 ? "disse" : "disseram"} que sim). Com 3 respostas e 7 de cada 10 dizendo que sim, o selo aparece.`,
        );
      else
        partes.push(
          `Das ${formatarNumero(total)} pessoas que responderam, ${formatarNumero(s.teSim)} ${s.teSim === 1 ? "disse" : "disseram"} que você respondeu. Para o selo, 7 de cada 10 precisam dizer que sim.`,
        );
      // as respostas pelo Publike (o outro caminho)
      if (s.respostaTaxa !== null) {
        if ((s.respostaAutomaticas ?? 0) >= 0.5)
          partes.push("Pelo Publike, a maior parte das respostas é automática (como a do contato direto), e essas não contam.");
        else if (s.parado)
          partes.push("Entre no Publike pelo menos uma vez por semana: sem entrar, as respostas pelo Publike não dão o selo.");
        else
          partes.push(
            `Pelo Publike, você responde ${deCada10(s.respostaTaxa)} de cada 10 candidaturas${
              s.respostaHoras !== null ? `, em geral ${prazo(s.respostaHoras)}` : ""
            }. Com 7 de cada 10 em até 2 dias, o selo também vem.`,
          );
      }
    }
    responde = { chave: "responde", titulo: "Responde rápido", ganho: false, texto: partes.join(" "), link };
  }

  // Bem avaliada
  const avaliada: ItemDosSelos = s.bemAvaliada
    ? {
        chave: "avaliada",
        titulo: "Bem avaliada",
        ganho: true,
        texto: `Nota ${notaComVirgula(s.nota ?? 5)} em ${plural(s.avaliacoes, "avaliação", "avaliações")} do seu processo seletivo.`,
      }
    : {
        chave: "avaliada",
        titulo: "Bem avaliada",
        ganho: false,
        texto:
          bloqueio ??
          (s.avaliacoes === 0 || s.nota === null
            ? "Ainda sem avaliações. Quem se candidata pode avaliar o seu processo seletivo depois da resposta. Com 3 avaliações e nota 4,5 ou mais, o selo aparece."
            : `Nota ${notaComVirgula(s.nota)} em ${plural(s.avaliacoes, "avaliação", "avaliações")}. Para o selo: nota 4,5 ou mais, com 3 avaliações ou mais.`),
      };

  // Contratou pelo Publike
  const contratou: ItemDosSelos =
    s.contratou > 0
      ? {
          chave: "contratou",
          titulo: "Contratou pelo Publike",
          ganho: true,
          texto:
            s.contratou === 1
              ? "Uma pessoa que se candidatou pelo Publike foi contratada por você."
              : `${formatarNumero(s.contratou)} pessoas que se candidataram pelo Publike foram contratadas por você.`,
        }
      : {
          chave: "contratou",
          titulo: "Contratou pelo Publike",
          ganho: false,
          texto:
            bloqueio ??
            "Conte quem você contratou: responda o “Quem você contratou?” que chega por e-mail e no WhatsApp, ou ponha a pessoa em Contratados. Se ela não disser que não deu certo, o selo aparece.",
        };

  return [responde, avaliada, contratou];
}
