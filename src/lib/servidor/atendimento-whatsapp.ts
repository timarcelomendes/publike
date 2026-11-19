import "server-only";
import { textoDaAjuda } from "@/lib/ajuda";
import { BAIRROS } from "@/lib/bairros";
import { SITE_URL } from "@/lib/config";
import { CATEGORIAS, CIDADES, LIMITES_CONTA, type Cidade } from "@/lib/constantes";
import { formatarLugar, valorDoAnuncio } from "@/lib/formato";
import { modeloPara } from "@/lib/ia/funcionalidades";
import { chamarIA, iaConfigurada, lerJson } from "@/lib/ia/openai";
import { falaDisponivel, transcrever } from "@/lib/ia/transcrever";
import { comOrigem } from "@/lib/origem";
import { ONDE_FUNCIONA } from "@/lib/pracas";
import { chaveBairro, chavesDaRegiao, criarLocal, pontoDoLocal, type Local } from "@/lib/regioes";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { criarClientePublico } from "@/lib/supabase/servidor";
import type { Json } from "@/lib/supabase/tipos-banco";
import {
  baixarMidia,
  enviarComBotoes,
  enviarComLink,
  enviarTexto,
  marcarLidaDigitando,
  type ConfigMeta,
} from "./whatsapp";
import { configVagasWhatsapp, deveTentarVaga, respostaDaOferta, tentarVagaPeloWhatsapp } from "./vaga-pelo-whatsapp";

// O atendimento pelo WhatsApp (18/11/2026, claude/plano-whatsapp-atendimento.md; migrações 20270801120000,
// 20270803120000 e 20270805120000). Pedido do Marcelo: "Quero automatizar o atendimento do WhatsApp, explicar aos
// interessados sobre o Publike". Quem escreve para o número da API (quase sempre vindo de um anúncio de clique para o
// WhatsApp no Instagram) recebe a resposta do Publike. Quando a pessoa pede alguém, a IA não sabe ou o número passa das
// respostas do dia, a conversa passa para a equipe (Admin › WhatsApp › Conversas e o e-mail dos "Avisos para a
// equipe", com as últimas mensagens) e a IA fica quieta.
//
// O jeito de conversar (18/11/2026, à noite; Marcelo: "Tornar o diálogo mais simples mas completo, capricha e deixe ele
// melhor, não seja tão aficionado a levar o usuário a publicar ou procurar vagas, mas isso precisa ser evidente"):
//   * os momentos de sempre têm texto pronto, escrito com cuidado e sem IA: as boas-vindas (o "Oi" ou o "Posso ter mais
//     informações?" do anúncio), o "Procuro trabalho", o "Quero contratar", o "Oi" de novo, o "obrigado", a foto, o
//     arquivo e a localização (as vagas perto dela);
//   * o resto a IA responde, com o que está na Ajuda (src/lib/ajuda.ts): o que a pessoa perguntou, simples e completo,
//     sem terminar toda mensagem empurrando a publicar ou procurar vaga;
//   * o caminho fica à vista nos botões, e não no texto: os botões "Procuro trabalho", "Quero contratar" e "Falar com a
//     equipe" enquanto não se sabe o que a pessoa quer, e um botão que abre o site ("Ver vagas", "Publicar vaga
//     grátis") quando a conversa leva até ele;
//   * mensagens seguidas ("Oi", "Oi", "tudo bem?") recebem uma resposta só: espera uns segundos e só a mais nova
//     responde, com a conversa toda;
//   * "ok", "👍" e o código que a Meta manda ao ligar o número no Instagram não recebem resposta.
// De madrugada (19/11; Marcelo: "Melhore tudo que for possível nessa funcionalidade, vou dormir"):
//   * o áudio vira texto (a mesma transcrição do currículo falado) e a conversa segue como se fosse escrita ("🎤 …");
//   * as vagas saem perto de onde a pessoa disse que mora (o bairro ou a cidade) ou da localização que ela mandou;
//   * a passagem para a equipe diz quando alguém responde (agora, hoje cedo, amanhã cedo ou na segunda);
//   * as instruções da IA são sempre as mesmas e o que muda vai na mensagem: o Claude guarda as instruções (o cache).
// A IA usa o modelo do chat (Admin › IA › "IA do Publike").

// Quem atende se apresenta sempre como o Marcelo, o dono (18/11/2026, Marcelo, com o print do "Aqui é o Marcelo":
// "quando o cliente recebe aparece o nome dele, tem que ser o meu"). O nome do WhatsApp que chega com a mensagem é o de
// quem escreve; a IA confundia os dois e se apresentava com o nome da pessoa.
const QUEM_ATENDE = "Marcelo";

/** Os botões de quando ainda não se sabe o que a pessoa quer (o toque volta no webhook como `a:<id>`). */
const MENU = [
  { id: "a:trabalho", titulo: "Procuro trabalho" },
  { id: "a:contratar", titulo: "Quero contratar" },
  { id: "a:equipe", titulo: "Falar com a equipe" },
];

/** Os botões que abrem o site (o nome vai até 20 letras). A IA escolhe um pelo nome. */
const LINKS = {
  vagas: { titulo: "Ver vagas", caminho: "/?tipo=vaga" },
  publicar: { titulo: "Publicar vaga grátis", caminho: "/publicar" },
  curriculo: { titulo: "Fazer meu currículo", caminho: "/perfil/curriculo" },
  empresas: { titulo: "Para empresas", caminho: "/empresas" },
  ajuda: { titulo: "Ver a Ajuda", caminho: "/ajuda" },
  entrar: { titulo: "Entrar no Publike", caminho: "/entrar" },
} as const;
type NomeDoLink = keyof typeof LINKS;
type Botao = { titulo: string; caminho: string };

/** Quanto esperar por outra mensagem antes de responder: quem digita manda em pedaços; o toque num botão é um só. */
const ESPERA = { texto: 5000, botao: 800 };

type Mensagem = { de: "pessoa" | "robo" | "equipe"; texto: string };

/** Quantas vagas o atendimento manda por dia a cada pessoa (de Brasília); o resto fica no botão do site. */
export const VAGAS_POR_DIA = 3;

type Entrada = {
  chave: string;
  nova: boolean;
  nome: string | null;
  perfil: "trabalho" | "contratar" | null;
  situacao: "robo" | "equipe";
  pediu_equipe: boolean;
  respostas_hoje: number;
  limite: number;
  ligado: boolean;
  origem: {
    tipo?: string | null;
    link?: string | null;
    titulo?: string | null;
    texto?: string | null;
  } | null;
  conta: { nome: string | null; tipo: string } | null;
  historico: Mensagem[];
};

