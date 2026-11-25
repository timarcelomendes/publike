// Publicar pelo WhatsApp (19/11/2026; migração 20270806120000): os textos das respostas, com o padrão e o que dá para
// mudar em Admin › Publicar pelo WhatsApp. Vale no navegador (o Admin) e no servidor (o atendimento).

import type { RascunhoConvite } from "./convites";
import { faltaNaVaga, juntarComE, linhaDaVaga, resumoDaVaga } from "./leitura-de-vagas";

export type ChaveTextoVagas =
  | "intro"
  | "fim"
  | "botao"
  | "lote"
  | "botao_lote"
  | "nao_e_vaga"
  | "curriculo"
  | "servico"
  | "golpe"
  | "no_ar"
  | "oferta";

/** Cada texto: o padrão, onde aparece, as marcas que ele aceita e o tamanho (os botões vão até 20 letras). */
export const TEXTOS_VAGAS: Record<
  ChaveTextoVagas,
  { padrao: string; nome: string; ajuda: string; marcas?: string[]; max: number }
> = {
  intro: {
    padrao: "Pronto! Preparei a sua vaga:",
    nome: "Antes do resumo (uma vaga)",
    ajuda: "Logo depois vem o resumo da vaga lida: o cargo, o salário, o horário, o lugar e os benefícios.",
    max: 200,
  },
  lote: {
    padrao: "Achei {n} vagas no anúncio:",
    nome: "Antes da lista (várias vagas)",
    ajuda: "Logo depois vem a lista das vagas, uma por linha.",
    marcas: ["{n}"],
    max: 200,
  },
  fim: {
    padrao: "Confira, ajuste o que precisar e publique. É grátis e leva um minuto.",
    nome: "Depois do resumo",
    ajuda: "Antes, quando o anúncio não diz, vai o que falta (o salário, o bairro, o horário).",
    max: 300,
  },
  botao: { padrao: "Conferir e publicar", nome: "Botão (uma vaga)", ajuda: "Abre o publicar já preenchido.", max: 20 },
  botao_lote: {
    padrao: "Ver as vagas",
    nome: "Botão (várias vagas)",
    ajuda: "Abre a página com as vagas do anúncio, cada uma com o seu “Conferir e publicar”.",
    max: 20,
  },
  nao_e_vaga: {
    padrao:
      "Não achei uma vaga nessa mensagem. Para eu preparar a sua vaga, mande a foto do anúncio ou escreva o cargo, o salário, o horário e o bairro.",
    nome: "Quando não é vaga",
    ajuda: "A foto ou o texto não tinha um anúncio de vaga.",
    max: 400,
  },
  curriculo: {
    padrao:
      "Isso parece um currículo. Para as empresas acharem você, cadastre o currículo no Publike: dá para enviar o PDF ou uma foto, e o site preenche tudo para você conferir.",
    nome: "Quando é um currículo",
    ajuda: "Vai com o botão “Fazer meu currículo”.",
    max: 400,
  },
  servico: {
    padrao:
      "Isso parece o anúncio de um serviço. No Publike, quem oferece serviço monta a vitrine de graça, e quem precisa chama no WhatsApp.",
    nome: "Quando é um serviço",
    ajuda: "Vai com o botão “Montar a vitrine”.",
    max: 400,
  },
  golpe: {
    padrao:
      "Esse anúncio pede pagamento para começar ou tem sinais de golpe, e o Publike não publica. Se a vaga é de verdade, mande os detalhes do trabalho: o cargo, o salário, o horário e o local.",
    nome: "Quando parece golpe",
    ajuda: "Pede taxa, curso pago ou Pix para começar, ou promete ganho fácil sem dizer o trabalho.",
    max: 400,
  },
  no_ar: {
    padrao: "Sua vaga *{titulo}* está no ar! Quando alguém se candidatar, você vê no painel do Publike.",
    nome: "Depois de publicar",
    ajuda: "Sai uma vez, com o botão “Ver a vaga”, se a empresa falou com o Publike nas últimas 23 horas (a regra da Meta).",
    marcas: ["{titulo}"],
    max: 400,
  },
  oferta: {
    padrao:
      "Quer receber os candidatos desta vaga aqui no WhatsApp do Publike? Para parar quando quiser, é só responder PARAR.",
    nome: "A oferta dos avisos",
    ajuda: "Vai com os botões “Sim, quero receber” e “Agora não”. O toque no “Sim” é o aceite que a Meta pede.",
    max: 400,
  },
};