/** O que chegou pelo webhook (`tratarAvisoDaMeta`). */
export type MensagemDoAtendimento = {
  wamid: string;
  numero: string;
  texto: string;
  payload: string | null;
  nome: string | null;
  origem: Record<string, string | null> | null;
  /** o áudio, para virar texto */
  audio?: { id: string; tipo: string | null } | null;
  /** a localização que a pessoa mandou */
  local?: { lat: number; lng: number } | null;
};

type Busca = {
  texto: string;
  categoria: string;
  cidade: string;
  bairro: string;
};

type Plano = {
  resposta: string;
  perfil: "trabalho" | "contratar" | "indefinido";
  acao: "responder" | "buscar_vagas" | "equipe" | "silencio";
  link: NomeDoLink | "nenhum";
  busca: Busca;
};

const ESQUEMA = {
  nome: "atendimento_whatsapp",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["resposta", "perfil", "acao", "link", "busca"],
    properties: {
      resposta: { type: "string" },
      perfil: { type: "string", enum: ["trabalho", "contratar", "indefinido"] },
      acao: {
        type: "string",
        enum: ["responder", "buscar_vagas", "equipe", "silencio"],
      },
      link: { type: "string", enum: [...Object.keys(LINKS), "nenhum"] },
      busca: {
        type: "object",
        additionalProperties: false,
        required: ["texto", "categoria", "cidade", "bairro"],
        properties: {
          texto: { type: "string" },
          categoria: {
            type: "string",
            enum: [...CATEGORIAS.map((c) => c.slug), "todas"],
          },
          cidade: { type: "string", enum: [...CIDADES, ""] },
          bairro: { type: "string" },
        },
      },
    },
  },
};

/** Os links do site, já com a origem (o Admin conta quem chegou pelo WhatsApp e as contas que vieram dele). */
const link = (caminho: string) => comOrigem(`${SITE_URL}${caminho}`, "whatsapp", "atendimento");

// --- Ler a mensagem ---------------------------------------------------------------------------------------------

/** Sem acento, sem pontuação, em minúsculas: "Olá! Tudo bem?" vira "ola tudo bem". */
export const simples = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const palavras = (t: string) => simples(t).split(" ").filter(Boolean);

const PALAVRAS_DE_OI = new Set(
  (
    "oi oii oiii oie ola olaa opa eai e ai bom boa dia tarde noite tudo bem td bm blz beleza tranquilo " +
    "joia hello hi hey alo salve como vai voce vc pessoal gente amigo amiga moco moca marcelo publike"
  ).split(" "),
);
/** O que faz da mensagem um cumprimento ("beleza" sozinho é confirmação; "oi, beleza?" é cumprimento). */
const OI_DE_VERDADE = /^(o+i+e*|ola+|opa|eai|hello|hi|hey|alo|salve)$/;

/** Só um "Oi", "Boa tarde", "Olá, tudo bem?". */
export function soCumprimento(t: string) {
  const p = palavras(t);
  if (!p.length || p.length > 6) return false;
  const temOi = p.some((x) => OI_DE_VERDADE.test(x)) || /\b(bom dia|boa (tarde|noite)|e ai)\b/.test(simples(t));
  return temOi && p.every((x) => PALAVRAS_DE_OI.has(x) || OI_DE_VERDADE.test(x));
}

const PALAVRAS_DE_OK = new Set(
  (
    "ok okay okk blz beleza certo entendi ta bom show top joia perfeito combinado otimo legal massa uhum " +
    "aham ah ata entao tranquilo de boa tudo pode ser vou ver olhar dar uma olhada depois fechado valeu"
  ).split(" "),
);

/** Só uma confirmação ("ok", "beleza", "entendi", "vou dar uma olhada"): depois de conversar, não pede resposta. */
export function soConfirmacao(t: string) {
  const p = palavras(t);
  return p.length > 0 && p.length <= 6 && p.every((x) => PALAVRAS_DE_OK.has(x)) && !soAgradecimento(t);
}

const OBRIGADO = /^(obrigad[oa]|obg|brigad[oa]|valeu|vlw|agradeco|grat[oa])$/;
const PALAVRAS_DO_OBRIGADO = new Set(
  (
    "muito mt mto muitissimo ok ta bom beleza blz certo entao de pela pelas informacao informacoes ajuda " +
    "atencao deus abencoe te lhe demais show top otimo por tudo ai viu moco moca marcelo"
  ).split(" "),
);

/** Só um "Obrigado!", "Valeu, muito obrigada pela ajuda". */
export function soAgradecimento(t: string) {
  const p = palavras(t);
  return (
    p.length > 0 &&
    p.length <= 8 &&
    p.some((x) => OBRIGADO.test(x)) &&
    p.every((x) => OBRIGADO.test(x) || PALAVRAS_DO_OBRIGADO.has(x))
  );
}

/** Só emoji ("👍", "🙏"): depois de conversar, não pede resposta. */
export const soEmoji = (t: string) => t.trim() !== "" && simples(t) === "" && t.trim().length <= 12;

/** O pedido geral, como o texto pronto do anúncio: "Olá! Posso ter mais informações sobre isso?". */
export function pedidoGeral(t: string) {
  const s = simples(t);
  if (s.split(" ").length > 10 || /\bvagas? (de|para|pra)\b/.test(s)) return false;
  return /(mais informac|informac(ao|oes) sobre|saber mais|tenho interesse|como funciona|quero entender|do que se trata|sobre isso|me explica|o que e o publike|que site e esse)/.test(
    s,
  );
}

/** O código que a Meta manda ao ligar o número no Instagram ou no Facebook ("79680 é seu código do Instagram"). */
export function codigoDaMeta(t: string) {
  const s = simples(t);
  return /\b\d{4,8}\b/.test(s) && /\b(codigo|code)\b/.test(s) && /\b(instagram|facebook|whatsapp|meta)\b/.test(s);
}

/** "[a pessoa mandou um áudio]": o que veio sem texto (o webhook escreve assim). */
export function midiaDaMensagem(t: string) {
  const m = t.match(/^\[a pessoa mandou (.+)\]$/);
  if (!m) return null;
  const o = m[1];
  if (o.includes("áudio")) return "audio" as const;
  if (o.includes("foto")) return "foto" as const;
  if (o.includes("vídeo")) return "video" as const;
  if (o.includes("figurinha")) return "figurinha" as const;
  if (o.includes("arquivo")) return "arquivo" as const;
  if (o.includes("localização")) return "localizacao" as const;
  return "outro" as const;
}

const NAO_E_NOME = new Set(
  (
    "loja centro studio estudio salao clinica academia mercado supermercado padaria restaurante bar " +
    "lanchonete empresa comercial distribuidora farmacia escola colegio igreja grupo agencia publike dr " +
    "dra sr sra pr pastor rh vagas emprego"
  ).split(" "),
);

/** O primeiro nome do perfil do WhatsApp, quando parece nome de gente ("~Raphael" vira "Raphael"; "Loja X", nada). */
export function primeiroNome(nome: string | null) {
  if (!nome) return null;
  const p = nome.replace(/^[^A-Za-zÀ-ÿ]+/, "").split(/\s+/)[0] ?? "";
  if (!/^[A-Za-zÀ-ÿ]{2,20}$/.test(p) || NAO_E_NOME.has(simples(p))) return null;
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/** As mensagens da pessoa desde a última resposta (o que ainda não teve resposta, junto). */
function semResposta(historico: Mensagem[]) {
  const ultima = historico.findLastIndex((x) => x.de !== "pessoa");
  return historico.slice(ultima + 1).filter((x) => x.de === "pessoa");
}

/** O texto sem os botões entre colchetes do fim ("[Botão: Ver vagas]"). */
const semBotoes = (t: string) => t.replace(/\s*\[Bot(ão|ões):[^\]]*\]\s*$/, "").trim();

/**
 * Quando a equipe responde: em breve, no horário (dias úteis, das 8h às 18h de Brasília); fora dele, quando ela volta
 * ("hoje de manhã", "amanhã de manhã" ou "na segunda de manhã").
 */
export function quandoAEquipeResponde(agora = new Date()) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(agora);
  const dia = partes.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 12);
  const util = dia !== "Sat" && dia !== "Sun";
  if (util && hora >= 8 && hora < 18) return "em breve";
  if (util && hora < 8) return "hoje de manhã";
  if (dia === "Mon" || dia === "Tue" || dia === "Wed" || dia === "Thu") return "amanhã de manhã";
  return "na segunda de manhã";
}

/** "Certo! Vou pedir para alguém da equipe…", com quando a equipe responde. */
export function passarParaEquipe(
  comeco: "Certo!" | "Para continuar," | "Para te ajudar direitinho,",
  agora = new Date(),
) {
  const quando = quandoAEquipeResponde(agora);
  const vou = comeco.endsWith(",") ? "vou" : "Vou";
  return `${comeco} ${vou} pedir para alguém da equipe do Publike te responder por aqui. ${
    quando === "em breve"
      ? "Em breve alguém fala com você."
      : `Agora a equipe está fora do horário: alguém fala com você ${quando}.`
  }`;
}

// --- Onde procurar as vagas -------------------------------------------------------------------------------------

/** A cidade de um bairro, pelas listas de bairros (Goiânia primeiro, a maior); sem achar, Goiânia. */
function cidadeDoBairro(bairro: string): Cidade {
  const chave = chaveBairro(bairro);
  const ordem = ["Goiânia" as Cidade, ...CIDADES.filter((c) => c !== "Goiânia")];
  return ordem.find((c) => BAIRROS[c]?.some((b) => chaveBairro(b) === chave)) ?? "Goiânia";
}

/** Onde a pessoa disse que mora ou quer trabalhar (a cidade e o bairro que a IA tirou da conversa). */
export function lugarDaBusca(cidade: string, bairro: string): Local | null {
  const b = bairro.replace(/\s+/g, " ").trim().slice(0, 60);
  const c = CIDADES.find((x) => simples(x) === simples(cidade)) ?? (b ? cidadeDoBairro(b) : null);
  return c ? criarLocal(c, b, "busca") : null;
}

/**
 * As vagas no ar que combinam com o que a pessoa disse, em linhas com o link: perto do lugar que ela disse (o bairro
 * primeiro, depois a região e a cidade) ou da localização que ela mandou; sem lugar, as mais novas.
 */
async function vagasEmTexto(
  busca: { texto: string; categoria: string },
  onde: {
    local?: Local | null;
    ponto?: { lat: number; lng: number } | null;
  } = {},
  /** quantas vagas cabem nesta resposta (o que sobra das do dia) */
  max = 4,
) {
  // a cidade, o bairro e a região só ordenam (o bairro primeiro, depois a região e a cidade); quem corta é o raio
  const centro = onde.local ? pontoDoLocal(onde.local) : null;
  const lugar = onde.ponto
    ? { p_lat: onde.ponto.lat, p_lng: onde.ponto.lng, p_raio_km: 30, p_ordem: "perto", p_por_distancia: true }
    : onde.local && centro
      ? {
          p_lat: centro.lat,
          p_lng: centro.lng,
          p_raio_km: 40,
          p_ordem: "perto",
          p_cidade: onde.local.cidade,
          p_bairro: onde.local.bairro || null,
          p_bairros_regiao: onde.local.regiao ? chavesDaRegiao(onde.local.regiao) : null,
          p_regiao: onde.local.regiao,
        }
      : { p_raio_km: 60, p_ordem: "recentes" };
  const tentar = async (texto: string | null, categoria: string | null) => {
    const { data, error } = await criarClientePublico().rpc("buscar_anuncios", {
      ...lugar,
      p_tipo: "vaga",
      p_texto: texto,
      p_categoria: categoria,
      p_limite: 20,
    });
    return error ? [] : (data ?? []);
  };
  const texto = busca.texto.trim().slice(0, 60) || null;
  const categoria = CATEGORIAS.some((c) => c.slug === busca.categoria) ? busca.categoria : null;
  let lista = await tentar(texto, categoria);
  if (!lista.length && categoria) lista = await tentar(texto, null);
  // sem nada com a função inteira ("auxiliar de cozinha"), as que começam igual ("auxiliar"): são parecidas, não iguais
  let parecidas = false;
  if (!lista.length && texto && texto.length > 6) {
    lista = await tentar(texto.slice(0, 6), null);
    parecidas = lista.length > 0;
  }
  if (!lista.length) return null;
  const linha = (a: (typeof lista)[number]) => {
    const valor = valorDoAnuncio(a);
    return `• *${a.titulo}*${valor ? ` · ${valor}` : ""} · ${formatarLugar(a.bairro, a.cidade)}\n${link(`/anuncio/${a.id}`)}`;
  };
  // a mensagem com botão vai até 1.024 letras: com links longos, cabem menos vagas
  let n = Math.min(Math.max(1, max), 4, lista.length);
  while (n > 1 && lista.slice(0, n).map(linha).join("\n\n").length > 800) n--;
  const p = new URLSearchParams({ tipo: "vaga" });
  if (texto) p.set("q", texto);
  return {
    texto: lista.slice(0, n).map(linha).join("\n\n"),
    quantas: n,
    mais: lista.length > n ? { titulo: "Ver mais vagas", caminho: `/?${p}` } : null,
    parecidas,
  };
}

// --- Os textos prontos ------------------------------------------------------------------------------------------