export const CHAVES_TEXTOS_VAGAS = Object.keys(TEXTOS_VAGAS) as ChaveTextoVagas[];

/** O texto que vale (o do Admin ou o padrão), com as marcas trocadas ("{n}" → "3"). */
export function textoDasVagas(
  personalizados: Partial<Record<string, string>> | null | undefined,
  chave: ChaveTextoVagas,
  marcas: Record<string, string | number> = {},
) {
  const proprio = personalizados?.[chave];
  const base = typeof proprio === "string" && proprio.trim() ? proprio.trim() : TEXTOS_VAGAS[chave].padrao;
  return Object.entries(marcas)
    .reduce((t, [k, v]) => t.split(`{${k}}`).join(String(v)), base)
    .slice(0, TEXTOS_VAGAS[chave].max);
}

/**
 * O fim da vaga preparada que dá para publicar aqui (migração 20270914120000), antes dos botões "Sim, publicar",
 * "Conferir no site" e "Procuro emprego".
 */
export const FIM_PUBLICAR_AQUI =
  "Posso publicar assim? É grátis. Para mudar alguma coisa antes, toque em *Conferir no site*. Ao publicar, você concorda com as regras do Publike: publike.org/regras";

/**
 * O lugar perguntado na conversa (migração 20270916150000): todas as perguntas do lugar levam esta marca, e a resposta
 * seguinte da pessoa é lida como o lugar (`lugarDaResposta`).
 */
export const MARCA_DO_LUGAR = /para publicar aqui mesmo/i;

/** A vaga ainda sem o bairro ou sem a cidade (não dá para publicar aqui). */
export function semLugar(v: RascunhoConvite) {
  return !(v.bairro ?? "").trim() || !(v.cidade ?? "").trim();
}

/**
 * As vagas do mesmo anúncio ficam no mesmo lugar: quando as que dizem o lugar dizem o mesmo (um bairro e uma cidade),
 * as que não dizem ficam com ele. Com lugares diferentes, nada muda.
 */
export function lugarDoLote(vagas: RascunhoConvite[]): RascunhoConvite[] {
  if (vagas.length < 2) return vagas;
  const chave = (x: string) => x.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const unicos = (lista: string[]) => [...new Map(lista.map((x) => [chave(x), x.trim()])).values()];
  const bairros = unicos(vagas.map((v) => v.bairro ?? "").filter((x) => x.trim()));
  const cidades = unicos(vagas.map((v) => v.cidade ?? "").filter((x) => x.trim()));
  // o anúncio de fora (src/lib/fora-da-regiao.ts): as vagas sem lugar ficam de fora também, se nenhuma é daqui
  const foras = unicos(vagas.map((v) => v.fora ?? "").filter((x) => x.trim()));
  if (foras.length === 1 && !cidades.length)
    return vagas.map((v) => (v.fora || (v.bairro ?? "").trim() ? v : { ...v, fora: foras[0] }));
  if (bairros.length > 1 || cidades.length > 1) return vagas;
  return vagas.map((v) => ({
    ...v,
    bairro: (v.bairro ?? "").trim() || bairros[0] || v.bairro,
    cidade: (v.cidade ?? "").trim() || cidades[0] || v.cidade,
  }));
}

/**
 * O que a pergunta do lugar pediu (`perguntaDoLugar`), para ler a resposta (src/lib/lugar-da-resposta.ts): só a
 * cidade, só o bairro, ou os dois.
 */