/** "Bom dia", "Boa tarde" ou "Boa noite", quando a pessoa cumprimentou assim; senão, "Oi". */
export function cumprimentoDe(textos: string[]) {
  const s = simples(textos.join(" "));
  if (/\bbom dia\b/.test(s)) return "Bom dia";
  if (/\bboa tarde\b/.test(s)) return "Boa tarde";
  if (/\bboa noite\b/.test(s)) return "Boa noite";
  return "Oi";
}

const oi = (nome: string | null, comeco = "Oi") => `${comeco}${nome ? `, ${nome}` : ""}!`;

function boasVindas(nome: string | null, comeco: string) {
  return [
    `${oi(nome, comeco)} 👋 Aqui é o ${QUEM_ATENDE}, do Publike.`,
    `O Publike é um site *grátis* de vagas de emprego perto de casa, em ${ONDE_FUNCIONA}:\n• quem procura trabalho se candidata pelo celular e acompanha cada passo: se a empresa viu, se aceitou e quando é a entrevista;\n• quem contrata publica a vaga de graça e recebe os candidatos organizados.`,
    "Como posso te ajudar?",
  ].join("\n\n");
}

const PARA_QUEM_PROCURA = [
  "Que bom! Para quem procura trabalho, funciona assim:",
  "1. Você faz o currículo pelo celular, em poucos minutos.\n2. Vê as vagas perto de casa e se candidata com um toque, no botão *Curtir*.\n3. Acompanha cada candidatura: se a empresa viu, se aceitou e quando é a entrevista. Quando ela aceita, vocês conversam direto.",
  `É grátis, sempre. Me conta o que você faz e o bairro onde mora, que eu te mando até ${VAGAS_POR_DIA} vagas por dia por aqui.`,
].join("\n\n");

/**
 * O "Quero contratar". Com o Publicar pelo WhatsApp ligado (migração 20270806120000), o caminho mais curto vem
 * primeiro: mandar aqui mesmo a foto ou o texto da vaga.
 */
function paraQuemContrata(porAqui: boolean) {
  return [
    "Que bom! Para contratar pelo Publike:",
    porAqui
      ? "1. Você me manda aqui mesmo a foto do anúncio, o PDF ou o texto da vaga (o cargo, o salário, o horário e o bairro). Eu preparo a vaga e te mando o link para conferir e publicar, de graça.\n2. Os candidatos chegam no seu painel, mostrando o quanto cada um combina com a vaga.\n3. Você aceita quem quiser e conversa direto com a pessoa."
      : "1. Você publica a vaga de graça. Pode colar o texto ou mandar a foto do anúncio: o Publike preenche tudo para você conferir.\n2. Os candidatos chegam no seu painel, mostrando o quanto cada um combina com a vaga.\n3. Você aceita quem quiser e conversa direto com a pessoa.",
    `Dá para ter até ${LIMITES_CONTA.comum.noAr} vagas no ar de graça, sem limite de candidatos. Quem contrata muito tem planos com recursos a mais, como a triagem com IA. Se ficar alguma dúvida, é só me perguntar.`,
  ].join("\n\n");
}

/** O modo econômico (o teto do mês): uma mensagem só por dia para quem procura trabalho, com o botão das vagas. */
export const ECONOMICO_TRABALHO =
  "As vagas perto de você estão no botão abaixo: escolha o bairro, veja o salário e se candidate com um toque, de graça.";
export const ECONOMICO_SEM_PERFIL =
  "Procura trabalho? As vagas perto de você estão no botão abaixo, de graça. Quer contratar? Mande aqui a foto ou o texto da vaga, que eu preparo para você publicar.";

/** O teto do mês (migração 20270808120000); sem a migração ou com erro, null (segue normal). */
async function tetoDoMes(banco: ClienteBanco, chave: string, conversa: string) {
  const { data, error } = await banco.rpc("servidor_whatsapp_teto", { p_chave: chave, p_conversa: conversa });
  if (error || !data) return null;
  return data as unknown as { teto: number; enviadas: number; economico: boolean; respondida_hoje: boolean };
}

/** As vagas de hoje acabaram: amanhã tem mais, e o site tem todas. */
const ACABARAM_AS_DE_HOJE = `Hoje eu já te mandei ${VAGAS_POR_DIA} vagas por aqui. Amanhã eu mando mais! Enquanto isso, todas as vagas no ar estão no botão abaixo.`;

/** Depois da lista: como se candidatar e, se as do dia acabaram, que amanhã tem mais. */
function depoisDasVagas(sobram: number) {
  return sobram > 0
    ? "Para se candidatar, abra a vaga e toque em *Curtir*."
    : "Para se candidatar, abra a vaga e toque em *Curtir*. Por hoje são essas: amanhã eu mando mais, e todas estão no botão abaixo.";
}

const POR_NADA = "Por nada! 😊 Qualquer coisa, é só chamar.";

// --- A IA -------------------------------------------------------------------------------------------------------

/** As instruções da IA: sempre as mesmas (o que muda vai em `contexto`), para o Claude guardar e cobrar menos. */
let instrucoesGuardadas: string | null = null;
function instrucoes() {
  instrucoesGuardadas ??= `Você responde o WhatsApp oficial do Publike, um site grátis de vagas de emprego, freelances e serviços perto de casa, em ${ONDE_FUNCIONA}. O que você sabe desta conversa vem em "Sobre esta conversa", no começo da mensagem.

Quem você é
- Você é o ${QUEM_ATENDE}, do Publike.
- Na sua primeira mensagem para a pessoa (está dito em "Sobre esta conversa"), comece com "Oi, <primeiro nome>! Aqui é o ${QUEM_ATENDE}, do Publike." (sem nome, só "Oi!"; se ela disse "bom dia", "boa tarde" ou "boa noite", comece igual) e diga numa frase o que é o Publike; depois responda. Nas outras, não se apresente de novo e não comece com "Oi".
- O nome que vem em "Sobre esta conversa" é o da pessoa, não o seu: chame pelo nome no máximo uma vez, na saudação.
- Se a pessoa perguntar se está falando com um robô, diga com franqueza que é o atendimento automático do Publike, em nome do ${QUEM_ATENDE}, e que alguém da equipe responde por aqui se ela quiser.

Como responder
- Responda o que a pessoa perguntou: simples, mas completo, com o que ela precisa saber para resolver. Se a pergunta tiver duas partes, responda as duas.
- Escreva como numa conversa de WhatsApp: frases curtas, palavras do dia a dia, gentil e direto, sem jargão de RH.
- Parágrafos curtos, com uma linha em branco entre eles. No máximo umas 5 frases; para um passo a passo, até 3 itens numerados ("1.", "2.", "3."), curtos.
- *negrito* do WhatsApp em no máximo duas palavras. No máximo um emoji, e só se combinar. Sem títulos, sem markdown, sem listas com hífen ou asterisco.
- Sem pressa de vender: não termine toda mensagem com uma pergunta nem convidando a publicar vaga, procurar vaga ou fazer currículo. Ofereça o próximo passo só quando ele ajudar a pessoa a resolver o que ela falou, e uma vez só.
- Não escreva links nem endereços de site. Quando a pessoa precisar abrir o site, escolha o botão no campo "link": ele vai junto da mensagem, e no texto você pode dizer "é só tocar no botão abaixo".
- Não repita o que você já disse na conversa. Não pergunte se a pessoa procura trabalho ou quer contratar: quando ainda não se sabe, a mensagem já vai com os botões "Procuro trabalho" e "Quero contratar".
- As mensagens que começam com 🎤 vieram em áudio e foram passadas para texto (pode haver palavra trocada): responda normalmente, por escrito.

O que nunca fazer
- Nunca invente vaga, empresa, salário, preço, prazo ou regra: use só o que está aqui. Não diga o preço dos planos: escolha o botão "empresas".
- Nunca peça documento, CPF, senha, código, dados de cartão ou dinheiro. O Publike nunca cobra de quem procura trabalho: se pediram dinheiro em nome de uma vaga, é golpe.
- Você não mexe na conta de ninguém, não publica vaga nem candidata a pessoa: diga como ela faz no site. (A exceção está em "Sobre esta conversa", quando o Publicar pelo WhatsApp está ligado.)

O essencial do Publike
- Para quem procura trabalho: é grátis, sempre. A pessoa faz o currículo pelo celular em poucos minutos (dá para mandar o PDF, uma foto ou contar falando), vê as vagas perto de casa e se candidata com um toque, no botão Curtir da vaga. Depois acompanha cada candidatura: se a empresa viu, se aceitou e quando é a entrevista. Quando a empresa aceita, as duas se conectam e conversam direto.
- Para quem contrata (empresa, comércio, agência ou família): publicar é grátis, até ${LIMITES_CONTA.comum.noAr} vagas no ar ao mesmo tempo, sem limite de candidatos. Dá para colar o texto da vaga ou mandar a foto do anúncio, e o Publike preenche tudo para conferir. Os candidatos chegam no painel com o quanto combinam com a vaga. Para quem contrata muito, há planos com recursos a mais (triagem com IA, teste prático, entrevista em vídeo e mais vagas no ar).
- Onde funciona: ${ONDE_FUNCIONA}.

O que fazer (campo "acao")
- responder: o normal.
- buscar_vagas: a pessoa procura trabalho e disse o que faz ou que vaga quer ("sou cozinheira", "tem vaga de motorista?"), agora ou antes na conversa. Preencha "busca.texto" com a função, no singular, como ela falou ("cozinheira", "motorista"); "busca.categoria" só se tiver certeza (senão "todas"); "busca.cidade" com a cidade onde ela mora ou quer trabalhar, se ela disse (uma das cidades da lista; senão vazio); e "busca.bairro" com o bairro, como ela escreveu (senão vazio). A "resposta" é só uma frase curta que apresenta as vagas, como "Olha as vagas de motorista perto do Jardim América:"; a lista vai logo depois. Se ela só disse que procura emprego, sem dizer o quê, use responder e pergunte o que ela faz e onde mora.
- equipe: a pessoa pede para falar com alguém, reclama, fala de pagamento, cobrança ou golpe, de problema na conta, de parceria ou de imprensa, ou você não sabe a resposta. Responda o que der (no golpe: não pague nada) e diga que vai pedir para alguém da equipe responder por aqui, no prazo que está em "Sobre esta conversa".
- silencio: a mensagem não pede resposta, como "ok", "beleza", "👍" ou um "obrigado" depois que você já se despediu. Deixe "resposta" vazia.
Fora de buscar_vagas, "busca" vai com texto, cidade e bairro vazios e categoria "todas".

O botão (campo "link")
- vagas: ver as vagas no ar. publicar: publicar uma vaga. curriculo: fazer ou mudar o currículo. empresas: o que o Publike oferece a quem contrata, com os planos. ajuda: as perguntas e respostas do site. entrar: entrar na conta. nenhum: sem botão.
- Escolha um só quando a pessoa precisar abrir o site para fazer o que vocês falaram. Na dúvida, nenhum. Não repita o botão que foi na sua mensagem anterior (o histórico mostra entre colchetes os botões que foram junto; não escreva colchetes).

"perfil": trabalho, contratar ou indefinido, pelo que a conversa mostra até agora.
Assunto que não é trabalho nem o Publike: diga com gentileza que por aqui você só ajuda com o Publike.

A Ajuda do site (o que você sabe sobre o Publike):
${textoDaAjuda()}`;
  return instrucoesGuardadas;
}

/**
 * O que muda de uma conversa para outra: vai na mensagem, antes da conversa. `vagasPorAqui`: o Publicar pelo WhatsApp
 * está ligado (migração 20270806120000), e quem quer publicar pode mandar a vaga aqui mesmo.
 */