export function contextoDoLugar(vagas: RascunhoConvite[]): "cidade" | "bairro" | "lugar" {
  const bairros = [...new Set(vagas.map((v) => (v.bairro ?? "").trim()).filter(Boolean))];
  const cidades = [...new Set(vagas.map((v) => (v.cidade ?? "").trim()).filter(Boolean))];
  if (vagas.every((v) => (v.bairro ?? "").trim()) && bairros.length === 1) return "cidade";
  if (vagas.every((v) => (v.cidade ?? "").trim()) && cidades.length === 1) return "bairro";
  return "lugar";
}

/** A pergunta do lugar, pelo que falta: só a cidade, só o bairro, ou os dois. */
export function perguntaDoLugar(vagas: RascunhoConvite[]) {
  const bairros = [...new Set(vagas.map((v) => (v.bairro ?? "").trim()).filter(Boolean))];
  const cidades = [...new Set(vagas.map((v) => (v.cidade ?? "").trim()).filter(Boolean))];
  const todasComBairro = vagas.every((v) => (v.bairro ?? "").trim());
  const todasComCidade = vagas.every((v) => (v.cidade ?? "").trim());
  if (todasComBairro && bairros.length === 1)
    return `Para publicar aqui mesmo, só falta a cidade: ${bairros[0]} fica em qual cidade? Por exemplo: _Goiânia_.`;
  if (todasComCidade && cidades.length === 1)
    return `Para publicar aqui mesmo, só falta o bairro: em que bairro ou setor de ${cidades[0]} fica o trabalho? Por exemplo: _Setor Bueno_.`;
  return "Para publicar aqui mesmo, só falta o lugar: em que bairro e cidade fica o trabalho? Por exemplo: _Setor Bueno, Goiânia_.";
}

/** A mensagem com botão da Meta vai até 1.024 letras (o atendimento corta em 1.000, no fim de uma frase). */
const MAX_MENSAGEM = 1000;

/**
 * A resposta com as vagas lidas: o texto e o botão. Uma vaga: o resumo e o que faltou; várias: uma linha por vaga, com
 * o botão da página do lote. `total`: quantas vagas o anúncio tinha (passou do limite do Admin, avisa). `comeco`: a
 * apresentação, na primeira mensagem para a pessoa ("Oi, Rita! 👋 Aqui é o Marcelo, do Publike."). O atendimento manda
 * esta resposta e o Admin mostra a mesma na prévia.
 */