function contexto(e: Entrada, jaFalou: boolean, agora: Date, vagasPorAqui = false) {
  const nome = primeiroNome(e.nome);
  const anuncio = [e.origem?.titulo, e.origem?.texto].filter(Boolean).join(" — ");
  return [
    "Sobre esta conversa:",
    nome ? `- A pessoa se chama ${nome}.` : "- O nome da pessoa não veio: não chame por nome.",
    e.conta
      ? `- Este número já tem conta no Publike (${e.conta.tipo === "pessoa" ? "de pessoa" : "de empresa, comércio ou agência"}).`
      : "- Este número ainda não tem conta no Publike.",
    e.perfil === "trabalho"
      ? "- Ela procura trabalho."
      : e.perfil === "contratar"
        ? "- Ela quer contratar."
        : "- Ainda não se sabe se ela procura trabalho ou quer contratar.",
    anuncio ? `- Ela chegou por um anúncio do Publike no Instagram ou no Facebook: "${anuncio}".` : null,
    jaFalou ? "- Você já falou com ela nesta conversa." : "- Esta é a sua primeira mensagem para ela.",
    `- Se passar a conversa para a equipe, alguém responde por aqui ${quandoAEquipeResponde(agora)}.`,
    vagasPorAqui
      ? "- Quem quer publicar uma vaga pode mandar aqui mesmo, nesta conversa, a foto do anúncio, o PDF ou o texto da vaga (o cargo, o salário, o horário e o bairro): o Publike lê, prepara a vaga e manda o link para a pessoa conferir e publicar. Diga isso quando a pessoa quiser publicar, em vez de mandar para o site."
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function transcricao(historico: Mensagem[]) {
  const quem = { pessoa: "Pessoa", robo: "Você", equipe: "Equipe" } as const;
  return `Conversa até agora:\n${historico.map((m) => `${quem[m.de]}: ${m.texto}`).join("\n")}\n\nResponda à Pessoa (às mensagens dela depois da sua última resposta).`;
}

/** O modelo do chat (Admin › IA), se a IA está configurada. */
async function modeloDoAtendimento() {
  if (!iaConfigurada()) return null;
  const { data } = await criarClientePublico().rpc("config_publica");
  return modeloPara(data?.[0], "chat");
}

/** O áudio que a pessoa mandou, em texto ("🎤 …"); sem a transcrição (ou se falhou), null. */
async function audioEmTexto(cfg: ConfigMeta, audio: { id: string; tipo: string | null }) {
  if (!falaDisponivel()) return null;
  const arquivo = await baixarMidia(cfg, audio.id);
  if (!arquivo) return null;
  const extensao = /mpeg|mp3/.test(arquivo.tipo) ? "mp3" : /mp4|m4a|aac/.test(arquivo.tipo) ? "m4a" : "ogg";
  try {
    // até 20 s: depois disso, a conversa segue sem o áudio ("Não consegui ouvir esse áudio")
    let relogio: ReturnType<typeof setTimeout> | undefined;
    const texto = await Promise.race([
      transcrever(
        arquivo.dados,
        `audio.${extensao}`,
        `Uma pessoa manda um áudio no WhatsApp do Publike, um site de vagas de emprego em ${ONDE_FUNCIONA}, sobre vagas, currículo, candidatura ou como contratar.`,
      ),
      new Promise<never>((_, falhou) => {
        relogio = setTimeout(() => falhou(new Error("a transcrição passou de 20 s")), 20_000);
      }),
    ]).finally(() => clearTimeout(relogio));
    const limpo = texto.replace(/\s+/g, " ").trim().slice(0, 1500);
    return limpo ? `🎤 ${limpo}` : null;
  } catch (erro) {
    console.error("Publike: o áudio do atendimento não virou texto:", erro instanceof Error ? erro.message : erro);
    return null;
  }
}

/** Corta no fim de uma frase antes do limite (a mensagem com botão vai até 1.024 letras). */
function caber(texto: string, max = 1000) {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max);
  const fim = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("\n"));
  return (fim > max / 2 ? corte.slice(0, fim + 1) : corte).trim();
}

// --- O atendimento ----------------------------------------------------------------------------------------------

/** Responde uma mensagem que chegou no número da API (roda depois do 200 do webhook). */
export async function atenderConversa(
  cfg: ConfigMeta,
  banco: ClienteBanco,
  chave: string,
  recebida: MensagemDoAtendimento,
  opcoes: { espera?: typeof ESPERA; agora?: Date } = {},
) {
  // o áudio vira texto antes de entrar na conversa (sem a transcrição, fica o "[a pessoa mandou um áudio]")
  const falado = recebida.audio ? await audioEmTexto(cfg, recebida.audio) : null;
  const m = falado ? { ...recebida, texto: falado } : recebida;

  const { data, error } = await banco.rpc("servidor_whatsapp_conversa_entrada", {
    p_chave: chave,
    p_numero: m.numero,
    p_texto: m.texto,
    p_nome: m.nome,
    p_origem: (m.origem as Json) ?? null,
    p_payload: m.payload,
    p_wamid: m.wamid,
  });
  if (error || !data) {
    console.error("Publike: a conversa do WhatsApp não entrou:", error?.message);
    return;
  }
  const e = data as unknown as Entrada;
  if (!e.ligado || e.situacao === "equipe") return;
  // o código que a Meta manda ao ligar o número no Instagram fica guardado na conversa, sem resposta
  if (codigoDaMeta(m.texto)) return;

  // o "👍", o "ok" ou a figurinha depois de conversar não vão ter resposta: só "lida", sem o "digitando…"
  const conversando = e.historico.some((x) => x.de !== "pessoa");
  const semPergunta = !semBotoes(e.historico.findLast((x) => x.de !== "pessoa")?.texto ?? "").endsWith("?");
  const soReacao =
    conversando &&
    (soEmoji(m.texto) || midiaDaMensagem(m.texto) === "figurinha" || (semPergunta && soConfirmacao(m.texto)));
  await marcarLidaDigitando(cfg, m.wamid, !soReacao).catch(() => undefined);

  // espera um pouco: se chegou outra mensagem da pessoa, ela é que responde, com a conversa toda
  const espera = opcoes.espera ?? ESPERA;
  await new Promise((r) => setTimeout(r, m.payload ? espera.botao : espera.texto));
  const ultima = await banco.rpc("servidor_whatsapp_conversa_ultima", {
    p_chave: chave,
    p_conversa: e.chave,
  });
  if (!ultima.error && ultima.data) {
    const u = ultima.data as unknown as {
      wamid: string | null;
      situacao: "robo" | "equipe";
      perfil: Entrada["perfil"];
      historico: Mensagem[];
    };
    if (u.wamid !== m.wamid || u.situacao === "equipe") return;
    e.historico = u.historico;
    e.perfil = u.perfil ?? e.perfil;
  }
  // sem a função (a migração 20270803120000 ainda não rodou), segue com a conversa da entrada

  const agora = opcoes.agora ?? new Date();
  const saida = async (
    texto: string,
    extra: {
      perfil?: string | null;
      equipe?: boolean;
      motivo?: string;
      menu?: boolean;
      botao?: Botao | null;
    } = {},
  ) => {
    const url = extra.botao ? link(extra.botao.caminho) : null;
    let r = extra.menu
      ? await enviarComBotoes(cfg, m.numero, caber(texto), MENU)
      : extra.botao && url
        ? await enviarComLink(cfg, m.numero, caber(texto), {
            titulo: extra.botao.titulo,
            url,
          })
        : await enviarTexto(cfg, m.numero, texto);
    let marca = extra.menu
      ? `[Botões: ${MENU.map((b) => b.titulo).join(" · ")}]`
      : extra.botao
        ? `[Botão: ${extra.botao.titulo}]`
        : "";
    // a mensagem com botão não saiu: vai o texto, com o link escrito
    if (!r.ok && (extra.menu || extra.botao)) {
      console.error("Publike: a mensagem com botão do atendimento não saiu:", r.erro);
      r = await enviarTexto(cfg, m.numero, extra.botao && url ? `${texto}\n\n${extra.botao.titulo}: ${url}` : texto);
      marca = "";
    }
    if (!r.ok) console.error("Publike: a resposta do atendimento não saiu:", r.erro);
    await banco.rpc("servidor_whatsapp_conversa_saida", {
      p_chave: chave,
      p_conversa: e.chave,
      // a resposta que não saiu fica fora da conversa, mas a passagem para a equipe vale
      p_texto: r.ok ? (marca ? `${texto}\n\n${marca}` : texto) : "",
      p_wamid: r.ok ? r.wamid : null,
      p_perfil: extra.perfil ?? null,
      p_equipe: extra.equipe ?? false,
      p_motivo: extra.motivo ?? null,
    });
  };

  // quantas vagas a pessoa já recebeu hoje (migração 20270807120000; sem ela, nenhuma: vale o limite de cada resposta)
  const vagasDeHoje = async () => {
    const { data, error } = await banco.rpc("servidor_whatsapp_vagas_enviadas", { p_chave: chave, p_conversa: e.chave });
    return error ? 0 : Number(data) || 0;
  };

  // a oferta depois de publicar pelo WhatsApp: o "Sim, quero receber" é o aceite dos avisos (migração 20270806120000)
  const daOferta = await respostaDaOferta(banco, chave, e.chave, m.payload);
  if (daOferta) return saida(daOferta, { perfil: "contratar" });

  // o botão "Falar com a equipe"
  if (e.pediu_equipe)
    return saida(passarParaEquipe("Certo!", agora), {
      equipe: true,
      motivo: "a pessoa pediu",
    });
  // passou das respostas do dia: a equipe continua
  if (e.respostas_hoje >= e.limite)
    return saida(passarParaEquipe("Para continuar,", agora), {
      equipe: true,
      motivo: "o número passou das respostas do dia",
    });

  const nome = primeiroNome(e.nome);
  const respostas = e.historico.filter((x) => x.de !== "pessoa");
  const jaFalou = respostas.length > 0;
  const minhaUltima = semBotoes(respostas.at(-1)?.texto ?? "");
  const novas = semResposta(e.historico);
  const textos = novas.length ? novas.map((x) => x.texto) : [m.texto];
  const midias = textos.map(midiaDaMensagem);
  const semPerfil = !e.perfil;
  const comeco = cumprimentoDe(textos);
  // a apresentação, na primeira mensagem para a pessoa (as respostas prontas que não são as boas-vindas)
  const ola = jaFalou ? "" : `${oi(nome, comeco)} 👋 Aqui é o ${QUEM_ATENDE}, do Publike.\n\n`;

  // o teto do mês (migração 20270808120000): no modo econômico, quem procura trabalho recebe uma mensagem só por dia,
  // com o link das vagas, sem a IA; quem contrata segue normal (é quem traz vaga nova)
  const teto = await tetoDoMes(banco, chave, e.chave);
  if (teto?.economico && e.perfil !== "contratar" && m.payload !== "a:contratar") {
    // a foto ou o texto de uma vaga é de quem contrata: o Publicar pelo WhatsApp responde normal
    if (
      deveTentarVaga(textos, e.perfil) &&
      (await tentarVagaPeloWhatsapp({ cfg, banco, chave, conversa: e.chave, numero: m.numero, wamid: m.wamid, perfil: e.perfil, textos, saida, comeco: ola }))
    )
      return;
    if (teto.respondida_hoje) return;
    return saida(
      `${ola}${e.perfil === "trabalho" || m.payload === "a:trabalho" ? ECONOMICO_TRABALHO : ECONOMICO_SEM_PERFIL}`,
      { perfil: e.perfil ?? (m.payload === "a:trabalho" ? "trabalho" : null), botao: LINKS.vagas },
    );
  }

  // os botões do começo, com texto pronto
  if (novas.length <= 1 && m.payload === "a:trabalho")
    return saida(PARA_QUEM_PROCURA, { perfil: "trabalho", botao: LINKS.vagas });
  if (novas.length <= 1 && m.payload === "a:contratar") {
    const porAqui = Boolean(await configVagasWhatsapp(banco, chave));
    return saida(paraQuemContrata(porAqui), {
      perfil: "contratar",
      // pelo WhatsApp, o caminho é mandar a vaga aqui mesmo: o botão do site fica para quem prefere
      botao: LINKS.publicar,
    });
  }

  // a foto, o PDF ou o texto de uma vaga (Publicar pelo WhatsApp, migração 20270806120000): o Publike lê, prepara a
  // vaga e devolve o link para conferir e publicar
  if (
    deveTentarVaga(textos, e.perfil) &&
    (await tentarVagaPeloWhatsapp({
      cfg,
      banco,
      chave,
      conversa: e.chave,
      numero: m.numero,
      wamid: m.wamid,
      perfil: e.perfil,
      textos,
      saida,
      comeco: ola,
    }))
  )
    return;

  // "ok", "beleza", "👍" ou figurinha depois de conversar: não pedem resposta
  if (
    jaFalou &&
    !minhaUltima.endsWith("?") &&
    textos.every((t) => soConfirmacao(t) || soEmoji(t) || midiaDaMensagem(t) === "figurinha")
  )
    return;

  // "obrigado": a despedida pronta, uma vez
  if (jaFalou && textos.every((t) => soAgradecimento(t) || soEmoji(t))) {
    if (minhaUltima.startsWith("Por nada")) return;
    return saida(POR_NADA);
  }

  // só "Oi", "Posso ter mais informações sobre isso?" ou uma figurinha
  const soOi = textos.every(
    (t) => soCumprimento(t) || soEmoji(t) || midiaDaMensagem(t) === "figurinha" || (!jaFalou && pedidoGeral(t)),
  );
  if (soOi) {
    if (!jaFalou) return saida(boasVindas(nome, comeco), { menu: semPerfil });
    const deNovo = /^(Oi|Bom dia|Boa tarde|Boa noite|Estou por aqui)\b/.test(minhaUltima);
    return saida(
      deNovo
        ? semPerfil
          ? "Estou por aqui! 😊 É só me contar como posso te ajudar, ou tocar num dos botões abaixo."
          : "Estou por aqui! 😊 É só me contar como posso te ajudar."
        : `${oi(nome, comeco)} ${semPerfil ? "Como posso te ajudar?" : "Em que posso te ajudar?"}`,
      { menu: semPerfil },
    );
  }

  // a localização: as vagas perto dela (para quem contrata, o endereço vai no Publicar)
  if (m.local && midias.at(-1) === "localizacao") {
    if (e.perfil === "contratar")
      return saida(
        `${ola}Recebi a localização! Por aqui eu não consigo publicar, mas no site o endereço da vaga entra no passo *Onde*, e a vaga aparece para quem mora perto.`,
        { botao: LINKS.publicar },
      );
    const restam = VAGAS_POR_DIA - (await vagasDeHoje());
    if (restam <= 0) return saida(`${ola}${ACABARAM_AS_DE_HOJE}`, { perfil: e.perfil ?? "trabalho", botao: LINKS.vagas });
    const vagas = await vagasEmTexto({ texto: "", categoria: "todas" }, { ponto: m.local }, restam);
    if (!vagas)
      return saida(
        `${ola}Agora não achei vaga no ar perto desse lugar. Entram vagas novas todo dia: as que estão no ar agora ficam no botão abaixo.`,
        { botao: LINKS.vagas },
      );
    return saida(
      `${ola}Olha as vagas no ar mais perto desse lugar:\n\n${vagas.texto}\n\n${depoisDasVagas(restam - vagas.quantas)}`,
      { perfil: e.perfil ?? "trabalho", botao: vagas.mais ?? (restam - vagas.quantas <= 0 ? LINKS.vagas : null) },
    );
  }

  // só áudio (que não virou texto), foto, vídeo ou arquivo: por aqui, só texto
  if (midias.every(Boolean)) {
    const tipo = midias.at(-1);
    if (tipo === "foto" && e.perfil === "contratar")
      return saida(
        `${ola}Recebi a foto! Por aqui eu não consigo publicar, mas no site é rapidinho: toque em *Publicar vaga grátis* e envie a foto do anúncio lá. O Publike lê e preenche tudo para você conferir.`,
        { botao: LINKS.publicar },
      );
    // a foto de quem ainda não disse o que quer pode ser o currículo ou o anúncio de uma vaga: os botões do começo
    // levam a cada caminho
    if (tipo === "foto" && semPerfil)
      return saida(
        `${ola}Recebi a foto, mas por aqui eu não consigo abrir. No site dá: o Publike lê o currículo e também o anúncio de uma vaga, e preenche tudo para você conferir. Toque num botão abaixo que eu te mostro o caminho.`,
        { menu: true },
      );
    if (tipo === "arquivo" || tipo === "foto")
      return saida(
        `${ola}Recebi ${tipo === "foto" ? "a foto" : "o arquivo"}, mas por aqui eu não consigo abrir. Se for o seu currículo, é só enviar no site: dá para mandar o PDF ou uma foto, e o Publike preenche tudo para você conferir.`,
        { botao: LINKS.curriculo },
      );
    return saida(
      `${ola}${
        tipo === "audio"
          ? "Não consegui ouvir esse áudio. Pode me escrever? Assim eu já te respondo."
          : "Por aqui eu só consigo ler mensagens escritas. Pode me contar por escrito?"
      }`,
      { menu: !jaFalou && semPerfil },
    );
  }

  // o resto, a IA
  const modelo = await modeloDoAtendimento();
  if (!modelo)
    return saida(passarParaEquipe("Para te ajudar direitinho,", agora), {
      equipe: true,
      motivo: "a IA está desligada",
    });

  let plano: Plano;
  const vagasPorAqui = Boolean(await configVagasWhatsapp(banco, chave).catch(() => null));
  try {
    const { texto } = await chamarIA({
      funcionalidade: "chat",
      modelo,
      sistema: instrucoes(),
      mensagem: `${contexto(e, jaFalou, agora, vagasPorAqui)}\n\n${transcricao(e.historico.length ? e.historico : [{ de: "pessoa", texto: m.texto }])}`,
      maxTokens: 600,
      esquema: ESQUEMA,
      tempoLimite: 20_000,
      guardarSistema: true,
    });
    plano = lerJson<Plano>(texto);
  } catch (erro) {
    console.error("Publike: a IA do atendimento falhou:", erro instanceof Error ? erro.message : erro);
    return saida(passarParaEquipe("Para te ajudar direitinho,", agora), {
      equipe: true,
      motivo: "a IA não respondeu",
    });
  }

  const perfil = plano.perfil === "trabalho" || plano.perfil === "contratar" ? plano.perfil : null;
  // o que a IA não deve escrever: os colchetes dos botões
  let resposta = (plano.resposta ?? "")
    .replace(/\[bot(ão|ões)[^\]]*\]/gi, "")
    .trim()
    .slice(0, 1500);

  if (plano.acao === "silencio") {
    // sem responder, guarda o que a IA entendeu da pessoa
    if (perfil && !e.perfil)
      await banco.rpc("servidor_whatsapp_conversa_saida", {
        p_chave: chave,
        p_conversa: e.chave,
        p_texto: "",
        p_perfil: perfil,
      });
    return;
  }
  if (!resposta)
    return saida(passarParaEquipe("Para te ajudar direitinho,", agora), {
      equipe: true,
      motivo: "a IA não soube responder",
    });
  if (plano.acao === "equipe")
    return saida(resposta, {
      perfil,
      equipe: true,
      motivo: "a IA passou a conversa",
    });

  if (plano.acao === "buscar_vagas") {
    const busca = plano.busca?.texto?.trim().slice(0, 40) ?? "";
    const local = lugarDaBusca(plano.busca?.cidade ?? "", plano.busca?.bairro ?? "");
    const restam = VAGAS_POR_DIA - (await vagasDeHoje());
    if (restam <= 0) return saida(`${ola}${ACABARAM_AS_DE_HOJE}`, { perfil: perfil ?? "trabalho", botao: LINKS.vagas });
    const vagas = await vagasEmTexto({ texto: busca, categoria: plano.busca?.categoria ?? "todas" }, { local }, restam);
    // sem a frase da IA (ela apresenta vagas que não vieram), a apresentação vai junto, na primeira mensagem
    const naoAchei = `Agora não achei vaga${busca ? ` de ${busca}` : ""} no ar${local ? " nessa região" : ""}.`;
    if (!vagas)
      return saida(`${ola}${naoAchei} Entram vagas novas todo dia: as que estão no ar agora ficam no botão abaixo.`, {
        perfil: perfil ?? "trabalho",
        botao: LINKS.vagas,
      });
    resposta = `${vagas.parecidas ? `${ola}${naoAchei} Olha as que mais se parecem:` : resposta}\n\n${vagas.texto}\n\n${depoisDasVagas(restam - vagas.quantas)}`;
    return saida(resposta, {
      perfil: perfil ?? "trabalho",
      botao: vagas.mais ?? (restam - vagas.quantas <= 0 ? LINKS.vagas : null),
    });
  }

  // o botão que abre o site, quando a conversa leva até ele; senão, os botões do começo, uma vez, enquanto não se sabe
  // o que a pessoa quer
  const botao = plano.link && plano.link !== "nenhum" && plano.link in LINKS ? LINKS[plano.link] : null;
  const menuJaFoi = respostas.some((x) => x.texto.includes("[Botões:"));
  return saida(resposta, {
    perfil,
    botao,
    menu: !botao && !perfil && semPerfil && !menuJaFoi,
  });
}