export function respostaDasVagas(
  personalizados: Partial<Record<string, string>> | null | undefined,
  vagas: RascunhoConvite[],
  total = vagas.length,
  comeco = "",
  /** o que a pessoa já disse e a leitura não guarda (o salário "a combinar", nas 3 perguntas): sai do "Faltou dizer" */
  jaDisse: string[] = [],
  /**
   * publicar aqui mesmo, com os botões "Sim, publicar" e "Conferir no site" (migração 20270914120000): o fim pergunta se
   * pode publicar assim, no lugar do "Confira, ajuste e publique"
   */
  {
    publicarAqui = false,
    perguntarLugar = false,
  }: {
    publicarAqui?: boolean;
    /**
     * a foto não disse o bairro ou a cidade (migração 20270916150000): no lugar da pergunta "Posso publicar assim?",
     * a pergunta do lugar (`perguntaDoLugar`), e o que falta fica sem o lugar
     */
    perguntarLugar?: boolean;
  } = {},
): { texto: string; botao: string; lote: boolean } {
  const t = (k: ChaveTextoVagas, marcas?: Record<string, string | number>) => textoDasVagas(personalizados, k, marcas);
  const ola = comeco.trim();
  const sobrou =
    total > vagas.length
      ? `O anúncio tem ${total} vagas: preparei ${vagas.length === 1 ? "a primeira" : `as ${vagas.length} primeiras`}. Para as outras, mande uma foto só da parte que falta.`
      : "";
  const caber = (partes: string[]) => {
    const texto = partes.filter(Boolean).join("\n\n");
    return texto.length <= MAX_MENSAGEM ? texto : null;
  };
  // perguntando o lugar, ele não entra no "Faltou dizer"
  const semOLugar = (f: string) => !perguntarLugar || !f.startsWith("o bairro");
  const aqui = publicarAqui || perguntarLugar;
  if (vagas.length === 1) {
    const v = vagas[0];
    const falta = faltaNaVaga(v).filter((f) => !jaDisse.includes(f) && semOLugar(f));
    const faltou = falta.length
      ? aqui
        ? `Faltou dizer ${juntarComE(falta)}.${falta.includes("o salário") ? " Se publicar assim, o salário sai como a combinar." : ""}`
        : `Faltou dizer ${juntarComE(falta)}: você completa quando conferir.`
      : "";
    const fim = perguntarLugar ? perguntaDoLugar(vagas) : publicarAqui ? FIM_PUBLICAR_AQUI : t("fim");
    const resumo = resumoDaVaga(v);
    // passou de 1.024 letras: sem os benefícios e o que a vaga pede (aparecem no publicar), e por fim cortado
    const curto = resumo
      .split("\n")
      .filter((l) => !/^(Benefícios|Pede):/.test(l))
      .join("\n");
    const texto =
      caber([ola, t("intro"), resumo, faltou, sobrou, fim]) ??
      caber([ola, t("intro"), curto, faltou, sobrou, fim]) ??
      `${[ola, t("intro"), curto, faltou, fim].filter(Boolean).join("\n\n").slice(0, MAX_MENSAGEM - 1)}…`;
    return { texto, botao: t("botao"), lote: false };
  }
  const linhas = vagas.map(linhaDaVaga);
  // publicar aqui o lote (migração 20270916140000): o que falta em cada vaga e a pergunta, no lugar do link
  const fimLote = perguntarLugar
    ? perguntaDoLugar(vagas)
    : publicarAqui
      ? FIM_PUBLICAR_AQUI.replace("Posso publicar assim?", `Posso publicar ${vagas.length === 2 ? "as duas" : `as ${vagas.length}`} assim?`)
      : t("fim");
  const faltas = aqui
    ? vagas
        .map((v) => ({ v, falta: faltaNaVaga(v).filter((f) => !jaDisse.includes(f) && semOLugar(f)) }))
        .filter((x) => x.falta.length)
        .map((x) => `Em ${x.v.titulo}, faltou dizer ${juntarComE(x.falta)}.${x.falta.includes("o salário") ? " Sai como a combinar." : ""}`)
        .join("\n")
    : "";
  let texto = caber([ola, t("lote", { n: vagas.length }), linhas.join("\n"), faltas, sobrou, fimLote]);
  // muitas linhas longas: as primeiras e "e mais N" (todas aparecem na página do lote)
  for (let n = linhas.length - 1; !texto && n >= 1; n--)
    texto = caber([
      ola,
      t("lote", { n: vagas.length }),
      `${linhas.slice(0, n).join("\n")}\ne mais ${linhas.length - n}`,
      sobrou,
      fimLote,
    ]);
  return {
    texto: texto ?? `${[ola, t("lote", { n: vagas.length })].filter(Boolean).join("\n\n").slice(0, MAX_MENSAGEM - 1)}…`,
    botao: t("botao_lote"),
    lote: true,
  };
}

/** Os limites dos números que se ajustam (o banco corta no que passar). */
export const LIMITES_VAGAS_WHATSAPP = {
  por_mensagem: { padrao: 10, faixa: [1, 10] },
  leituras_dia: { padrao: 10, faixa: [1, 50] },
} as const;

/** O link que a mensagem leva (o publicar preenchido, ou a página do lote), com a origem para o Admin › Campanhas. */
export function caminhoDaVagaDoWhatsapp(token: string, lote = false) {
  const origem = "utm_source=whatsapp&utm_campaign=publicar-pelo-whatsapp";
  return lote ? `/publicar/whatsapp/${token}?${origem}` : `/publicar?whatsapp=${token}&${origem}`;
}

/** O texto que já vem escrito na conversa (o "Mandar pelo WhatsApp" do site). */
export const TEXTO_PRONTO_DO_WHATSAPP = "Olá! Quero publicar uma vaga no Publike.";
