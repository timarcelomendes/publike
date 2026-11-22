import "server-only";
import { textoDaAjuda } from "@/lib/ajuda";
import { BAIRROS } from "@/lib/bairros";
import { SITE_URL } from "@/lib/config";
import { CATEGORIAS, CIDADES, LIMITES_CONTA, type Cidade } from "@/lib/constantes";
import { formatarLugar, valorDoAnuncio } from "@/lib/formato";
import { modeloPara } from "@/lib/ia/funcionalidades";
import { chamarIA, iaConfigurada, lerJson } from "@/lib/ia/openai";
import { falaDisponivel, transcrever } from "@/lib/ia/transcrever";
import { pareceVaga } from "@/lib/leitura-de-vagas";
import { comOrigem } from "@/lib/origem";
import { ONDE_FUNCIONA } from "@/lib/pracas";
import { chaveBairro, chavesDaRegiao, criarLocal, pontoDoLocal, type Local } from "@/lib/regioes";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { criarClientePublico } from "@/lib/supabase/servidor";
import type { Json } from "@/lib/supabase/tipos-banco";
import { urlDosEmails } from "./ambiente";
import { acessoFila } from "./filas";
import {
  enviarArquivo,
  baixarMidia,
  configMeta,
  enviarComBotoes,
  enviarComLink,
  enviarTexto,
  marcarLidaDigitando,
  type ConfigMeta,
} from "./whatsapp";
import { BOTAO_AGORA_NAO, BOTAO_MONTAR_CURRICULO, TEXTOS_DO_CURRICULO } from "@/lib/curriculo-pelo-whatsapp";
import { curriculoPeloWhatsappLigado, seguirCurriculoPeloWhatsapp } from "./curriculo-pelo-whatsapp";
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

/**
 * A mensagem de boas-vindas dos anúncios de clique para o WhatsApp (19/11/2026; Marcelo: "isso não pode ocorrer, traz
 * desconfiança", sobre a boas-vindas do anúncio e a do robô, uma depois da outra). A Meta mostra esta mensagem quando a
 * pessoa toca no anúncio, antes de ela escrever, e o webhook não fica sabendo: quem chega por um anúncio (o `referral`)
 * já foi cumprimentado, e o robô responde direto, sem o "Oi" e sem se apresentar de novo. É o texto que vai em todo
 * anúncio (Gerenciador de Anúncios › Conversas › Mensagem de boas-vindas): mudou lá, mude aqui.
 */
export const BOAS_VINDAS_DO_ANUNCIO = `Oi! 👋 Aqui é o ${QUEM_ATENDE}, do Publike.`;

/** A pessoa chegou por um anúncio de clique para o WhatsApp: já viu `BOAS_VINDAS_DO_ANUNCIO`. */
export const veioDoAnuncio = (o: { tipo?: string | null; link?: string | null; titulo?: string | null } | null) =>
  Boolean(o && (o.tipo || o.link || o.titulo));

/**
 * Os botões de quando ainda não se sabe o que a pessoa quer (o toque volta no webhook como `a:<id>`). O WhatsApp aceita
 * só 3 por mensagem (21/11/2026; Marcelo: "uma opção pra quem tem currículo e quer mostrar"): o "Falar com a equipe" foi
 * para a mensagem seguinte (`BOTAO_DA_EQUIPE`) e continua valendo quem escreve "equipe".
 */
const MENU = [
  { id: "a:trabalho", titulo: "Procuro emprego" },
  { id: "a:curriculo", titulo: "Tenho currículo" },
  { id: "a:contratar", titulo: "Quero contratar" },
];
const BOTAO_DA_EQUIPE = { id: "a:equipe", titulo: "Falar com a equipe" };
/** Os nomes de antes, para a conversa que a equipe devolve com o último toque (o histórico guarda o nome). */
const BOTOES_DE_ANTES = [
  { id: "a:trabalho", titulo: "Procuro trabalho" },
  { id: "a:contratar", titulo: "Quero contratar" },
  BOTAO_DA_EQUIPE,
];
/** Quem escreve só "equipe", "atendente", "falar com alguém"...: a equipe, sem passar pela IA. */
export function pedeAEquipe(texto: string) {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  return /^(quero |queria |posso |pode |preciso )?(falar|conversar)? ?(com )?(a |o |uma |um |alguem da )?(equipe|atendente|atendimento|pessoa|humano|alguem)( do publike| de verdade)?( por favor)?$/.test(t);
}
/** O lembrete da equipe nas mensagens com o botão do site (que não pode ter outro botão junto). */
const EQUIPE_POR_ESCRITO = "Se quiser falar com a equipe, é só escrever *equipe*.";

/** Os botões que abrem o site (o nome vai até 20 letras). A IA escolhe um pelo nome. */
const LINKS = {
  vagas: { titulo: "Ver vagas", caminho: "/?tipo=vaga" },
  publicar: { titulo: "Publicar vaga grátis", caminho: "/publicar" },
  curriculo: { titulo: "Fazer meu currículo", caminho: "/perfil/curriculo" },
  enviarCurriculo: { titulo: "Enviar meu currículo", caminho: "/perfil/curriculo" },
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
// 3 por dia até 20/11/2026; com poucas vagas no ar, o limite cortava quem refinava a busca (Marcelo: "não sei se o
// limite de vagas está fazendo sentido, hoje que temos poucas"). O custo fica no teto do mês (o modo econômico).
export const VAGAS_POR_DIA = 12;

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
  /** cada função que a pessoa disse, separada ("auxiliar de costura", "auxiliar de cozinha") */
  funcoes: string[];
  /** outras funções do mesmo ramo, para quando não há vaga da função */
  parecidas: string[];
  categoria: string;
  cidade: string;
  bairro: string;
  /** a cidade que a pessoa disse, quando fica fora de onde o Publike funciona ("Manaus"); senão vazio */
  fora: string;
  /** o jeito de trabalho que ela pediu: primeiro emprego, PCD, diária, home office... (`JEITOS`) */
  jeito?: string[];
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
        required: ["texto", "funcoes", "parecidas", "jeito", "categoria", "cidade", "bairro", "fora"],
        properties: {
          texto: { type: "string" },
          funcoes: { type: "array", items: { type: "string" } },
          parecidas: { type: "array", items: { type: "string" } },
          jeito: { type: "array", items: { type: "string", enum: ["sem_experiencia", "pcd", "diaria", "freelance", "remoto", "meio_periodo", "fim_de_semana", "qualquer"] } },
          categoria: {
            type: "string",
            enum: [...CATEGORIAS.map((c) => c.slug), "todas"],
          },
          cidade: { type: "string", enum: [...CIDADES, ""] },
          bairro: { type: "string" },
          fora: { type: "string" },
        },
      },
    },
  },
};

/** Os links do site, já com a origem (o Admin conta quem chegou pelo WhatsApp e as contas que vieram dele). */
// o endereço público (no computador, PUBLIKE_URL_PUBLICA; sem ele, a Meta de verdade nem recebe: `bloqueioDaMeta`)
const link = (caminho: string) => comOrigem(`${urlDosEmails() ?? SITE_URL}${caminho}`, "whatsapp", "atendimento");
const DO_ATENDIMENTO = "utm_source=whatsapp&utm_campaign=atendimento";
/**
 * O link curto da vaga (21/11/2026; Marcelo: "deixe os links das vagas encurtado"): publike.org/w/ e os 8 primeiros
 * caracteres do id (src/app/w/[codigo]/route.ts põe a origem do atendimento). `comCampanhaDoAnuncio` troca o /w/ pela
 * letra da campanha de quem veio do anúncio (/i/, /f/ ou /m/).
 */
/** O código da vaga no link curto e nas vagas que já foram: os 8 primeiros caracteres do id. */
export const codigoDaVaga = (id: string) => id.slice(0, 8).toLowerCase();
export const linkDaVaga = (id: string) => `${urlDosEmails() ?? SITE_URL}/w/${id.slice(0, 8).toLowerCase()}`;
const LETRA_DA_CAMPANHA: Record<string, string> = { "ig-whatsapp": "i", "fb-whatsapp": "f", "meta-whatsapp": "m" };

/**
 * A campanha dos links de quem chegou por um anúncio de clique para o WhatsApp (19/11/2026; Marcelo: "parece que as
 * campanhas do Instagram não apareceram aqui", no quadro De onde vêm as contas): "ig-whatsapp" (o anúncio do
 * Instagram), "fb-whatsapp" ou "meta-whatsapp", com utm_source=meta-ads, que conta em Anúncios pagos. Sem anúncio, null:
 * os links seguem com a do atendimento. A migração 20270811120000 faz o mesmo com as contas de antes.
 */
export function campanhaDoAnuncio(o: Entrada["origem"]) {
  if (!veioDoAnuncio(o)) return null;
  const l = (o?.link ?? "").toLowerCase();
  return `${l.includes("instagram") ? "ig" : l.includes("facebook") || l.includes("fb.") ? "fb" : "meta"}-whatsapp`;
}

/** Troca, no texto ou no link, a campanha do atendimento pela do anúncio. */
export const comCampanhaDoAnuncio = (t: string, campanha: string | null) =>
  campanha
    ? t
        .replaceAll(DO_ATENDIMENTO, `utm_source=meta-ads&utm_campaign=${campanha}`)
        .replace(/\/w\/([0-9a-f]{8})(?![0-9a-z])/g, `/${LETRA_DA_CAMPANHA[campanha] ?? "m"}/$1`)
    : t;

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

const REGRAS_DA_BUSCA =
  `Preencha "busca.texto" com o que ela faz, como ela falou ("vigilante patrimonial", "auxiliar de costura e de cozinha"); "busca.funcoes" com cada função que ela disse, separada, no singular e com o nome que os anúncios usam (até 3: ["auxiliar de costura", "auxiliar de cozinha"]); "busca.parecidas" com até 4 outras funções que essa pessoa consegue fazer com a experiência que tem, do mesmo ramo, as mais próximas primeiro (vigilante: vigia, porteiro, controlador de acesso; auxiliar de costura: costureira, auxiliar de produção têxtil, arrematadeira; auxiliar de cozinha: ajudante de cozinha, cozinheira, auxiliar de padaria; cargo de liderança: o mesmo cargo em outro nível da mesma área, como supervisor de logística: coordenador de logística, encarregado de logística, gerente de logística). Cuidado com as parecidas: elas aparecem quando não há vaga da função, como oportunidades que podem combinar com o perfil, então nunca ponha uma função só porque divide uma palavra (auxiliar de escritório não é parecida com auxiliar de costura) nem funções que pedem outra formação; na dúvida, deixe de fora; "busca.jeito" com o jeito de trabalho que ela pediu, se pediu: "sem_experiencia" (primeiro emprego, nunca trabalhou, sem experiência), "pcd" (pessoa com deficiência), "diaria", "freelance", "remoto" (home office), "meio_periodo", "fim_de_semana" e "qualquer" (topa o que tiver, outras áreas, o que aparecer); senão, []. O jeito não é função: "primeiro emprego", "PCD", "diária" e "home office" vão em "busca.jeito", nunca em "busca.funcoes" (em "atendimento home office", a função é "atendimento");`;

// --- As vagas da função (19/11/2026; Marcelo: "privilegiar a função solicitada, mesmo que mais longe, cidade e região"
// e "se não tiver a profissão, exibir vagas semelhantes [...] deixar claro ao usuário [...] cuidado com essa lista") --
//
// A ordem: a função que a pessoa disse perto dela (o bairro, a região, a cidade); depois a mesma função nas cidades em
// volta (até 100 km, da mais perto para a mais longe); depois a função mais curta ("vigilante patrimonial" vira
// "vigilante"). Só sem nada da função entram as parecidas, que a IA escolhe do mesmo ramo, ditas como parecidas. A vaga
// só entra se o título for da função ou da parecida (a busca de texto também acha a palavra na descrição).

const PALAVRAS_VAZIAS = new Set("de da do das dos em e a o para com na no".split(" "));
/** Palavras que sozinhas não dizem a função ("auxiliar" de costura não é "auxiliar" de escritório). */
const PALAVRAS_GERAIS = new Set(
  "auxiliar ajudante assistente operador operadora tecnico tecnica analista agente encarregado encarregada profissional servente".split(
    " ",
  ),
);
const palavrasDaFuncao = (f: string) => simples(f).split(" ").filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p));

/**
 * O título é da função: cada palavra dela está no título, pelo começo, sem as últimas letras ("costureira" acha
 * "Costureiro(a)"; "cozinheira" não acha "Auxiliar de cozinha").
 */
export function tituloDaFuncao(titulo: string, funcao: string) {
  const t = simples(titulo);
  const ps = palavrasDaFuncao(funcao);
  return ps.length > 0 && ps.every((p) => t.includes(p.slice(0, Math.max(5, p.length - 3))));
}

/**
 * A função sem a última palavra, quando ela começa por uma palavra geral ("auxiliar de limpeza doméstica" vira
 * "auxiliar de limpeza"; 21/11/2026, Marcelo: "existe auxiliar de limpeza"). null quando sobraria só a palavra geral.
 */
export function funcaoSemComplemento(funcao: string) {
  const ps = palavrasDaFuncao(funcao);
  if (ps.length < 3 || !PALAVRAS_GERAIS.has(ps[0])) return null;
  const partes = funcao.trim().split(/\s+/).slice(0, -1);
  while (partes.length && PALAVRAS_VAZIAS.has(simples(partes.at(-1) ?? ""))) partes.pop();
  return partes.join(" ");
}

/** A função sem o complemento ("vigilante patrimonial" vira "vigilante"); null quando sobraria uma palavra geral. */
export function funcaoCurta(funcao: string) {
  const ps = palavrasDaFuncao(funcao);
  return ps.length > 1 && !PALAVRAS_GERAIS.has(ps[0]) ? ps[0] : null;
}

/**
 * O mesmo trabalho com outro nome: assistente, auxiliar e ajudante ("assistente administrativo" combina com "auxiliar
 * administrativo"; 20/11/2026, Marcelo: "tem auxiliar administrativo que é correlato de assistente").
 */
const MESMO_NIVEL = ["assistente", "auxiliar", "ajudante"];
/**
 * O mesmo trabalho com nomes diferentes no título das vagas (21/11/2026; Marcelo, com "diarista e cuidadora de
 * idosos" sem resposta e uma vaga "Empregada Doméstica" no ar: "tem o termo 'empregada' e não foi considerado").
 */
const MESMO_TRABALHO: { chave: RegExp; nomes: string[] }[] = [
  { chave: /^(diarista|domestica|empregada( domestica)?|faxineira|faxineiro|secretaria do lar|trabalhadora domestica)$/, nomes: ["diarista", "doméstica", "empregada", "faxineira", "secretária do lar"] },
  { chave: /^(cuidador|cuidadora)( de idosos?| de idosa)?$|^acompanhante de idos/, nomes: ["cuidador", "cuidadora", "acompanhante de idosos"] },
  { chave: /^(baba|baby ?sitter|bab[aá] folguista)$/, nomes: ["babá", "baby sitter"] },
  { chave: /^(garcom|garconete)$/, nomes: ["garçom", "garçonete"] },
  { chave: /^(motoboy|motofretista|entregador de moto)$/, nomes: ["motoboy", "motofretista", "entregador"] },
  // 21/11/2026, das conversas sem vaga com vaga parecida no ar ("estoquista" com "Auxiliar de estoque" no ar)
  { chave: /^(estoquista|auxiliar de estoque|almoxarife|auxiliar de almoxarifado)$/, nomes: ["estoquista", "auxiliar de estoque", "almoxarife", "auxiliar de almoxarifado"] },
  { chave: /^(porteiro|porteira|agente de portaria|controlador de acesso|controladora de acesso)( noturno| diurno)?$/, nomes: ["porteiro", "agente de portaria", "controlador de acesso"] },
  { chave: /^(coletor de lixo|coletor|gari|ajudante de coleta)$/, nomes: ["coletor", "gari", "ajudante de coleta"] },
  { chave: /^(operador de caixa|operadora de caixa|caixa|atendente de caixa|frente de caixa)$/, nomes: ["operador de caixa", "caixa", "atendente de caixa"] },
  // 21/11/2026 (Marcelo: "atendente é atendimento ao público"; "Agora não achei vaga de atendimento ao público" com
  // vagas de atendente no ar)
  { chave: /^(atendente|atendimento|atendimento ao (publico|cliente)|atendente de (loja|balcao|atendimento)|balconista)$/, nomes: ["atendente", "atendimento ao público", "atendente de loja", "atendente de balcão", "balconista"] },
];
export function funcoesEquivalentes(funcao: string) {
  const partes = funcao.trim().split(/\s+/);
  const primeira = simples(partes[0] ?? "");
  const f = simples(funcao.trim());
  const nomes = MESMO_TRABALHO.find((g) => g.chave.test(f))?.nomes;
  if (nomes) return nomes.filter((n) => simples(n) !== f);
  if (partes.length < 2 || !MESMO_NIVEL.includes(primeira)) return [];
  const resto = partes.slice(1).join(" ");
  // "ajudante administrativo" não existe: o ajudante só vale para o trabalho de mão (cozinha, obra, carga)
  const outras = MESMO_NIVEL.filter((n) => n !== primeira && (n !== "ajudante" || !/administrativ|financeir|escritori|contab|fiscal|rh|recursos humanos|comercial|vendas/i.test(simples(resto))));
  return outras.map((n) => `${n} ${resto}`);
}

/**
 * A mesma área, pela lista do Publike (20/11/2026; Marcelo: "seja assertivo, olhe bem essa feature e torne ela bem
 * poderosa, é o nosso maior funil de pessoas"): quem faz um trabalho da área vê as vagas da área, ditas como parecidas,
 * antes das parecidas da IA. A chave lê a função sem acento; os termos são buscados no título das vagas.
 */
const AREAS: { chave: RegExp; termos: string[] }[] = [
  { chave: /servicos gerais|\basg\b|limpeza|faxin|zelad|conservacao|copeir|diarista|camareir|higieniz/, termos: ["serviços gerais", "limpeza", "zelador", "copeira", "camareira", "faxineira"] },
  { chave: /cozinh|chapeir|pizzai|salgadeir|confeit|padari|padeir|churrasq|acougu|lanche/, termos: ["cozinha", "padaria", "chapeiro", "confeiteira", "salgadeira", "açougue"] },
  { chave: /garcom|garconete|bar\b|barman|cumim|recepcao de restaurante/, termos: ["garçom", "atendente", "cozinha", "copeira"] },
  { chave: /vendedor|vendas|loja|balconista|balcao|promotor|consultor|comercial|representante/, termos: ["vendedor", "vendas", "loja", "balcão", "promotor", "comercial"] },
  { chave: /\bcaixa\b|operador de caixa|frente de caixa/, termos: ["operador de caixa", "caixa", "atendente", "repositor"] },
  { chave: /estoqu|deposito|armazem|conferente|separador|repositor|carga|descarga|movimentador|logistica|almoxarif|expedicao/, termos: ["estoque", "depósito", "armazém", "conferente", "repositor", "movimentador", "logística"] },
  { chave: /porteir|portaria|vigia|vigilante|controlador de acesso|seguranca/, termos: ["portaria", "porteiro", "vigia", "controlador de acesso"] },
  { chave: /administrativ|escritorio|recepcion|secretari|financeir|faturamento|cobranca|\brh\b|recursos humanos|departamento pessoal/, termos: ["administrativo", "escritório", "recepcionista", "departamento pessoal", "financeiro", "recursos humanos"] },
  { chave: /contab|fiscal|contador/, termos: ["contábil", "fiscal", "departamento pessoal", "administrativo"] },
  { chave: /producao|montador|montagem|operador de maquina|industria|fabrica|linha de producao/, termos: ["produção", "montagem", "montador", "operador"] },
  { chave: /manutencao|eletricist|encanador|pedreiro|servente|obra|pintor|mecanic|instalador|marceneir|serralheir/, termos: ["manutenção", "eletricista", "instalador", "servente", "pedreiro", "obra"] },
  { chave: /manicure|pedicure|cabelei|estetic|maquiad|depilad|barbeir|nail|sobrancelh|lash/, termos: ["manicure", "esteticista", "cabeleireiro", "maquiador", "estética"] },
  { chave: /motorista|entregador|motoboy|condutor|frentista/, termos: ["motorista", "entregador", "motoboy", "frentista"] },
  { chave: /atendente|atendimento|recepc|telemarketing|sac\b/, termos: ["atendente", "recepcionista", "atendimento", "balcão"] },
  { chave: /baba|cuidador|cuidadora|acompanhante de idoso|domestic/, termos: ["babá", "cuidador", "doméstica", "serviços gerais"] },
];

/** Os termos da área de uma função ("faxineira" → serviços gerais, limpeza, zelador...). */
/**
 * Os programas de quem está começando (21/11/2026; Marcelo, com "Me interessei na vaga de jovem aprendiz" sem resposta
 * e vagas de estágio no ar: "não pode ter esse problema"): jovem aprendiz, estágio e trainee são o regime da vaga, nem
 * sempre o título. A busca vai pelo regime e, sem vaga do programa pedido, oferece os outros, ditos pelo nome.
 */
export type Programa = "aprendiz" | "estagio" | "trainee";
export const NOME_DO_PROGRAMA: Record<Programa, string> = { aprendiz: "jovem aprendiz", estagio: "estágio", trainee: "trainee" };
export function programaDe(funcao: string): Programa | null {
  const f = simples(funcao);
  if (/\baprendiz/.test(f)) return "aprendiz";
  if (/\bestagi/.test(f)) return "estagio";
  if (/\btrainee\b/.test(f)) return "trainee";
  return null;
}

export function termosDaArea(funcao: string) {
  const f = simples(funcao);
  return AREAS.filter((a) => a.chave.test(f)).flatMap((a) => a.termos);
}

/** Os níveis de liderança: "supervisor de logística" combina com "coordenador de logística" (19/11/2026). */
const NIVEIS = "gerente coordenador coordenadora supervisor supervisora encarregado encarregada lider chefe gestor gestora diretor diretora".split(
  " ",
);

/** A área de um cargo de liderança ("supervisor de logística" → "logística"); null quando não é de liderança. */
export function areaDaLideranca(funcao: string) {
  const ps = palavrasDaFuncao(funcao);
  if (ps.length < 2 || !NIVEIS.includes(ps[0])) return null;
  const area = funcao.trim().split(/\s+/).slice(1).join(" ").replace(/^(de|da|do|das|dos|em)\s+/i, "").trim();
  return area.length >= 3 ? area : null;
}

/** O título é de liderança na área ("Coordenador de Logística" para a área "logística"). */
export function tituloDeLideranca(titulo: string, area: string) {
  const palavras = simples(titulo).split(" ");
  return tituloDaFuncao(titulo, area) && NIVEIS.some((n) => palavras.some((w) => w.startsWith(n.slice(0, 5))));
}

/**
 * Palavras coladas por ponto, sublinhado ou barra ("diarista.domestica", "cozinheira/auxiliar"): separadas, para a
 * leitura achar cada função (21/11/2026). Endereços (publike.org, e-mail) ficam como estão.
 */
export function separarPalavrasColadas(texto: string) {
  return texto.replace(/(^|\s)([^\s@]+)(?=\s|$)/g, (tudo, antes: string, palavra: string) =>
    /^(https?:|www\.)/i.test(palavra) || /\.(com|org|net|br|gov|edu|io|app)(\.br)?\b/i.test(palavra)
      ? tudo
      : antes + palavra.replace(/(\p{L}{2,})[._/]+(?=\p{L}{2,})/gu, "$1 "),
  );
}

/** "a", "a e b", "a, b e c". */
const listaE = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs.at(-1)}`);

const unicos = (xs: (string | null | undefined)[], max: number) => {
  const vistos = new Set<string>();
  const r: string[] = [];
  for (const x of xs) {
    const t = (x ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!t || vistos.has(simples(t))) continue;
    vistos.add(simples(t));
    r.push(t);
    if (r.length >= max) break;
  }
  return r;
};

// --- O jeito de trabalho (20/11/2026; Marcelo: "entender melhor as nuances de vagas e sugerir algo correlacionado"):
// nas conversas, "primeiro emprego", "sou PCD", "diária", "home office", "o que tiver" viravam a função buscada e davam
// "não achei". Agora são filtros: a vaga precisa aceitar sem experiência, ser para PCD, de diária, remota... e
// "qualquer" traz as vagas mais perto quando a função não tem.

export const JEITOS = {
  sem_experiencia: "que aceitam sem experiência",
  pcd: "para PCD",
  diaria: "de diária",
  freelance: "de freelance",
  remoto: "home office",
  meio_periodo: "de meio período",
  fim_de_semana: "de fim de semana",
  qualquer: "",
} as const;
export type Jeito = keyof typeof JEITOS;
const ehJeito = (x: unknown): x is Jeito => typeof x === "string" && x in JEITOS;

const PALAVRAS_DO_JEITO: [Jeito, RegExp][] = [
  ["sem_experiencia", /\b(primeiro emprego|primeira vaga|primeiro trabalho|sem experiencia|nunca trabalhei)\b/g],
  ["pcd", /\b(pcd|pne|deficiencia|deficiente|cadeirante)\b/g],
  ["diaria", /\b(diarias?|bicos?)\b/g],
  ["freelance", /\b(freelancer|freelance|freela)\b/g],
  ["remoto", /\b(home ?office|remoto|remota|trabalhar de casa|de casa pela internet)\b/g],
  ["meio_periodo", /\b(meio periodo|meio expediente|part ?time)\b/g],
  ["fim_de_semana", /\b(fins? de semana|finais de semana|sabado e domingo)\b/g],
  ["qualquer", /\b(qualquer (coisa|area|vaga|servico|funcao|trabalho)|o que tiver|o que aparecer|o que der|outras areas|qualquer uma)\b/g],
];

/** O jeito de trabalho que o texto pede ("sou PCD em busca do primeiro emprego" → pcd, sem_experiencia). */
export function jeitoDoTexto(texto: string): Jeito[] {
  const t = simples(texto);
  return PALAVRAS_DO_JEITO.filter(([, r]) => new RegExp(r.source).test(t)).map(([j]) => j);
}

/** A função sem o jeito ("atendimento home office" → "atendimento"); null quando só sobra o jeito ("primeiro emprego"). */
export function funcaoSemJeito(funcao: string) {
  const original = simples(funcao);
  if (!PALAVRAS_DO_JEITO.some(([, r]) => new RegExp(r.source).test(original))) return funcao.trim() || null;
  let t = original;
  for (const [, r] of PALAVRAS_DO_JEITO) t = t.replace(new RegExp(r.source, "g"), " ");
  t = t
    .replace(/\b(exatamente|vaga|vagas|trabalho|emprego|busca|procuro|de|do|da|em|com|e|ou|para|no|na)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length >= 3 ? t : null;
}

type Vinda = { experiencia?: string | null; pcd?: string | null; modelo?: string | null; jornada?: string | null; regime?: string | null };
/** A vaga aceita o jeito pedido. */
export function vagaDoJeito(a: Vinda, jeitos: readonly Jeito[]) {
  return jeitos.every((j) => {
    switch (j) {
      case "sem_experiencia":
        return !a.experiencia || a.experiencia === "sem";
      case "pcd":
        return a.pcd === "tambem" || a.pcd === "exclusiva";
      case "diaria":
        return a.regime === "diaria";
      case "freelance":
        return a.regime === "freelance";
      case "remoto":
        return a.modelo === "remoto" || a.modelo === "hibrido";
      case "meio_periodo":
        return a.jornada === "meio_periodo";
      case "fim_de_semana":
        return a.jornada === "fim_de_semana";
      default:
        return true;
    }
  });
}

/** "que aceitam sem experiência e para PCD" (sem o "qualquer"). */
const nomeDoJeito = (jeitos: readonly Jeito[]) => listaE(jeitos.map((j) => JEITOS[j]).filter(Boolean));

// Só o jeito, sem a função (21/11/2026; Marcelo, com "Freelancer conjunto Vera Cruz II" respondido com o anúncio de
// outra pessoa que também é freelancer: "tem que perguntar o que ela quer fazer como freelancer"): freelance, diária,
// home office, meio período e fim de semana dizem como, não o quê. Pergunta a função antes de buscar. O "primeiro
// emprego", o PCD e o "qualquer coisa" seguem com as vagas mais perto.
const JEITOS_QUE_PEDEM_A_FUNCAO: readonly Jeito[] = ["freelance", "diaria", "remoto", "meio_periodo", "fim_de_semana"];

/** A pergunta da função, com o jeito que ela pediu ("Que tipo de trabalho de freelance você procura?"). */
export function perguntaDaFuncao(jeitos: readonly Jeito[], comBairro: boolean) {
  const qual = JEITOS_QUE_PEDEM_A_FUNCAO.find((j) => jeitos.includes(j))!;
  return [
    `Que tipo de trabalho ${JEITOS[qual]} você procura? 😊`,
    `Me diz a função, como garçom, atendente, auxiliar de cozinha, diarista ou entregador${comBairro ? ", e o bairro onde mora" : ""}, que eu te mando as vagas ${JEITOS[qual]} perto de você.`,
  ].join("\n\n");
}
/** A última resposta foi essa pergunta: o jeito dela vale para a função que vier agora. */
export const PERGUNTOU_A_FUNCAO = /Que tipo de trabalho (de freelance|de diária|home office|de meio período|de fim de semana) você procura/;

/**
 * Quem escreveu como quem procura trabalho, não como quem contrata ("Sou freelancer, comunicativa…", "Procuro emprego
 * de…"): o anúncio fica fora das vagas mandadas pelo WhatsApp.
 */
export function pareceQuemProcura(titulo: string) {
  return /^(eu )?(sou|estou (procurando|em busca|a procura)|procuro (emprego|trabalho|vaga|servico|oportunidade)|busco (emprego|trabalho|vaga|oportunidade)|preciso de (emprego|trabalho)|faco (diarias?|freelas?|bicos?))\b/.test(
    simples(titulo).trim(),
  );
}

type BuscaDeVagas = { texto: string; funcoes?: string[]; parecidas?: string[]; categoria: string; jeito?: Jeito[] };

/**
 * As vagas no ar para o que a pessoa disse, em linhas com o link, e a frase que as apresenta. Sem função (a
 * localização que ela mandou), as mais perto. Sem nada, null.
 */
async function procurarVagas(
  busca: BuscaDeVagas,
  onde: {
    local?: Local | null;
    ponto?: { lat: number; lng: number } | null;
  } = {},
  /** quantas vagas cabem nesta resposta (o que sobra das do dia) */
  max = 4,
  /** as vagas já mandadas nesta conversa: não vão de novo ("Tem mais vagas", 20/11/2026) */
  jaMandadas: ReadonlySet<string> = new Set(),
  /** as funções que ela disse e não tinham vaga no ar (Admin › Procuradas sem vaga, migração 20270822120000) */
  anotarSemVaga?: (funcoes: string[]) => void,
) {
  const centro = onde.ponto ?? (onde.local ? pontoDoLocal(onde.local) : null);
  // o bairro que não reconhecemos: o ponto é o centro da cidade, e "a menos de 1 km" seria do Setor Central
  const centroDaCidade = !onde.ponto && Boolean(onde.local && !onde.local.ponto && !onde.local.centro && !onde.local.regiao);
  // perto: o ponto que ela mandou, ou o bairro primeiro, depois a região e a cidade (quem corta é o raio)
  const perto = onde.ponto
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
  // longe: as cidades em volta, da mais perto para a mais longe (sem lugar, em volta de Goiânia)
  const longe = { ...(centro ? { p_lat: centro.lat, p_lng: centro.lng } : {}), p_raio_km: 100, p_ordem: "perto", p_por_distancia: true };
  type Anuncio = { id: string; titulo: string; bairro: string | null; cidade: string | null; distancia_km?: number | null } & Parameters<
    typeof valorDoAnuncio
  >[0];
  // o jeito pedido; sem vaga nenhuma desse jeito, a busca solta o jeito e diz isso (20/11/2026; Marcelo, com "auxiliar
  // de serviços gerais de diária" sem resposta e duas vagas de auxiliar de serviços gerais com carteira no ar)
  const jeitosPedidos = (busca.jeito ?? []).filter((j) => j !== "qualquer");
  let jeitos = jeitosPedidos;
  let semOJeito = false;
  const soltarOJeito = () => {
    if (semOJeito || !jeitos.length) return false;
    jeitos = [];
    semOJeito = true;
    return true;
  };
  const tentar = async (
    texto: string | null,
    lugar: Record<string, unknown>,
    categoria: string | null = null,
    /** o programa (jovem aprendiz, estágio, trainee): a busca pelo regime da vaga */
    programa: Programa | null = null,
  ) => {
    const regime = programa ?? (jeitos.includes("diaria") ? "diaria" : jeitos.includes("freelance") ? "freelance" : null);
    const { data, error } = await criarClientePublico().rpc("buscar_anuncios", {
      ...lugar,
      p_tipo: "vaga",
      p_texto: texto,
      p_categoria: categoria,
      p_regime: regime,
      p_limite: jeitos.length ? 60 : 20,
    } as never);
    const lista = ((error ? [] : (data ?? [])) as unknown as (Anuncio & Vinda)[]).filter((a) => !pareceQuemProcura(a.titulo));
    if (!jeitos.length || !lista.length) return lista;
    // o que a busca não traz (a experiência, PCD, o modelo e a jornada), para o filtro do jeito
    const { data: mais } = await criarClientePublico()
      .from("anuncios")
      .select("id, experiencia, pcd, modelo, jornada")
      .in(
        "id",
        lista.map((a) => a.id),
      );
    const porId = new Map(((mais ?? []) as ({ id: string } & Vinda)[]).map((x) => [x.id, x]));
    return lista.filter((a) => vagaDoJeito({ ...a, ...porId.get(a.id) }, jeitos));
  };

  /** `km`: das mais perto, de qualquer função (a distância vai na linha) */
  type Achada = { a: Anuncio; termo: string; parecida: boolean; longe: boolean; outras?: boolean; km?: boolean };
  const achadas: Achada[] = [];
  const ids = new Set<string>(jaMandadas);
  // as da função que ficaram de fora por já terem ido: "já te mandei as vagas de..."
  let repetidas = 0;
  // as funções (as que ela disse) que só tinham vagas que já foram
  const funcoesRepetidas = new Set<string>();
  // as parecidas (a mesma área, as da IA) que só tinham vagas que já foram: na busca de novo, não vira "outras funções"
  const parecidasQueForam = new Set<string>();
  // de cada termo, uma por vez (as duas funções que a pessoa disse aparecem), até caber
  const juntar = async (
    termos: string[],
    lugar: Record<string, unknown>,
    parecida: boolean,
    eLonge: boolean,
    combina: (titulo: string, termo: string) => boolean = tituloDaFuncao,
  ) => {
    if (achadas.length >= max || !termos.length) return;
    const listas = await Promise.all(
      termos.map(async (t) => ({ t, l: (await tentar(t, lugar)).filter((a) => combina(a.titulo, t)) })),
    );
    for (let i = 0; achadas.length < max && listas.some((x) => x.l.length > i); i++)
      for (const { t, l } of listas) {
        const a = l[i];
        if (a && !parecida && jaMandadas.has(codigoDaVaga(a.id))) {
          repetidas++;
          funcoesRepetidas.add(equivalentes.get(t) ?? t);
        }
        if (a && parecida && jaMandadas.has(codigoDaVaga(a.id))) parecidasQueForam.add(t);
        if (!a || ids.has(codigoDaVaga(a.id)) || achadas.length >= max) continue;
        ids.add(codigoDaVaga(a.id));
        achadas.push({ a, termo: t, parecida, longe: eLonge });
      }
  };

  const funcoes = unicos((busca.funcoes?.length ? busca.funcoes : [busca.texto]).map(funcaoSemJeito), 3);
  // sem função: as mais perto (ou as mais novas), do jeito pedido; com o jeito, também nas cidades em volta
  // sem função: as vagas mais perto dela, de qualquer função, aumentando o raio até caber (20/11/2026; Marcelo, com a
  // conversa em que a pessoa disse o bairro e "não sei qual vaga tá disponível" e o Publike perguntou a função duas
  // vezes: "precisa entender e enviar vagas genéricas mais próximas e ir aumentando o raio"). Sem lugar, as mais novas.
  const RAIOS_KM = [3, 8, 15, 30, 60, 100];
  const ehPrograma = (a: Anuncio & Vinda) =>
    ["aprendiz", "estagio", "trainee"].includes(a.regime ?? "") || /\b(estagi|aprendiz|trainee)/.test(simples(a.titulo));
  const semFuncao = async (semProgramas = false) => {
    const categoria = CATEGORIAS.some((c) => c.slug === busca.categoria) ? busca.categoria : null;
    const serve = (a: Anuncio & Vinda) => !semProgramas || !ehPrograma(a);
    const juntarPerto = async (cat: string | null) => {
      if (!centro) {
        for (const a of (await tentar(null, perto, cat)).filter(serve).slice(0, max))
          if (!ids.has(codigoDaVaga(a.id)) && achadas.length < max) {
            ids.add(codigoDaVaga(a.id));
            achadas.push({ a, termo: "", parecida: false, longe: false });
          }
        return;
      }
      for (const raio of RAIOS_KM) {
        if (achadas.length >= max) return;
        const l = await tentar(null, { p_lat: centro.lat, p_lng: centro.lng, p_raio_km: raio, p_ordem: "perto", p_por_distancia: true }, cat);
        for (const a of l.filter(serve)) {
          if (achadas.length >= max) break;
          if (ids.has(codigoDaVaga(a.id))) continue;
          ids.add(codigoDaVaga(a.id));
          achadas.push({ a, termo: "", parecida: false, longe: (a.distancia_km ?? 0) > 15, km: true });
        }
      }
    };
    if (categoria) await juntarPerto(categoria);
    if (!achadas.length) await juntarPerto(null);
  };
  // o nome equivalente → a função que a pessoa disse
  const equivalentes = new Map<string, string>();
  // a função que ela disse, perto e nas cidades em volta, e o mesmo trabalho com outro nome (assistente, auxiliar,
  // ajudante), para as que não acharam nada
  const daFuncao = async () => {
    await juntar(funcoes, perto, false, false);
    await juntar(funcoes, longe, false, true);
    for (const f of funcoes.filter((f) => !achadas.some((x) => x.termo === f)))
      for (const e of funcoesEquivalentes(f))
        if (!funcoes.some((g) => simples(g) === simples(e)) && !equivalentes.has(e)) equivalentes.set(e, f);
    // até 8: duas funções com outros nomes cada ("diarista": doméstica, empregada...; "cuidadora": cuidador...)
    const eqs = [...equivalentes.keys()].slice(0, 8);
    await juntar(eqs, perto, false, false);
    await juntar(eqs, longe, false, true);
  };
  // sem a função: a função mais curta, o mesmo cargo em outro nível, a mesma área e as parecidas da IA
  const vizinhas = async () => {
    const semNada = funcoes.filter((f) => !achadas.some((x) => x.termo === f || equivalentes.get(x.termo) === f));
    const curtas = unicos(
      semNada.flatMap((f) => [funcaoSemComplemento(f), funcaoCurta(f)]).filter((c) => c && !funcoes.some((f) => simples(f) === simples(c))),
      3,
    );
    await juntar(curtas, perto, false, false);
    await juntar(curtas, longe, false, true);
    if (achadas.length) return;
    // o mesmo cargo em outro nível da mesma área ("supervisor de logística": coordenador, gerente, encarregado de
    // logística), antes das parecidas (19/11/2026; Marcelo: "Tem vaga pra coordenador de logística")
    const areas = unicos(funcoes.map(areaDaLideranca), 3);
    await juntar(areas, perto, true, false, tituloDeLideranca);
    await juntar(areas, longe, true, true, tituloDeLideranca);
    if (achadas.length) return;
    // a mesma área, pela lista do Publike (faxineira → serviços gerais, limpeza, zelador...), antes das da IA
    const ja = new Set([...funcoes, ...curtas, ...equivalentes.keys()].map(simples));
    const daArea = unicos(funcoes.flatMap(termosDaArea), 6).filter((t) => !ja.has(simples(t)));
    await juntar(daArea, perto, true, false);
    await juntar(daArea, longe, true, true);
    if (achadas.length) return;
    const parecidas = unicos(busca.parecidas ?? [], 4).filter((p) => !ja.has(simples(p)) && !daArea.some((t) => simples(t) === simples(p)));
    await juntar(parecidas, perto, true, false);
    await juntar(parecidas, longe, true, true);
  };
  // jovem aprendiz, estágio, trainee: pelo regime; sem vaga do programa pedido, os outros programas
  let outroPrograma: Programa | null = null;
  const programas = funcoes.map((f) => ({ f, p: programaDe(f) })).filter((x): x is { f: string; p: Programa } => Boolean(x.p));
  if (funcoes.length && programas.length === funcoes.length) {
    // o programa já é de quem está começando: o "sem experiência" não corta nada
    jeitos = jeitos.filter((j) => j !== "sem_experiencia");
    const doPrograma = async (p: Programa, termo: string, parecida: boolean) => {
      for (const [lugar, eLonge] of [[perto, false], [longe, true]] as const)
        for (const a of await tentar(null, lugar, null, p)) {
          if (achadas.length >= max) return;
          if (ids.has(codigoDaVaga(a.id))) {
            if (!parecida && jaMandadas.has(codigoDaVaga(a.id))) repetidas++;
            continue;
          }
          ids.add(codigoDaVaga(a.id));
          achadas.push({ a, termo, parecida, longe: eLonge });
        }
    };
    for (const { f, p } of programas) await doPrograma(p, f, false);
    if (!achadas.length && !repetidas)
      for (const p of (["aprendiz", "estagio", "trainee"] as const).filter((x) => !programas.some((y) => y.p === x))) {
        await doPrograma(p, NOME_DO_PROGRAMA[p], true);
        if (achadas.length) {
          outroPrograma = p;
          break;
        }
      }
  }
  if (achadas.length || (programas.length && repetidas)) {
    // achou pelo programa (ou as do programa já foram todas)
  } else if (!funcoes.length) {
    await semFuncao();
    if (!achadas.length && soltarOJeito()) await semFuncao();
  } else {
    // a função primeiro, com o jeito e depois sem ele: "auxiliar de serviços gerais" com carteira vem antes de uma
    // parecida de diária
    await daFuncao();
    if (!achadas.length && soltarOJeito()) await daFuncao();
    // a função não tem vaga nova (ou já foram todas) e ela pediu diária ou freelance: as outras vagas desse jeito, da
    // mesma área e depois de qualquer função, vêm antes das parecidas de carteira assinada (22/11/2026; Marcelo, com
    // "Não tem diária?" de uma diarista respondido com vagas de serviços gerais CLT e 4 vagas de diária no ar: "tem
    // diária sim")
    if (!achadas.length && semOJeito && jeitosPedidos.some((j) => j === "diaria" || j === "freelance")) {
      jeitos = jeitosPedidos;
      semOJeito = false;
      await vizinhas();
      if (!achadas.length) {
        await semFuncao(true);
        for (const x of achadas) {
          x.parecida = true;
          x.outras = true;
        }
      }
      if (!achadas.length) {
        jeitos = [];
        semOJeito = true;
      }
    }
    if (!achadas.length) await vizinhas();
    if (!achadas.length && soltarOJeito()) {
      await daFuncao();
      if (!achadas.length) await vizinhas();
    }
    // nada da função nem parecido: as vagas mais perto, de outras funções (é o nosso maior funil: ninguém sai sem vaga
    // quando tem vaga no ar), ditas assim
    // (21/11/2026; Marcelo, com "zelador" procurado de novo: as de serviços gerais e limpeza já tinham ido, e vieram
    // estágio de contábeis e assistente administrativo: "não faz sentido") as parecidas que já foram não abrem as
    // outras funções; e as outras não trazem estágio, aprendiz nem trainee, que ela não pediu
    if (!achadas.length && !repetidas && !parecidasQueForam.size) {
      await semFuncao(true);
      for (const x of achadas) {
        x.parecida = true;
        x.outras = !busca.jeito?.includes("qualquer");
      }
    }
  }
  if (!achadas.length && !repetidas && !parecidasQueForam.size) anotarSemVaga?.(funcoes);
  if (!achadas.length)
    return repetidas
      ? { jaForam: true as const, parecidas: [] as string[] }
      : parecidasQueForam.size
        ? { jaForam: true as const, parecidas: [...parecidasQueForam].slice(0, 3) }
        : null;

  // as de perto primeiro
  achadas.sort((x, y) => Number(x.longe) - Number(y.longe));
  const linha = ({ a, longe: eLonge, km: comKm }: Achada) => {
    const valor = valorDoAnuncio(a);
    const d = a.distancia_km;
    const km =
      (eLonge || comKm) && centro && !centroDaCidade && d != null
        ? d < 1
          ? comKm ? " (a menos de 1 km)" : ""
          : ` (a ${Math.round(d)} km)`
        : "";
    // longe, a cidade sempre aparece (Goiânia e Anápolis mostram só o bairro)
    const lugar = formatarLugar(a.bairro ?? "", a.cidade ?? "");
    const onde1 = eLonge && a.cidade && !lugar.includes(a.cidade) ? `${lugar}, ${a.cidade}` : lugar;
    return `• *${a.titulo}*${valor ? ` · ${valor}` : ""} · ${onde1}${km}\n${linkDaVaga(a.id)}`;
  };
  // a mensagem com botão vai até 1.024 letras: com links longos, cabem menos vagas. Uma de cada função primeiro (21/11/2026:
  // "caixa, repositor, auxiliar de padaria" voltou com caixa e repositor e "não achei vaga de auxiliar de padaria", com
  // ela no ar: a de padaria ficou de fora no corte do tamanho)
  const primeiras: Achada[] = [];
  for (const x of achadas) if (!primeiras.some((y) => y.termo === x.termo)) primeiras.push(x);
  const prioridade = [...primeiras, ...achadas.filter((x) => !primeiras.includes(x))];
  let n = Math.min(Math.max(1, max), 4, prioridade.length);
  while (n > 1 && prioridade.slice(0, n).map(linha).join("\n\n").length > 760) n--;
  const usadas = prioridade.slice(0, n).sort((x, y) => Number(x.longe) - Number(y.longe));
  const perto1 = usadas.filter((x) => !x.longe);
  const longe1 = usadas.filter((x) => x.longe);
  // a função que a pessoa disse, com vaga, de um jeito ou de outro (o termo, o outro nome ou o título da vaga)
  const daFuncaoDita = (f: string, x: Achada) =>
    x.termo === f || equivalentes.get(x.termo) === f || (!x.parecida && tituloDaFuncao(x.a.titulo, f));
  // as funções que têm vaga, mas não couberam nesta mensagem: ficam para o próximo pedido
  const naoCouberam = funcoes.filter((f) => !usadas.some((x) => daFuncaoDita(f, x)) && achadas.some((x) => daFuncaoDita(f, x)));
  const texto =
    (perto1.length && longe1.length
      ? `${perto1.map(linha).join("\n\n")}\n\nUm pouco mais longe:\n\n${longe1.map(linha).join("\n\n")}`
      : usadas.map(linha).join("\n\n")) +
    (naoCouberam.length ? `\n\nTambém tem vaga de ${listaE(naoCouberam)}: é só me pedir que eu mando.` : "");

  // a frase que apresenta
  const parecidas = usadas[0].parecida;
  const achados = unicos(usadas.map((x) => x.termo), 3);
  // sem vaga mesmo: nem nesta mensagem, nem entre as que não couberam
  const semNada = funcoes.filter(
    (f) =>
      !achadas.some((x) => daFuncaoDita(f, x)) &&
      !achados.some((t) => simples(t) === simples(f)) &&
      !funcoesRepetidas.has(f),
  );
  if (semNada.length) anotarSemVaga?.(semNada);
  // as da função que já foram, quando a função não aparece de novo agora
  const jaForam = funcoes.filter((f) => funcoesRepetidas.has(f) && !usadas.some((x) => x.termo === f || equivalentes.get(x.termo) === f));
  const aqui = onde.local ? " perto de você" : "";
  const doJeito = nomeDoJeito(jeitos);
  const jeito1 = doJeito ? ` ${doJeito}` : "";
  // o jeito que ela pediu e não tinha ("de diária"): entra no "não achei"
  const pedido = nomeDoJeito(jeitosPedidos);
  const jeitoNao = semOJeito && pedido ? ` ${pedido}` : jeito1;
  let abertura: string | null;
  const mais1 = jaMandadas.size ? "mais " : "";
  if (!funcoes.length && semOJeito && pedido)
    abertura = `Agora não achei vagas ${pedido}. Olha ${mais1 ? "mais " : "as "}vagas no ar${centro ? " mais perto de você, de todas as funções" : ""}:`;
  else if (!funcoes.length)
    abertura = doJeito
      ? !perto1.length && onde.local
        ? `Perto de você não achei vagas ${doJeito}, mas tem em outras cidades da região:`
        : `Olha as vagas ${doJeito}${aqui}:`
      : centro
        ? `Olha ${mais1 ? "mais " : "as "}vagas no ar mais perto de você, de todas as funções:`
        : `Olha ${mais1 ? "mais " : "as "}vagas que entraram no ar agora há pouco, de todas as funções:`;
  else if (outroPrograma)
    abertura = `Agora não tem vaga de ${listaE(funcoes)} no ar. Olha as de ${NOME_DO_PROGRAMA[outroPrograma]}, que também são para quem está começando:`;
  else if (usadas[0].outras && doJeito)
    // as do jeito pedido, de outras funções ("de diária")
    abertura = repetidas
      ? `As vagas de ${listaE(funcoes)}${jeito1} que estão no ar eu já te mandei. Olha as outras vagas${jeito1}${aqui}, de outras funções: abra e veja se alguma te interessa.`
      : `Agora não achei vaga de ${listaE(funcoes)}${jeito1}. Olha as vagas${jeito1}${aqui}, de outras funções: abra e veja se alguma te interessa.`;
  else if (usadas[0].outras)
    abertura = `Agora não achei vaga de ${listaE(funcoes)}${jeitoNao} nem parecida. Olha as vagas no ar mais perto de você, de outras funções: abra e veja se alguma te interessa.`;
  else if (parecidas)
    abertura = repetidas
      ? `As vagas de ${listaE(funcoes)}${jeito1} que estão no ar eu já te mandei. Separei outras que podem combinar com a sua experiência. Elas não são de ${listaE(funcoes)}: abra e veja se encaixam no seu perfil.`
      : `Agora não achei vaga de ${listaE(funcoes)}${jeitoNao} no ar. Separei outras vagas que podem combinar com a sua experiência. Elas não são de ${listaE(funcoes)}: abra e veja se encaixam no seu perfil.`;
  else {
    const nao = (jaForam.length ? `As vagas de ${listaE(jaForam)} eu já te mandei. ` : "") + (semNada.length
      ? `Agora não achei vaga de ${listaE(semNada)}${jeitoNao}. `
      : semOJeito && pedido
        ? `Agora não achei vaga de ${listaE(achados)} ${pedido}. `
        : "");
    abertura = !perto1.length
      ? `${nao}${onde.local ? `Perto de você não achei vaga de ${listaE(achados)}${jeito1}, mas tem em outras cidades da região:` : `Olha as vagas de ${listaE(achados)}${jeito1}:`}`
      : `${nao}Olha as vagas de ${listaE(achados)}${jeito1}${aqui}${achados.some((t) => equivalentes.has(t)) ? ", que é o mesmo tipo de trabalho" : ""}:`;
    // mais vagas, depois das que já foram
    if (repetidas && !semNada.length && !jaForam.length)
      abertura = !perto1.length && onde.local
        ? `Perto de você, as vagas de ${listaE(achados)}${jeito1} eu já te mandei. Olha mais nas cidades da região:`
        : `Olha mais vagas de ${listaE(achados)}${jeito1}${aqui}:`;
    // tudo perto, da função que ela disse e sem jeito: vale a frase da IA
    else if (!semNada.length && !longe1.length && !doJeito && !semOJeito && achados.every((t) => funcoes.includes(t))) abertura = null;
  }
  const p = new URLSearchParams({ tipo: "vaga" });
  if (achados[0]) p.set("q", achados[0]);
  return {
    texto,
    quantas: n,
    abertura,
    /** só vagas de outras funções: o currículo vai junto */
    outras: Boolean(usadas[0].outras),
    mais: achadas.length > n || longe1.length ? { titulo: "Ver mais vagas", caminho: `/?${p}` } : null,
  };
}

/**
 * A resposta da busca: `abertura` (a frase que apresenta; null quando vale a da IA) e `texto` (as vagas e o depois);
 * sem vaga nenhuma, só a abertura com o "não achei", e o botão das vagas.
 */
async function mensagemDaBusca(
  busca: Partial<Busca> | null | undefined,
  local: Local | null,
  restam: number,
  /** o que a pessoa escreveu: o jeito de trabalho que a IA não marcou ("primeiro emprego", "sou PCD") */
  textos: string[] = [],
  /** as vagas que já foram nesta conversa */
  jaMandadas: ReadonlySet<string> = new Set(),
  anotarSemVaga?: (funcoes: string[]) => void,
) {
  const texto = busca?.texto?.trim().slice(0, 40) ?? "";
  const jeito = [...new Set([...(busca?.jeito ?? []).filter(ehJeito), ...jeitoDoTexto(`${texto} ${textos.join(" ")}`)])];
  const funcoes = unicos((busca?.funcoes?.length ? busca.funcoes : [texto]).map(funcaoSemJeito), 3);
  if (!funcoes.length && jeito.some((j) => JEITOS_QUE_PEDEM_A_FUNCAO.includes(j)))
    return { abertura: perguntaDaFuncao(jeito, !local), aberturaPadrao: "", texto: "", botao: null, quantas: 0 };
  const vagas = await procurarVagas(
    { texto, funcoes, parecidas: busca?.parecidas ?? [], categoria: busca?.categoria ?? "todas", jeito },
    { local },
    restam,
    jaMandadas,
    anotarSemVaga,
  );
  if (vagas && "jaForam" in vagas && vagas.parecidas?.length) {
    // as parecidas já foram (a busca de novo): diz isso, sem as vagas de outras funções
    const q = new URLSearchParams({ tipo: "vaga" });
    if (funcoes[0]) q.set("q", funcoes[0]);
    return {
      abertura: [
        `Agora não tem vaga de ${listaE(funcoes)} no ar, e as parecidas que estão no ar (de ${listaE(vagas.parecidas)}) eu já te mandei. Entram vagas novas todo dia: é só me chamar de novo.`,
        "E se ainda não deixou o seu *currículo* no Publike, deixe: é grátis, leva uns 2 minutos, e você recebe o aviso quando entrar vaga que combina com você.",
      ].join("\n\n"),
      aberturaPadrao: "",
      texto: "",
      botao: LINKS.curriculo as Botao,
      quantas: 0,
    };
  }
  if (vagas && "jaForam" in vagas) {
    // "Tem mais vagas" (20/11/2026; Marcelo: "precisa responder melhor algumas perguntas"): todas as da função já foram,
    // e nem parecida tem. Diz isso, em vez do "não achei", e abre o caminho: outra função, o currículo e o site.
    const q = new URLSearchParams({ tipo: "vaga" });
    if (funcoes[0]) q.set("q", funcoes[0]);
    return {
      abertura: [
        `Essas que te mandei são todas as vagas de ${listaE(funcoes)} no ar${local ? " perto de você e nas cidades em volta" : ""} agora. Entram vagas novas todo dia: é só me chamar de novo.`,
        "Quer ver de outra função? Me conta qual. 😊",
        "E se ainda não deixou o seu *currículo* no Publike, deixe: é grátis, leva uns 2 minutos, e você recebe o aviso quando entrar vaga que combina com você.",
      ].join("\n\n"),
      aberturaPadrao: "",
      texto: "",
      botao: LINKS.curriculo as Botao,
      quantas: 0,
    };
  }
  if (!vagas) {
    // sem vaga (20/11/2026; Marcelo: "a gente pode sugerir acessar a plataforma quando não tem vagas"): o currículo,
    // que as empresas acham por função e que faz o Publike avisar quando entrar vaga que combina, e as vagas do site
    const doJeito = nomeDoJeito(jeito.filter((j) => j !== "qualquer"));
    const qual = `${funcoes.length ? ` de ${listaE(funcoes)}` : ""}${doJeito ? `${funcoes.length ? "" : "s"} ${doJeito}` : ""}`;
    const q = new URLSearchParams({ tipo: "vaga" });
    if (funcoes[0]) q.set("q", funcoes[0]);
    return {
      abertura: [
        `Agora não achei vaga${qual} no ar${local ? ", nem perto de você nem nas cidades em volta" : ""}. Entram vagas novas todo dia.`,
        "Enquanto isso, deixe o seu *currículo* no Publike: é grátis e leva uns 2 minutos. As empresas da região procuram candidatos por função e chamam direto, e você recebe o aviso quando entrar vaga que combina com você.",
        `Ver todas as vagas no ar: ${link(`/?${q}`)}`,
      ].join("\n\n"),
      aberturaPadrao: "",
      texto: "",
      botao: LINKS.curriculo as Botao,
      quantas: 0,
    };
  }
  // só de outras funções: o currículo, para as empresas acharem a função dela e para o aviso da vaga que combina
  const curriculo = vagas.outras
    ? "\n\nE deixe o seu *currículo* no Publike: é grátis, leva uns 2 minutos, e você recebe o aviso quando entrar vaga que combina com você."
    : !funcoes.length
      ? `\n\n${local ? PEDIR_A_FUNCAO_DEPOIS : PEDIR_FUNCAO_E_BAIRRO_DEPOIS}`
      : "";
  return {
    abertura: vagas.abertura,
    /** a frase quando não vale a da IA (a busca de novo) */
    aberturaPadrao: `Olha as vagas de ${listaE(funcoes)}${local ? " perto de você" : ""}:`,
    texto: `${vagas.texto}\n\n${depoisDasVagas(restam - vagas.quantas)}${curriculo}`,
    botao: (vagas.outras ? LINKS.curriculo : (vagas.mais ?? (restam - vagas.quantas <= 0 ? LINKS.vagas : null))) as Botao | null,
    quantas: vagas.quantas,
  };
}

/** O parágrafo do currículo nas mensagens das vagas (o "deixe o seu currículo no Publike", com o botão do site). */
const PARAGRAFO_DO_CURRICULO =
  /(E se ainda não deixou o seu \*currículo\* no Publike|Enquanto isso, deixe o seu \*currículo\* no Publike|E deixe o seu \*currículo\* no Publike)[^\n]*/;
/**
 * Com o currículo pelo WhatsApp ligado, o convite diz que dá para montar aqui, falando (22/11/2026; Marcelo, com o "deixe
 * o seu currículo" e o botão do site: "não deveria deixar claro que pode ser falando?"), com o botão Montar meu currículo.
 */
export const CONVITE_CURRICULO_FALANDO =
  "Ainda não tem currículo? Eu monto com você aqui mesmo, *falando*: é só mandar áudio, sem precisar digitar. É grátis, leva uns 5 minutos, e as empresas da região passam a te achar. Toque em *Montar meu currículo*.";

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

function boasVindas(nome: string | null, comeco: string, doAnuncio = false) {
  return [
    // quem veio do anúncio já recebeu o "Oi! 👋 Aqui é o Marcelo" da Meta (`BOAS_VINDAS_DO_ANUNCIO`)
    doAnuncio ? null : `${oi(nome, comeco)} 👋 Aqui é o ${QUEM_ATENDE}, do Publike.`,
    // o que cada caminho ganha, na ordem dos botões (21/11/2026; Marcelo: "dar uma opção para o usuário entender que
    // vale a pena, isso leva ele pra plataforma")
    `O Publike é *grátis*, em ${ONDE_FUNCIONA}. Como posso te ajudar?`,
    "💼 *Procura emprego?* Eu te mando aqui as vagas perto da sua casa.\n📄 *Já tem currículo?* Deixe no Publike: as empresas da região procuram candidatos pela função e chamam direto, e você fica sabendo de cada vaga nova que combina com você.\n📢 *Vai contratar?* Me manda a foto do anúncio que eu deixo a vaga pronta, de graça.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** O "Tenho currículo": o ganho e o botão do site, onde a pessoa entra pelo WhatsApp e manda o PDF ou a foto. */
export const PARA_QUEM_TEM_CURRICULO = [
  "Ótimo! Com o seu currículo no Publike:",
  "• as empresas da região te acham pela função e chamam direto;\n• você recebe o aviso de cada vaga nova que combina com você;\n• e se candidata com um toque, sem preencher nada de novo.",
  "É grátis e leva uns 2 minutos: toque no botão abaixo, entre com o seu WhatsApp e mande o PDF ou uma foto do currículo. O Publike preenche tudo para você conferir.",
  EQUIPE_POR_ESCRITO,
].join("\n\n");

// "Procuro trabalho" (19/11/2026; Marcelo: "As pessoas estão parando aqui"): antes, o passo a passo em três itens e a
// pergunta no fim, com o botão Ver vagas competindo com ela. Agora, curta: só a pergunta, com o exemplo, sem botão (as
// vagas vêm na resposta, com o link de cada uma e o "Curtir" para se candidatar).
const PARA_QUEM_PROCURA = [
  "Que bom! 😊 Eu te mando as vagas por aqui, de graça.",
  "*Me conta o que você faz e o bairro onde mora.*",
  "Por exemplo: _sou cozinheira e moro no Jardim América_.",
].join("\n\n");

/** Depois das vagas mais perto, de qualquer função: a função, para mandar só as dela (sem ser pergunta de novo). */
export const PEDIR_A_FUNCAO_DEPOIS = "Se me disser o que você faz, eu separo só as vagas da sua função. 😊";
/** O mesmo, sem saber onde ela mora (as vagas mais novas): a função e o bairro. */
export const PEDIR_FUNCAO_E_BAIRRO_DEPOIS =
  "Se me disser o que você faz e o bairro onde mora, eu separo as vagas da sua função mais perto de você. 😊";

/** O "ok" de quem procura trabalho: a pergunta, clara, com um exemplo. */
export const PEDIR_FUNCAO_E_BAIRRO =
  "Combinado! 😊 *Me conta o que você faz e o bairro onde mora*, que eu te mando as vagas. Por exemplo: _sou cozinheira e moro no Jardim América_.";

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

// --- Quem chega para publicar vaga (20/11/2026; Marcelo: "percebi que as pessoas que entram para publicar vagas
// costumam nao seguir"). Nos 10 dias antes, 17 de 23 conversas que começaram com "Quero publicar uma vaga pelo
// WhatsApp" (a mensagem pronta do anúncio "Contratando") pararam na primeira resposta, que pedia de cara a foto, o PDF
// ou o texto com cargo, salário, horário e bairro. Agora: o texto curto com os 3 botões; "Montar a vaga comigo" faz 3
// perguntas, uma de cada vez, e o Publike lê as respostas como uma vaga; quem parou recebe 1 lembrete 2 horas depois.

/** Os botões da entrada de quem quer publicar ("Procuro emprego" é o mesmo do menu: a migração marca "trabalho"). */
const BOTOES_DA_VAGA = [
  { id: "a:vaga-mandar", titulo: "Mandar foto ou texto" },
  { id: "a:vaga-montar", titulo: "Montar a vaga comigo" },
  { id: "a:trabalho", titulo: "Procuro emprego" },
];
export const ENTRADA_DA_VAGA =
  "Vamos colocar sua vaga no ar, é grátis.\n\n📸 Se a vaga já está escrita (cartaz, print, PDF ou texto), é só mandar.\n✍️ Se não está, eu te faço 3 perguntas rápidas e monto com você.";
export const MANDAR_A_VAGA =
  "Pode mandar aqui a foto do cartaz, o print, o PDF ou o texto da vaga. O Publike lê, monta a vaga e eu te mando o link para conferir e publicar.";
export const PERGUNTAS_DA_VAGA = [
  "Vamos lá! *1 de 3:* qual é o cargo da vaga? Por exemplo: _auxiliar de cozinha_, _vendedora_, _motorista_.",
  "*2 de 3:* qual é o salário? Pode ser por mês, por dia ou _a combinar_.",
  "*3 de 3:* em que bairro e cidade é o trabalho?",
];
const MARCAS_DAS_PERGUNTAS = ["*1 de 3:*", "*2 de 3:*", "*3 de 3:*"];
// a resposta vaga ("por mês", só "Goiânia") ganha uma pergunta de novo, uma vez só, com o exemplo (20/11/2026: a Gardenia
// respondeu "Por mês" e "Goiânia", e a vaga veio com "Faltou dizer o salário, o bairro e o horário" logo depois)
export const DE_NOVO_SALARIO =
  "*2 de 3:* qual é o valor do salário? Por exemplo: _1.800 por mês_, _100 por dia_ ou _a combinar_.";
export const DE_NOVO_LUGAR = "*3 de 3:* e qual é o bairro ou setor do trabalho? Por exemplo: _Setor Bueno, Goiânia_.";
const CIDADES_DA_REGIAO =
  /\b(goi[aâ]nia|an[aá]polis|aparecida( de goi[aâ]nia)?|senador canedo|trindade|goianira|ner[oó]polis|bela vista( de goi[aâ]s)?|hidrol[aâ]ndia|inhumas|guap[oó]|abadia de goi[aâ]s|goi[aá]s|go)\b/gi;
/** "por mês", "mensal": sem o valor e sem "a combinar" */
export function salarioVago(texto: string) {
  return !/\d/.test(texto) && !/combin|negoci|definir|comiss/i.test(texto);
}
/** só a cidade ("Goiânia", "Sou de Goiânia"), sem o bairro */
export function lugarVago(texto: string) {
  const resto = texto
    .replace(CIDADES_DA_REGIAO, " ")
    .replace(/\b(sim|sou|de|da|do|em|na|no|[eé]|fica|cidade|onde|aqui|me|dizer|pode|p[oô]de|o|a|ok|trabalho|vaga|centro-oeste)\b/gi, " ")
    .replace(/[^\p{L}]/gu, "");
  return resto.length < 3;
}
/** Para quem parou na entrada, no "pode mandar" ou numa das 3 perguntas, 2 horas depois (uma vez), com os 2 botões. */
export const LEMBRETE_VAGA =
  "Ainda quer publicar a vaga? 😊 É grátis: mande a foto ou o texto dela, ou toque em *Montar a vaga comigo* que eu te faço 3 perguntas rápidas.";
/** Os pedaços das mensagens em que dá para parar (o lembrete procura na última mensagem do robô). */
// "manda aqui mesmo" e "mandar aqui mesmo": a resposta de antes (a IA e o `paraQuemContrata`), que pedia a vaga de cara
// (20/11/2026; Marcelo: "Pode", para o lembrete valer também a quem parou nela)
const MARCAS_DA_VAGA = [
  "Vamos colocar sua vaga no ar",
  MANDAR_A_VAGA.slice(0, 32),
  ...MARCAS_DAS_PERGUNTAS,
  "manda aqui mesmo",
  "mandar aqui mesmo",
];

/** A mensagem pronta do anúncio "Contratando" (ou parecida, curta): "Olá! Quero publicar uma vaga pelo WhatsApp." */
export function querPublicarVaga(texto: string) {
  return texto.trim().length <= 90 && /\bquero (publicar|anunciar|divulgar) (uma |a )?vaga\b/i.test(texto);
}

/** Em qual das 3 perguntas a conversa está (pela última resposta do robô): 0, 1, 2, ou -1 fora delas. */
export function perguntaDaVaga(minhaUltima: string) {
  return MARCAS_DAS_PERGUNTAS.findIndex((m) => minhaUltima.includes(m));
}

/** As 3 respostas (cargo, salário, lugar): o que a pessoa escreveu depois de cada pergunta; a última vem em `agora`. */
export function respostasDaVaga(historico: Mensagem[], agora: string[]) {
  const respostas: string[] = ["", "", ""];
  let i = -1;
  for (const m of historico) {
    if (m.de !== "pessoa") {
      const k = perguntaDaVaga(m.texto);
      // a pergunta 1 de novo (tocou em "Montar a vaga comigo" outra vez): recomeça
      if (k === 0) respostas.fill("");
      i = k;
      continue;
    }
    if (i >= 0) respostas[i] = [respostas[i], m.texto.trim()].filter(Boolean).join(" ");
  }
  if (!respostas[2]) respostas[2] = agora.join(" ").trim();
  return { cargo: respostas[0], salario: respostas[1], lugar: respostas[2] };
}

const BOTAO_DA_VAGA_PREPARADA = /\[Botão: (Conferir e publicar|Ver as vagas)\]/;

/**
 * A vaga escrita que já virou o link (a última mensagem do robô é a vaga preparada): o texto lido, para ler de novo com
 * o que a pessoa contou depois. `null`: a última não é a vaga preparada, ou a vaga veio de foto ou arquivo.
 */
export function textosDaVagaPreparada(historico: Mensagem[]): { texto: string; jaDisse: string[] } | null {
  // a equipe pode ter escrito depois da vaga preparada ("me diz o bairro que eu completo"): conta a última do robô
  let ultimaDoRobo = -1;
  for (let i = historico.length - 1; i >= 0; i--)
    if (historico[i].de === "robo") {
      ultimaDoRobo = i;
      break;
    }
  if (ultimaDoRobo < 0 || !BOTAO_DA_VAGA_PREPARADA.test(historico[ultimaDoRobo].texto)) return null;
  // onde a vaga começou: a pergunta 1, o "pode mandar" ou a entrada
  let inicio = -1;
  for (let i = ultimaDoRobo - 1; i >= 0; i--) {
    const t = historico[i].texto;
    if (historico[i].de === "pessoa") continue;
    if (t.includes(MARCAS_DAS_PERGUNTAS[0]) || t.startsWith(MANDAR_A_VAGA.slice(0, 32)) || /vamos colocar sua vaga no ar/i.test(t)) {
      inicio = i;
      break;
    }
  }
  if (inicio < 0) return null;
  const trecho = historico.slice(inicio, ultimaDoRobo + 1);
  if (trecho.some((m) => m.de === "pessoa" && /^\[a pessoa mandou/.test(m.texto))) return null;
  // as mensagens depois da vaga preparada (já completando) também entram
  const depois = historico.slice(ultimaDoRobo + 1).filter((m) => m.de === "pessoa").map((m) => m.texto.trim());
  if (trecho.some((m) => m.de !== "pessoa" && m.texto.includes(MARCAS_DAS_PERGUNTAS[0]))) {
    const r = respostasDaVaga(trecho, []);
    return {
      texto: [textoDaVagaMontada(r), ...depois].join(" "),
      jaDisse: /combin|negoci|definir/i.test(r.salario) ? ["o salário"] : [],
    };
  }
  const botoes = new Set(BOTOES_DA_VAGA.map((b) => b.titulo));
  const escritos = trecho
    .filter((m) => m.de === "pessoa" && !botoes.has(m.texto.trim()) && !querPublicarVaga(m.texto))
    .map((m) => m.texto.trim());
  return escritos.length ? { texto: [...escritos, ...depois].join("\n"), jaDisse: [] } : null;
}

/** O texto que o Publike lê como a vaga (o mesmo leitor da foto e do texto). */
export function textoDaVagaMontada(r: { cargo: string; salario: string; lugar: string }) {
  return `Vaga de emprego para ${r.cargo}. Salário: ${r.salario || "a combinar"}. Local de trabalho: ${r.lugar}.`;
}

/** O modo econômico (o teto do mês): uma mensagem só por dia para quem procura trabalho, com o botão das vagas. */
export const ECONOMICO_TRABALHO =
  "As vagas perto de você estão no botão abaixo: escolha o bairro, veja o salário e se candidate com um toque, de graça.";
export const ECONOMICO_SEM_PERFIL =
  "Procura trabalho? As vagas perto de você estão no botão abaixo, de graça. Quer contratar? Mande aqui a foto ou o texto da vaga, que eu preparo para você publicar.";

/**
 * A equipe devolveu a conversa para o automático (19/11/2026; Marcelo: "eu devolvi pra IA porque ela procura
 * trabalho"): se a última mensagem é da pessoa e ficou sem resposta, o automático responde agora, como se ela tivesse
 * acabado de mandar (o botão que ela tocou vale de novo). O "Falar com a equipe" não volta para a equipe.
 */
/**
 * A equipe devolveu com os botões (19/11/2026; Marcelo: "dar uma opção pra voltar pra IA com botões novamente"): no lugar
 * de responder a última mensagem, o atendimento manda os botões do começo de novo.
 */
export const VOLTEI_COM_BOTOES = "Pronto! 😊 Para continuar, é só tocar numa das opções abaixo.";

export async function retomarConversa(conversa: string, numero: string, opcoes: { comBotoes?: boolean } = {}) {
  const cfg = configMeta();
  const acesso = acessoFila();
  if (!cfg || !acesso) return;
  const { cliente: banco, chave } = acesso;
  const { data, error } = await banco.rpc("servidor_whatsapp_conversa_ultima", { p_chave: chave, p_conversa: conversa });
  if (error || !data) return;
  const u = data as unknown as { wamid: string | null; situacao: "robo" | "equipe"; historico: Mensagem[] };
  const ultima = u.historico.at(-1);
  if (u.situacao !== "robo" || !ultima) return;
  if (opcoes.comBotoes) {
    await atenderConversa(
      cfg,
      banco,
      chave,
      { wamid: u.wamid ?? "", numero, texto: "", payload: null, nome: null, origem: null },
      { retomada: true, comBotoes: true, espera: { texto: 0, botao: 0 } },
    );
    return;
  }
  if (!u.wamid || ultima.de !== "pessoa") return;
  const botao = [...MENU, ...BOTOES_DE_ANTES, ...BOTOES_DA_VAGA].find((b) => b.titulo === ultima.texto.trim());
  if (botao?.id === "a:equipe") return;
  await atenderConversa(
    cfg,
    banco,
    chave,
    { wamid: u.wamid, numero, texto: ultima.texto, payload: botao?.id ?? null, nome: null, origem: null },
    { retomada: true, espera: { texto: 0, botao: 0 } },
  );
}

/**
 * As funções que a pessoa procurou e não tinham vaga no ar (migração 20270822120000): só a função, a cidade e a região;
 * a conversa vai só para o banco contar pessoas sem repetir (ele guarda uma impressão). Sem a migração, nada.
 */
async function anotarProcuraSemVaga(banco: ClienteBanco, chave: string, conversa: string, funcoes: string[], local: Local | null) {
  const fs = unicos(funcoes.map((f) => f.trim()).filter((f) => f.length >= 3), 3);
  if (!fs.length) return;
  const { error } = await banco.rpc("servidor_procura_sem_vaga", {
    p_chave: chave,
    p_funcoes: fs,
    p_cidade: local?.cidade ?? null,
    p_regiao: local?.regiao ?? null,
    p_quem: conversa,
    p_origem: "whatsapp",
  });
  if (error && error.code !== "PGRST202") console.error("Publike: não deu para anotar a procura sem vaga:", error.message);
}

/** O teto do mês (migração 20270808120000); sem a migração ou com erro, null (segue normal). */
async function tetoDoMes(banco: ClienteBanco, chave: string, conversa: string) {
  const { data, error } = await banco.rpc("servidor_whatsapp_teto", { p_chave: chave, p_conversa: conversa });
  if (error || !data) return null;
  return data as unknown as { teto: number; enviadas: number; economico: boolean; respondida_hoje: boolean };
}

// Quem mora fora (20/11/2026, revendo as conversas): "auxiliar de cozinha e moro na Zn sp freguesia do ó" recebeu as
// vagas de Goiânia, porque a IA não marcou "busca.fora". Antes de mandar vagas, a conferência daqui: depois de "moro",
// "sou de", "estou em"..., um estado, uma capital de fora ou a sigla de outro estado ("Natal RN", "Lages SC", "zn sp").
const LUGARES_DE_FORA = [
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal", "Brasília", "Espírito Santo",
  "Maranhão", "Mato Grosso do Sul", "Mato Grosso", "Minas Gerais", "Minas", "Paraíba", "Paraná", "Pernambuco", "Piauí",
  "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima", "Santa Catarina", "São Paulo",
  "Sergipe", "Tocantins", "Rio Branco", "Maceió", "Macapá", "Manaus", "Salvador", "Fortaleza", "São Luís", "Cuiabá",
  "Campo Grande", "Belo Horizonte", "Belém", "João Pessoa", "Curitiba", "Recife", "Teresina", "Porto Alegre",
  "Porto Velho", "Boa Vista", "Florianópolis", "Aracaju", "Uberlândia", "Campinas", "Guarulhos", "Imperatriz",
  "Campina Grande", "Feira de Santana", "Joinville", "Londrina",
]
  .map((nome) => ({ nome, chave: simples(nome) }))
  .sort((a, b) => b.chave.length - a.chave.length);
// sem as que são palavras ("se", "pé", "cê", "má", "pá", "és")
const SIGLAS_DE_FORA = "ac al ap am ba df mt ms mg pb pr pi rj rn rs ro rr sc sp".split(" ");
const DEPOIS_DE = /\b(?:moro|morando|resido|vivo|sou de|sou do|sou da|estou em|estou no|estou na)\b/;

/** O lugar fora de onde o Publike funciona que a pessoa disse ("moro na zn sp" → "SP"); senão null. */
export function lugarDeFora(texto: string) {
  const t = simples(texto);
  const m = DEPOIS_DE.exec(t);
  if (!m) return null;
  const depois = ` ${t.slice(m.index + m[0].length).replace(/[^a-z0-9 ]/g, " ")} `;
  // mora numa cidade daqui: não é de fora ("sou de Minas, moro em Goiânia")
  if (CIDADES.some((c) => depois.includes(` ${simples(c)} `))) return null;
  const lugar = LUGARES_DE_FORA.find(({ chave }) => depois.includes(` ${chave} `));
  if (lugar) return lugar.nome;
  const sigla = SIGLAS_DE_FORA.find((s) => depois.includes(` ${s} `));
  return sigla ? sigla.toUpperCase() : null;
}

/** Fora de onde o Publike funciona (a cidade que a pessoa disse, ou a localização sem vaga perto). */
export function aindaNaoDisponivel(cidade: string | null) {
  return cidade
    ? `O Publike ainda não está disponível em ${cidade}. Por enquanto, as vagas são de ${ONDE_FUNCIONA}. Se você puder trabalhar por aqui, me diz o bairro que eu procuro para você.`
    : `Ainda não tenho vagas perto desse lugar. Por enquanto, o Publike está disponível em ${ONDE_FUNCIONA}: entram vagas novas todo dia, e as que estão no ar ficam no botão abaixo.`;
}

/** As vagas de hoje acabaram: amanhã tem mais, e o site tem todas. */
const ACABARAM_AS_DE_HOJE = "Hoje eu já te mandei bastante vaga por aqui. Amanhã eu mando mais! Enquanto isso, todas as vagas no ar estão no botão abaixo.";

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
- Na sua primeira mensagem para a pessoa (está dito em "Sobre esta conversa"), comece com "Oi, <primeiro nome>! Aqui é o ${QUEM_ATENDE}, do Publike." (sem nome, só "Oi!"; se ela disse "bom dia", "boa tarde" ou "boa noite", comece igual) e diga numa frase o que é o Publike; depois responda. Nas outras, não se apresente de novo e não comece com "Oi". Se "Sobre esta conversa" diz que ela já foi cumprimentada pelo anúncio, também não: responda direto.
- O nome que vem em "Sobre esta conversa" é o da pessoa, não o seu: chame pelo nome no máximo uma vez, na saudação.
- Se a pessoa perguntar se está falando com um robô, diga com franqueza que é o atendimento automático do Publike, em nome do ${QUEM_ATENDE}, e que alguém da equipe responde por aqui se ela quiser.

Como responder
- Responda o que a pessoa perguntou: simples, mas completo, com o que ela precisa saber para resolver. Se a pergunta tiver duas partes, responda as duas.
- Escreva como numa conversa de WhatsApp: frases curtas, palavras do dia a dia, gentil e direto, sem jargão de RH.
- Parágrafos curtos, com uma linha em branco entre eles. No máximo umas 5 frases; para um passo a passo, até 3 itens numerados ("1.", "2.", "3."), curtos.
- *negrito* do WhatsApp em no máximo duas palavras. No máximo um emoji, e só se combinar. Sem títulos, sem markdown, sem listas com hífen ou asterisco.
- Sem pressa de vender: não termine toda mensagem com uma pergunta nem convidando a publicar vaga, procurar vaga ou fazer currículo. Ofereça o próximo passo só quando ele ajudar a pessoa a resolver o que ela falou, e uma vez só.
- Não escreva links nem endereços de site. Quando a pessoa precisar abrir o site, escolha o botão no campo "link": ele vai junto da mensagem, e no texto você pode dizer "é só tocar no botão abaixo".
- Não repita o que você já disse na conversa. Não pergunte se a pessoa procura trabalho ou quer contratar: quando ainda não se sabe, a mensagem já vai com os botões "Procuro emprego", "Tenho currículo" e "Quero contratar".
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
- buscar_vagas: a pessoa procura trabalho e disse o que faz ou que vaga quer ("sou cozinheira", "tem vaga de motorista?"), agora ou antes na conversa. ${REGRAS_DA_BUSCA} "busca.categoria" só se tiver certeza (senão "todas"); "busca.cidade" com a cidade onde ela mora ou quer trabalhar, se ela disse (uma das cidades da lista; senão vazio); e "busca.bairro" com o bairro, como ela escreveu (senão vazio). Se a cidade que ela disse não está na lista (fica fora de onde o Publike funciona), deixe "busca.cidade" vazio e ponha o nome dela em "busca.fora", como ela escreveu; senão, "busca.fora" vazio. A "resposta" é só uma frase curta que apresenta as vagas, como "Olha as vagas de motorista perto do Jardim América:"; a lista vai logo depois.
- Sem a função: se ela procura trabalho e não disse o que faz, mas disse onde mora ou quer trabalhar, ou disse que não sabe, que topa o que tiver, perguntou que vagas tem, ou você já perguntou o que ela faz, use buscar_vagas com "busca.texto" e "busca.funcoes" vazios, "busca.jeito" com "qualquer" (mais o jeito que ela pediu), e a cidade e o bairro que ela disse: vão as vagas mais perto dela, de todas as funções, e o Publike pede a função depois, para filtrar. Só use responder para perguntar o que ela faz e onde mora quando ela ainda não disse nada disso; nunca pergunte a função duas vezes.
- equipe: a pessoa pede para falar com alguém, reclama, fala de pagamento, cobrança ou golpe, de problema na conta, de parceria ou de imprensa, ou você não sabe a resposta. Responda o que der (no golpe: não pague nada) e diga que vai pedir para alguém da equipe responder por aqui, no prazo que está em "Sobre esta conversa".
- silencio: a mensagem não pede resposta, como "ok", "beleza", "👍" ou um "obrigado" depois que você já se despediu. Deixe "resposta" vazia. Mas "ok", "sim" e "pode ser" logo depois de uma pergunta sua são resposta: se você tinha perguntado o que ela faz ou oferecido as vagas, use buscar_vagas (sem a função, se ela não disse).
Fora de buscar_vagas, "busca" vai com texto, cidade, bairro e fora vazios, funcoes, parecidas e jeito vazios e categoria "todas".

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
  // já perguntou o que ela faz, e ainda não mandou vaga: não perguntar de novo (20/11/2026)
  const minhas = e.historico.filter((x) => x.de !== "pessoa");
  const jaPerguntou =
    minhas.some((x) => perguntouAFuncao(x.texto) || /o que você faz e o bairro/i.test(x.texto)) &&
    !minhas.some((x) => /\/anuncio\//.test(x.texto));
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
    jaFalou
      ? "- Você já falou com ela nesta conversa."
      : veioDoAnuncio(e.origem)
        ? `- Esta é a sua primeira resposta, mas ela já foi cumprimentada pelo anúncio: ao tocar nele, recebeu do Publike "${BOAS_VINDAS_DO_ANUNCIO}". Não comece com "Oi" e não se apresente: responda direto ao que ela mandou.`
        : "- Esta é a sua primeira mensagem para ela.",
    `- Se passar a conversa para a equipe, alguém responde por aqui ${quandoAEquipeResponde(agora)}.`,
    jaPerguntou
      ? "- Você já perguntou o que ela faz. Não pergunte de novo: se ela ainda não disse a função, use buscar_vagas sem a função (vão as vagas mais perto dela, de todas as funções), com a cidade e o bairro que ela disse."
      : null,
    vagasPorAqui
      ? "- Quem quer publicar uma vaga pode mandar aqui mesmo, nesta conversa, a foto do anúncio, o PDF ou o texto da vaga (o cargo, o salário, o horário e o bairro): o Publike lê, prepara a vaga e manda o link para a pessoa conferir e publicar. Diga isso quando a pessoa quiser publicar, em vez de mandar para o site."
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function transcricao(historico: Mensagem[]) {
  const quem = { pessoa: "Pessoa", robo: "Você", equipe: "Equipe" } as const;
  return `Conversa até agora:\n${historico.map((m) => `${quem[m.de]}: ${separarPalavrasColadas(m.texto)}`).join("\n")}\n\nResponda à Pessoa (às mensagens dela depois da sua última resposta).`;
}

/** O modelo do chat (Admin › IA), se a IA está configurada. */
async function modeloDoAtendimento() {
  if (!iaConfigurada()) return null;
  const { data } = await criarClientePublico().rpc("config_publica");
  return modeloPara(data?.[0], "chat");
}

/** O modelo de "Ler currículo e vaga" (Admin › IA), para o currículo pelo WhatsApp. */
async function modeloDoLer() {
  if (!iaConfigurada()) return null;
  const { data } = await criarClientePublico().rpc("config_publica");
  return modeloPara(data?.[0], "ler");
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
  opcoes: {
    espera?: typeof ESPERA;
    agora?: Date;
    /** a equipe devolveu a conversa: a última mensagem da pessoa já está guardada, só falta a resposta */
    retomada?: boolean;
    /** com `retomada`: no lugar da resposta, os botões do começo de novo */
    comBotoes?: boolean;
  } = {},
) {
  // o áudio vira texto antes de entrar na conversa (sem a transcrição, fica o "[a pessoa mandou um áudio]")
  const falado = recebida.audio ? await audioEmTexto(cfg, recebida.audio) : null;
  const m = falado ? { ...recebida, texto: falado } : recebida;

  const { data, error } = await banco.rpc("servidor_whatsapp_conversa_entrada", {
    p_chave: chave,
    p_numero: m.numero,
    // na retomada, a mensagem já está na conversa: entra vazia, para não repetir
    p_texto: opcoes.retomada ? "" : m.texto,
    p_nome: m.nome,
    p_origem: (m.origem as Json) ?? null,
    p_payload: m.payload,
    p_wamid: opcoes.retomada ? null : m.wamid,
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
  const pediuFuncao = perguntouAFuncao(e.historico.findLast((x) => x.de !== "pessoa")?.texto ?? "");
  const soReacao =
    conversando &&
    !(pediuFuncao && soConfirmacao(m.texto)) &&
    (soEmoji(m.texto) || midiaDaMensagem(m.texto) === "figurinha" || (semPergunta && soConfirmacao(m.texto)));
  if (m.wamid) await marcarLidaDigitando(cfg, m.wamid, !soReacao).catch(() => undefined);

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
    // com os botões da equipe, não há mensagem nova da pessoa para conferir
    if ((!opcoes.comBotoes && u.wamid !== m.wamid) || u.situacao === "equipe") return;
    e.historico = u.historico;
    e.perfil = u.perfil ?? e.perfil;
  }
  // sem a função (a migração 20270803120000 ainda não rodou), segue com a conversa da entrada

  const agora = opcoes.agora ?? new Date();
  // quem veio de um anúncio: os links contam no anúncio, não no atendimento
  const campanha = campanhaDoAnuncio(e.origem);
  const saida = async (
    textoDaResposta: string,
    extra: {
      perfil?: string | null;
      equipe?: boolean;
      motivo?: string;
      menu?: boolean;
      botao?: Botao | null;
      /** outros botões de resposta no lugar do menu (os da entrada de quem quer publicar vaga) */
      botoes?: { id: string; titulo: string }[];
    } = {},
  ) => {
    const texto = comCampanhaDoAnuncio(textoDaResposta, campanha);
    const url = extra.botao ? comCampanhaDoAnuncio(link(extra.botao.caminho), campanha) : null;
    const botoes = extra.botoes ?? (extra.menu ? MENU : null);
    let r = botoes
      ? await enviarComBotoes(cfg, m.numero, caber(texto), botoes)
      : extra.botao && url
        ? await enviarComLink(cfg, m.numero, caber(texto), {
            titulo: extra.botao.titulo,
            url,
          })
        : await enviarTexto(cfg, m.numero, texto);
    let marca = botoes
      ? `[Botões: ${botoes.map((b) => b.titulo).join(" · ")}]`
      : extra.botao
        ? `[Botão: ${extra.botao.titulo}]`
        : "";
    // a mensagem com botão não saiu: vai o texto, com o link escrito
    if (!r.ok && (botoes || extra.botao)) {
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

  // as mensagens das vagas com o convite do currículo: com o currículo pelo WhatsApp ligado, "monto aqui, falando", com o
  // botão de montar no lugar do botão do site
  const comCurriculoFalando = async (texto: string, botao: Botao | null) =>
    botao === LINKS.curriculo && PARAGRAFO_DO_CURRICULO.test(texto) && (await curriculoPeloWhatsappLigado(banco, chave, m.numero))
      ? { texto: texto.replace(PARAGRAFO_DO_CURRICULO, CONVITE_CURRICULO_FALANDO), extra: { botoes: [BOTAO_MONTAR_CURRICULO] } }
      : { texto, extra: { botao } };

  // a oferta depois de publicar pelo WhatsApp: o "Sim, quero receber" é o aceite dos avisos (migração 20270806120000)
  const daOferta = await respostaDaOferta(banco, chave, e.chave, m.payload);
  if (daOferta) return saida(daOferta, { perfil: "contratar" });

  // o botão "Falar com a equipe" ou quem escreveu só "equipe"
  if (e.pediu_equipe || (!m.payload && pedeAEquipe(m.texto)))
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
  // a apresentação, na primeira mensagem para a pessoa (as respostas prontas que não são as boas-vindas); quem veio do
  // anúncio já recebeu a da Meta (`BOAS_VINDAS_DO_ANUNCIO`): nada de "Oi" duas vezes
  const doAnuncio = veioDoAnuncio(e.origem);
  const ola = jaFalou || doAnuncio ? "" : `${oi(nome, comeco)} 👋 Aqui é o ${QUEM_ATENDE}, do Publike.\n\n`;

  // a equipe devolveu com os botões
  if (opcoes.retomada && opcoes.comBotoes) return saida(VOLTEI_COM_BOTOES, { menu: true });

  // o currículo pelo WhatsApp (migração 20270902120000): o botão "Montar meu currículo", quem escreve "currículo" e os
  // passos da conversa; desligado (Admin › Qualificados), segue tudo como antes
  if (
    await seguirCurriculoPeloWhatsapp({
      banco,
      chave,
      conversa: e.chave,
      numero: m.numero,
      nome: e.nome ?? null,
      historico: e.historico,
      minhaUltima,
      payload: m.payload,
      textos,
      midias,
      semConteudo: (t) => soConfirmacao(t) || soEmoji(t) || soAgradecimento(t) || midiaDaMensagem(t) === "figurinha",
      modelo: modeloDoLer,
      saida,
      ola,
      agora: opcoes.agora ?? new Date(),
      linkEnviarCurriculo: LINKS.enviarCurriculo,
      // o cartão e o PDF: a Meta busca pelo link; a legenda fica na conversa (o passo sai dela)
      enviarArquivo: async (a) => {
        const r = await enviarArquivo(cfg, m.numero, {
          tipo: a.tipo,
          url: `${urlDosEmails() ?? SITE_URL}${a.caminho}`,
          legenda: a.legenda,
          nome: a.nome,
        });
        if (!r.ok) {
          console.error("Publike: o arquivo do currículo não saiu:", r.erro);
          return false;
        }
        await banco.rpc("servidor_whatsapp_conversa_saida", {
          p_chave: chave,
          p_conversa: e.chave,
          p_texto: a.legenda,
          p_wamid: r.wamid,
          p_perfil: "trabalho",
          p_equipe: false,
          p_motivo: null,
        });
        return true;
      },
    })
  )
    return;

  // o teto do mês (migração 20270808120000): no modo econômico, quem procura trabalho recebe uma mensagem só por dia,
  // com o link das vagas, sem a IA; quem contrata segue normal (é quem traz vaga nova)
  const teto = await tetoDoMes(banco, chave, e.chave);
  // quem chega para publicar vaga (a mensagem pronta, os botões dela ou as 3 perguntas) segue normal, como quem contrata
  const daVaga =
    Boolean(m.payload?.startsWith("a:vaga-")) ||
    (!jaFalou && textos.some(querPublicarVaga)) ||
    perguntaDaVaga(minhaUltima) >= 0;
  if (teto?.economico && e.perfil !== "contratar" && m.payload !== "a:contratar" && m.payload !== "a:curriculo" && !daVaga) {
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
  // a pergunta, e a equipe num botão (o menu tem só 3; a conversa continua aqui mesmo)
  if (novas.length <= 1 && m.payload === "a:trabalho")
    return saida(PARA_QUEM_PROCURA, { perfil: "trabalho", botoes: [BOTAO_DA_EQUIPE] });
  if (novas.length <= 1 && m.payload === "a:curriculo")
    return saida(PARA_QUEM_TEM_CURRICULO, { perfil: "trabalho", botao: LINKS.enviarCurriculo });
  if (novas.length <= 1 && m.payload === "a:contratar") {
    const porAqui = Boolean(await configVagasWhatsapp(banco, chave));
    return saida(`${paraQuemContrata(porAqui)}\n\n${EQUIPE_POR_ESCRITO}`, {
      perfil: "contratar",
      // pelo WhatsApp, o caminho é mandar a vaga aqui mesmo: o botão do site fica para quem prefere
      botao: LINKS.publicar,
    });
  }

  // quem chega para publicar vaga (20/11/2026): a entrada com os 3 botões, o "pode mandar" e as 3 perguntas
  if (!jaFalou && !midias.some(Boolean) && textos.some(querPublicarVaga))
    return saida(
      // quem veio do anúncio já recebeu o "Oi! 👋 Aqui é o Marcelo" da Meta: sem o Oi de novo
      doAnuncio
        ? `${nome ? `${nome}, v` : "V"}${ENTRADA_DA_VAGA.slice(1)}`
        : `${oi(nome, comeco)} 👋 Aqui é o ${QUEM_ATENDE}, do Publike. ${ENTRADA_DA_VAGA}`,
      { botoes: BOTOES_DA_VAGA },
    );
  if (m.payload === "a:vaga-mandar") return saida(MANDAR_A_VAGA, { perfil: "contratar" });
  if (m.payload === "a:vaga-montar") return saida(PERGUNTAS_DA_VAGA[0], { perfil: "contratar" });
  {
    const passo = perguntaDaVaga(minhaUltima);
    // respondeu a pergunta com o texto: a foto, o arquivo ou a vaga inteira escrita seguem pelo caminho normal (a
    // leitura), e a dúvida ("é pago?") vai para a IA
    const escrito = textos.join("\n").trim();
    // depois do "pode mandar", o texto que vier é a vaga (mesmo curto: "auxiliar de cozinha, 1.800, Setor Bueno")
    const depoisDoMandar = minhaUltima.startsWith(MANDAR_A_VAGA.slice(0, 32));
    if (
      (passo >= 0 || depoisDoMandar) &&
      escrito &&
      !midias.some(Boolean) &&
      !escrito.endsWith("?") &&
      (depoisDoMandar || !pareceVaga(escrito))
    ) {
      if (passo === 1 && minhaUltima !== DE_NOVO_SALARIO && salarioVago(escrito))
        return saida(DE_NOVO_SALARIO, { perfil: "contratar" });
      if (passo === 2 && minhaUltima !== DE_NOVO_LUGAR && lugarVago(escrito))
        return saida(DE_NOVO_LUGAR, { perfil: "contratar" });
      if (passo >= 0 && passo < 2) return saida(PERGUNTAS_DA_VAGA[passo + 1], { perfil: "contratar" });
      const respostas = respostasDaVaga(e.historico.slice(0, e.historico.length - novas.length), textos);
      const montada = depoisDoMandar ? escrito : textoDaVagaMontada(respostas);
      if (
        await tentarVagaPeloWhatsapp({
          cfg,
          banco,
          chave,
          conversa: e.chave,
          numero: m.numero,
          wamid: m.wamid,
          perfil: "contratar",
          textos: [montada],
          saida,
          montada: true,
          jaDisse: !depoisDoMandar && /combin|negoci|definir/i.test(respostas.salario) ? ["o salário"] : [],
        })
      )
        return;
      return saida(
        "Anotei! Para terminar, é só publicar pelo site: toque em *Publicar vaga grátis* e cole o cargo, o salário e o bairro. Leva 1 minutinho.",
        { perfil: "contratar", botao: LINKS.publicar },
      );
    }
  }

  // o que a pessoa conta depois da vaga preparada ("Setor Urias Magalhães", "de manhã", "1950") entra na vaga: o Publike
  // lê de novo com tudo e manda o link novo (20/11/2026: a Gardenia completou a vaga e a IA só respondeu "Anotado", com o
  // botão do publicar em branco). Só a vaga escrita (com foto, a leitura precisaria da foto de novo: segue a IA).
  {
    const escrito = textos.join("\n").trim();
    const textosDaVaga = textosDaVagaPreparada(e.historico.slice(0, e.historico.length - novas.length));
    if (
      textosDaVaga &&
      escrito.length >= 3 &&
      !midias.some(Boolean) &&
      !escrito.endsWith("?") &&
      !/^(ok|okay|obrigad|valeu|vlw|blz|beleza|certo|sim|t[aá]|top|show|perfeito|entendi)\b/i.test(escrito) &&
      (await tentarVagaPeloWhatsapp({
        cfg,
        banco,
        chave,
        conversa: e.chave,
        numero: m.numero,
        wamid: m.wamid,
        perfil: "contratar",
        textos: [`${textosDaVaga.texto} Mais informações: ${escrito}`],
        saida,
        montada: true,
        jaDisse: textosDaVaga.jaDisse,
      }))
    )
      return;
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

  // "ok" depois do "me conta o que você faz e o bairro": as vagas que entraram no ar, de todas as funções, e o pedido
  // claro da função e do bairro depois (20/11/2026; Marcelo: "precisa entender e enviar vagas genéricas mais próximas
  // e ir aumentando o raio"; antes, a pergunta de novo, de 19/11: "quando demonstrar confirmação, deve perguntar
  // claramente")
  if (
    jaFalou &&
    /o que você faz e o bairro/i.test(minhaUltima) &&
    textos.every((t) => soConfirmacao(t) || soEmoji(t))
  ) {
    const restam = VAGAS_POR_DIA - (await vagasDeHoje());
    if (restam <= 0) return saida(PEDIR_FUNCAO_E_BAIRRO, { perfil: e.perfil ?? "trabalho" });
    const r = await mensagemDaBusca(
      { texto: "", funcoes: [], parecidas: [], categoria: "todas", jeito: ["qualquer"] } as Partial<Busca>,
      null,
      restam,
      [],
      vagasJaMandadas(e.historico),
    );
    if (!r.quantas) return saida(PEDIR_FUNCAO_E_BAIRRO, { perfil: e.perfil ?? "trabalho" });
    const c = await comCurriculoFalando(`${r.abertura ?? r.aberturaPadrao}\n\n${r.texto}`, r.botao);
    return saida(c.texto, { perfil: e.perfil ?? "trabalho", ...c.extra });
  }

  // "ok", "beleza", "👍" ou figurinha depois de conversar: não pedem resposta. Depois de pedir a função (antes de mandar
  // vaga), o "ok" é resposta: vai para a IA, que manda as vagas mais perto (a regra "Sem a função")
  if (
    jaFalou &&
    !minhaUltima.endsWith("?") &&
    !perguntouAFuncao(minhaUltima) &&
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
    // veio do anúncio para quem procura emprego (o texto do anúncio diz): a pergunta direto, sem o menu (20/11/2026;
    // nas conversas, 1 em cada 7 parava no menu)
    if (!jaFalou && doAnuncio && anuncioDeVagas(e.origem))
      return saida(`${oi(nome, comeco)} ${PARA_QUEM_PROCURA.replace(/^Que bom! 😊 /, "")}`, { perfil: "trabalho" });
    if (!jaFalou) return saida(boasVindas(nome, comeco, doAnuncio), { menu: semPerfil });
    const deNovo = /^(Oi|Bom dia|Boa tarde|Boa noite|Estou por aqui)\b/.test(minhaUltima);
    // quem procura trabalho e volta com "Oi" (22/11/2026; Marcelo, com "Oi, Raimundo! Em que posso te ajudar?": "certamente
    // quer vagas"): as vagas novas do que ela já disse (a função e o bairro, lidos da conversa); sem a função, a pergunta
    if (!deNovo && (e.perfil === "trabalho" || (!e.perfil && vagasJaMandadas(e.historico).size > 0))) {
      const ola1 = `${oi(nome, comeco)} 😊 `;
      const restam = VAGAS_POR_DIA - (await vagasDeHoje());
      if (restam <= 0) return saida(`${ola1}${ACABARAM_AS_DE_HOJE}`, { perfil: "trabalho", botao: LINKS.vagas });
      const modelo = await modeloDoAtendimento();
      const busca = modelo ? await buscaDaConversa(e.historico, modelo) : null;
      if (!busca || (!busca.funcoes?.length && !busca.texto?.trim()))
        return saida(`${ola1}Quer ver as vagas? ${PARA_QUEM_PROCURA.replace(/^Que bom! 😊 /, "")}`, { perfil: "trabalho" });
      const local = lugarDaBusca(busca.cidade ?? "", busca.bairro ?? "");
      const r = await mensagemDaBusca(busca, local, restam, [], vagasJaMandadas(e.historico), (fs) =>
        void anotarProcuraSemVaga(banco, chave, e.chave, fs, local),
      );
      const abertura = r.abertura ?? r.aberturaPadrao;
      const c = await comCurriculoFalando(`${ola1}${abertura}${r.texto ? `\n\n${r.texto}` : ""}`, r.botao);
      return saida(c.texto, { perfil: "trabalho", ...c.extra });
    }
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
    const vagas = await procurarVagas({ texto: "", categoria: "todas" }, { ponto: m.local }, restam);
    if (!vagas || "jaForam" in vagas)
      return saida(
        `${ola}${aindaNaoDisponivel(null)}`,
        { perfil: e.perfil ?? "trabalho", botao: LINKS.vagas },
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

  // a função já foi perguntada, nenhuma vaga foi ainda, e a IA ia perguntar de novo (ou ficar quieta depois do "ok"):
  // as vagas mais perto, de todas as funções, com o lugar que a conversa diz (20/11/2026; Marcelo, com a conversa em que
  // a pessoa disse o bairro e "não sei qual vaga tá disponível": "precisa entender e enviar vagas genéricas mais
  // próximas e ir aumentando o raio"; a regra "Sem a função" nem sempre basta)
  const jaPerguntou = respostas.some((x) => perguntouAFuncao(x.texto) || /o que você faz e o bairro/i.test(x.texto));
  if (
    (perfil ?? e.perfil) === "trabalho" &&
    jaPerguntou &&
    !respostas.some((x) => /\/anuncio\//.test(x.texto)) &&
    ((plano.acao === "responder" && perguntouAFuncao(resposta)) || (plano.acao === "silencio" && perguntouAFuncao(minhaUltima)))
  ) {
    const lida = await buscaDaConversa(e.historico, modelo);
    const busca: Busca = lida ?? {
      texto: "",
      funcoes: [],
      parecidas: [],
      categoria: "todas",
      jeito: [],
      cidade: "",
      bairro: "",
      fora: "",
    };
    plano = { ...plano, acao: "buscar_vagas", perfil: "trabalho", busca: { ...busca, jeito: [...new Set([...(busca.jeito ?? []), "qualquer" as const])] } };
    resposta = "";
  }

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
  // a busca sem a frase da IA (a rede de segurança) segue com a nossa
  if (!resposta && plano.acao !== "buscar_vagas")
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
    // a cidade fora de onde o Publike funciona: ainda não está disponível lá (sem as vagas daqui, que enganariam)
    const jaDisseFora = respostas.some((x) => /ainda não está disponível|funciona só em/i.test(x.texto));
    const fora = (plano.busca?.fora?.trim() || (jaDisseFora ? "" : lugarDeFora(textos.join(" "))) || "").slice(0, 40);
    if (fora && !plano.busca?.cidade) return saida(`${ola}${aindaNaoDisponivel(fora)}`, { perfil: perfil ?? "trabalho" });
    const local = lugarDaBusca(plano.busca?.cidade ?? "", plano.busca?.bairro ?? "");
    const restam = VAGAS_POR_DIA - (await vagasDeHoje());
    if (restam <= 0) {
      // no site, já na busca do que ela pediu
      const funcao = funcaoSemJeito(plano.busca?.funcoes?.[0] ?? plano.busca?.texto ?? "");
      const q = new URLSearchParams({ tipo: "vaga" });
      if (funcao) q.set("q", funcao);
      return saida(`${ola}${ACABARAM_AS_DE_HOJE}`, {
        perfil: perfil ?? "trabalho",
        botao: funcao ? { titulo: "Ver as vagas no site", caminho: `/?${q}` } : LINKS.vagas,
      });
    }
    // respondeu a pergunta da função ("Que tipo de trabalho de freelance…?"): o jeito dela continua valendo
    const jeitoDaPergunta = PERGUNTOU_A_FUNCAO.exec(minhaUltima)?.[1];
    const r = await mensagemDaBusca(plano.busca, local, restam, jeitoDaPergunta ? [...textos, jeitoDaPergunta] : textos, vagasJaMandadas(e.historico), (fs) =>
      void anotarProcuraSemVaga(banco, chave, e.chave, fs, local),
    );
    // a frase da IA só quando as vagas são da função, perto; senão, a nossa (com a apresentação, na primeira mensagem)
    const c = await comCurriculoFalando(
      r.abertura === null ? `${resposta || r.aberturaPadrao}\n\n${r.texto}` : `${ola}${r.abertura}${r.texto ? `\n\n${r.texto}` : ""}`,
      r.botao,
    );
    return saida(c.texto, { perfil: perfil ?? "trabalho", ...c.extra });
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

// --- Procurar de novo (19/11/2026; Marcelo: "revisite as conversas e veja se há possibilidade de enviar pra conversas
// iniciadas") ----------------------------------------------------------------------------------------------------------
// As conversas em que a última resposta foi "não achei vaga" (ou as parecidas da busca antiga) e a janela de 24 horas
// está aberta: a busca nova roda de novo com o que a pessoa já disse. Admin › WhatsApp › Conversas mostra a mensagem de
// cada uma antes, e só vai a que a equipe mandar.

/** A última resposta foi a do "não achei" (ou as parecidas da busca antiga). */
export const RESPOSTA_SEM_VAGA = /Agora não achei vaga|Olha as que mais se parecem/;

const ESQUEMA_DA_BUSCA = {
  nome: "busca_de_novo",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["busca"],
    properties: { busca: ESQUEMA.schema.properties.busca },
  },
};

async function conversaSemVaga(banco: ClienteBanco, chave: string, conversa: string) {
  const { data, error } = await banco.rpc("servidor_whatsapp_conversa_ultima", { p_chave: chave, p_conversa: conversa });
  if (error || !data) return null;
  const u = data as unknown as { situacao: "robo" | "equipe"; historico: Mensagem[] };
  const ultima = u.historico.at(-1);
  return u.situacao === "robo" && ultima?.de === "robo" && (RESPOSTA_SEM_VAGA.test(ultima.texto) || repetiuVagas(u.historico))
    ? u.historico
    : null;
}

/**
 * A última resposta mandou de novo só vagas que já tinham ido (antes de 20/11/2026, o "Tem mais vagas" repetia a
 * busca): a conversa entra no "Procurar de novo", e a busca nova pula as que já foram.
 */
export function repetiuVagas(historico: { de: string; texto: string }[]) {
  const ultima = historico.at(-1);
  if (!ultima || ultima.de === "pessoa") return false;
  const agora = vagasJaMandadas([ultima]);
  const antes = vagasJaMandadas(historico.slice(0, -1));
  return agora.size > 0 && [...agora].every((id) => antes.has(id));
}

/** Das conversas da lista, as que entram no "Procurar de novo" (pela conversa inteira). */
export async function conversasParaProcurarDeNovo(chaves: string[]) {
  const acesso = acessoFila();
  if (!acesso) return new Set<string>();
  const ok = await Promise.all(chaves.map(async (c) => ((await conversaSemVaga(acesso.cliente, acesso.chave, c)) ? c : null)));
  return new Set(ok.filter((x): x is string => x !== null));
}

/** A busca que a conversa pede (a função, a cidade e o bairro que a pessoa disse), pela IA; null se a IA falhar. */
async function buscaDaConversa(historico: Mensagem[], modelo: string): Promise<Busca | null> {
  try {
    const { texto } = await chamarIA({
      funcionalidade: "chat",
      modelo,
      sistema: `Você lê uma conversa do WhatsApp do Publike (vagas de emprego em ${ONDE_FUNCIONA}) com alguém que procura trabalho, e diz o que procurar para ela. ${REGRAS_DA_BUSCA} "busca.categoria" só se tiver certeza (senão "todas"); "busca.cidade" com a cidade onde ela mora ou quer trabalhar, se ela disse (uma das cidades da lista; senão vazio); "busca.bairro" com o bairro, como ela escreveu (senão vazio); "busca.fora" com a cidade que ela disse quando fica fora de onde o Publike funciona (senão vazio). Se ela não disse a função, "busca.texto" e "busca.funcoes" ficam vazios.`,
      mensagem: transcricao(historico),
      maxTokens: 300,
      esquema: ESQUEMA_DA_BUSCA,
      tempoLimite: 20_000,
    });
    return lerJson<{ busca: Busca }>(texto).busca ?? null;
  } catch (erro) {
    console.error("Publike: a IA não leu a busca da conversa:", erro instanceof Error ? erro.message : erro);
    return null;
  }
}

export type BuscaDeNovo = { ok: true; texto: string; botao: Botao | null } | { ok: false; motivo: string };

/** A mensagem da busca nova para a conversa (sem enviar). */
export async function buscaDeNovo(conversa: string, nome: string | null): Promise<BuscaDeNovo> {
  const acesso = acessoFila();
  if (!acesso) return { ok: false, motivo: "Falta a chave do servidor." };
  const { cliente: banco, chave } = acesso;
  const historico = await conversaSemVaga(banco, chave, conversa);
  if (!historico)
    return { ok: false, motivo: "A conversa andou: a última resposta já não é a do “não achei” nem a das vagas repetidas." };
  const teto = await tetoDoMes(banco, chave, conversa);
  if (teto?.economico) return { ok: false, motivo: "O atendimento está no modo econômico (o teto do mês)." };
  const enviadas = await banco.rpc("servidor_whatsapp_vagas_enviadas", { p_chave: chave, p_conversa: conversa });
  const restam = VAGAS_POR_DIA - (enviadas.error ? 0 : Number(enviadas.data) || 0);
  if (restam <= 0) return { ok: false, motivo: `A pessoa já recebeu as ${VAGAS_POR_DIA} vagas de hoje.` };
  const modelo = await modeloDoAtendimento();
  if (!modelo) return { ok: false, motivo: "A IA do atendimento está desligada." };
  const busca = await buscaDaConversa(historico, modelo);
  if (!busca) return { ok: false, motivo: "A IA não respondeu." };
  if (busca?.fora && !busca.cidade) return { ok: false, motivo: `A pessoa mora fora de onde o Publike funciona (${busca.fora}).` };
  const local = lugarDaBusca(busca?.cidade ?? "", busca?.bairro ?? "");
  const jaForam = vagasJaMandadas(historico);
  const r = await mensagemDaBusca(busca, local, restam, [], jaForam);
  // todas as da função já foram (a resposta que repetiu): diz isso, com a pergunta de outra função
  if (!r.quantas && jaForam.size && repetiuVagas(historico))
    return { ok: true, texto: `${oi(primeiroNome(nome))} ${r.abertura}`, botao: r.botao };
  if (!r.quantas)
    return {
      ok: false,
      motivo: r.abertura?.includes("já te mandei")
        ? "Nada novo: as vagas parecidas que estão no ar já foram para esta pessoa."
        : "Ainda não há vaga da função nem parecida.",
    };
  return {
    ok: true,
    texto: `${oi(primeiroNome(nome))} Procurei de novo as vagas para você, com mais cuidado.\n\n${r.abertura ?? r.aberturaPadrao}\n\n${r.texto}`,
    botao: r.botao,
  };
}

/**
 * A última resposta pediu a função, antes de mandar vaga (o "ok" e o "sim" depois dela são resposta, e não só um "ok";
 * 20/11/2026: "Beleza! Então me diz qual trabalho você faz ou procura..." e o "Ok" da pessoa ficou sem resposta).
 */
export function perguntouAFuncao(texto: string) {
  return (
    !/\/anuncio\//.test(texto) &&
    /o que (você|vc) faz|qual (trabalho|função|funcao|vaga|serviço|servico) (você|vc) (faz|procura|quer)|que (trabalho|tipo de vaga) (você|vc) (faz|procura|quer)|(me )?(diz|diga|fala|fale|conta|conte) (qual|o que|que)/i.test(
      texto,
    )
  );
}

/**
 * As vagas que o Publike já mandou nesta conversa, pelo código (os 8 primeiros caracteres do id): os links /anuncio/<id>
 * de antes e os curtos /w/<código> (21/11/2026).
 */
export function vagasJaMandadas(historico: { de: string; texto: string }[]) {
  const ids = new Set<string>();
  for (const m of historico)
    if (m.de !== "pessoa")
      for (const x of m.texto.matchAll(/\/(?:anuncio\/([0-9a-f]{8})[0-9a-f-]{28}|[wifm]\/([0-9a-f]{8}))/g)) ids.add(x[1] ?? x[2]);
  return ids;
}

/** Envia a mensagem que a equipe viu (se a conversa não andou nesse meio-tempo). */
/** O anúncio de clique para o WhatsApp é para quem procura emprego (o título ou o texto dele), e não para quem contrata. */
export function anuncioDeVagas(o: Entrada["origem"]) {
  const t = simples(`${o?.titulo ?? ""} ${o?.texto ?? ""}`);
  return /\b(emprego|procurando trabalho|procura trabalho|pede vaga|vaga pra voce|vagas pra voce|vagas perto)\b/.test(t) && !/\bcontrat/.test(t);
}

// --- Os lembretes (20/11/2026; migração 20270813120000) ----------------------------------------------------------

/** Para quem parou no "me conta o que você faz e o bairro", 2 horas depois (uma vez). */
export const LEMBRETE_PERGUNTA =
  "Ainda procurando trabalho? 😊 *Me conta o que você faz e o bairro onde mora*, que eu te mando as vagas. Por exemplo: _sou cozinheira e moro no Jardim América_.";
/** Para quem procura trabalho, perto do fim das 24 horas (uma vez). */
export const LEMBRETE_SEMPRE =
  "Uma dica: sempre que quiser ver vagas, é só me chamar aqui no WhatsApp e dizer o que você procura. Entram vagas novas todo dia. 😊";
const marca = (t: string) => t.slice(0, 24);

/** Manda, da parte do atendimento, uma mensagem numa conversa e guarda (com o botão, se for). */
async function mandarDoRobo(
  cfg: ConfigMeta,
  banco: ClienteBanco,
  chave: string,
  conversa: string,
  numero: string,
  texto: string,
  botao: Botao | null,
  botoes?: { id: string; titulo: string }[],
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const url = botao ? link(botao.caminho) : null;
  let r = botoes?.length
    ? await enviarComBotoes(cfg, numero, caber(texto), botoes)
    : botao && url
      ? await enviarComLink(cfg, numero, caber(texto), { titulo: botao.titulo, url })
      : await enviarTexto(cfg, numero, texto);
  let marcaDoBotao = botoes?.length ? `[Botões: ${botoes.map((b) => b.titulo).join(" · ")}]` : botao ? `[Botão: ${botao.titulo}]` : "";
  if (!r.ok && (botao || botoes?.length)) {
    r = await enviarTexto(cfg, numero, botao && url ? `${texto}\n\n${botao.titulo}: ${url}` : texto);
    marcaDoBotao = "";
  }
  if (!r.ok) return { ok: false, erro: `A Meta recusou: ${r.erro}` };
  await banco.rpc("servidor_whatsapp_conversa_saida", {
    p_chave: chave,
    p_conversa: conversa,
    p_texto: marcaDoBotao ? `${texto}\n\n${marcaDoBotao}` : texto,
    p_wamid: r.wamid,
  });
  return { ok: true };
}

/** Os links curtos das vagas na mensagem da busca: /w/, ou a letra da campanha de quem veio do anúncio. */
const MARCAS_DOS_LINKS_DAS_VAGAS = ["/w/", "/i/", "/f/", "/m/"];

/** O /api/filas: os lembretes que estão na hora (até 30 por vez). */
export async function enviarLembretesWhatsapp(): Promise<{ enviados: number; falhas: number }> {
  const cfg = configMeta();
  const acesso = acessoFila();
  if (!cfg || !acesso) return { enviados: 0, falhas: 0 };
  const { cliente: banco, chave } = acesso;
  const { data, error } = await banco.rpc("servidor_whatsapp_lembretes", {
    p_chave: chave,
    p_marca_pergunta: marca(LEMBRETE_PERGUNTA),
    p_marca_sempre: marca(LEMBRETE_SEMPRE),
  });
  let enviados = 0;
  let falhas = 0;
  // quem chegou para publicar vaga e parou (migração 20270816120000; sem ela, nada)
  const { data: daVaga, error: erroDaVaga } = await banco.rpc("servidor_whatsapp_lembrete_vaga", {
    p_chave: chave,
    p_marcas: MARCAS_DA_VAGA,
    p_marca_lembrete: marca(LEMBRETE_VAGA),
  });
  if (!erroDaVaga)
    for (const l of (daVaga ?? []) as unknown as { chave: string; numero: string }[]) {
      const r = await mandarDoRobo(cfg, banco, chave, l.chave, l.numero, LEMBRETE_VAGA, null, BOTOES_DA_VAGA.slice(0, 2));
      if (r.ok) enviados++;
      else {
        falhas++;
        console.error("Publike: o lembrete do WhatsApp (vaga) não saiu:", r.erro);
      }
    }
  // o currículo pelo WhatsApp (migração 20270903120000): a pergunta separada, uns 10 minutos depois das vagas, para quem
  // não tem currículo; com o recurso desligado (Admin › Qualificados), o banco não devolve ninguém
  const { data: semCurriculo, error: erroDoCurriculo } = await banco.rpc("servidor_whatsapp_pergunta_curriculo", {
    p_chave: chave,
    p_marcas_vagas: MARCAS_DOS_LINKS_DAS_VAGAS,
    p_marca_pergunta: TEXTOS_DO_CURRICULO.pergunta.slice(0, 40),
  });
  if (!erroDoCurriculo)
    for (const l of (semCurriculo ?? []) as unknown as { chave: string; numero: string }[]) {
      const r = await mandarDoRobo(cfg, banco, chave, l.chave, l.numero, TEXTOS_DO_CURRICULO.pergunta, null, [
        BOTAO_MONTAR_CURRICULO,
        BOTAO_AGORA_NAO,
      ]);
      if (r.ok) enviados++;
      else {
        falhas++;
        console.error("Publike: a pergunta do currículo no WhatsApp não saiu:", r.erro);
      }
    }
  // sem a migração: nada
  if (error) return { enviados, falhas };
  for (const l of (data ?? []) as unknown as { chave: string; numero: string; tipo: "pergunta" | "sempre" }[]) {
    const r =
      l.tipo === "pergunta"
        ? await mandarDoRobo(cfg, banco, chave, l.chave, l.numero, LEMBRETE_PERGUNTA, null)
        : await mandarDoRobo(cfg, banco, chave, l.chave, l.numero, LEMBRETE_SEMPRE, LINKS.vagas);
    if (r.ok) enviados++;
    else {
      falhas++;
      console.error(`Publike: o lembrete do WhatsApp (${l.tipo}) não saiu:`, r.erro);
    }
  }
  return { enviados, falhas };
}

export async function enviarBuscaDeNovo(
  conversa: string,
  numero: string,
  texto: string,
  botao: Botao | null,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const cfg = configMeta();
  const acesso = acessoFila();
  if (!cfg || !acesso) return { ok: false, erro: "Faltam as chaves do WhatsApp ou do servidor." };
  const { cliente: banco, chave } = acesso;
  if (!(await conversaSemVaga(banco, chave, conversa)))
    return { ok: false, erro: "A conversa andou: a última resposta já não é a do “não achei”." };
  return mandarDoRobo(cfg, banco, chave, conversa, numero, texto, botao);
}

/** O botão que pode ir junto: um dos links do atendimento ou "Ver mais vagas" de uma busca. */
export function botaoValido(b: unknown): Botao | null {
  if (!b || typeof b !== "object") return null;
  const { titulo, caminho } = b as Botao;
  if (typeof titulo !== "string" || typeof caminho !== "string") return null;
  if (Object.values(LINKS).some((l) => l.titulo === titulo && l.caminho === caminho)) return { titulo, caminho };
  return titulo === "Ver mais vagas" && /^\/\?tipo=vaga(&q=[^&#]{1,80})?$/.test(caminho) ? { titulo, caminho } : null;
}

/**
 * Logo depois do primeiro currículo salvo (21/11/2026; Marcelo: "quando o currículo subir, já olha o perfil do
 * candidato e sugira as vagas também"): quem conversou com o Publike nas últimas 23 horas (a janela em que a Meta deixa
 * mandar mensagem livre) recebe no WhatsApp as vagas que mais combinam com o currículo, até 3, com o link de cada uma.
 * Fora da janela, sem vaga, no modo econômico do mês ou sem a Meta: nada sai. Nunca lança (vai no `after`).
 */
export async function mandarVagasDoCurriculo(
  numeros: (string | null | undefined)[],
  vagas: { id: string; titulo: string; quem: string; bairro: string | null; cidade: string; nota: number }[],
  /** só nos testes: a Meta e o banco de mentira */
  teste?: { cfg: ConfigMeta; banco: ClienteBanco; chave: string },
): Promise<"enviada" | "sem_vaga" | "fora_da_janela" | "economico" | "desligado" | "falhou"> {
  try {
    if (!vagas.length) return "sem_vaga";
    const cfg = teste?.cfg ?? configMeta();
    const acesso = teste ? { cliente: teste.banco, chave: teste.chave } : acessoFila();
    if (!cfg || !acesso) return "desligado";
    const { cliente: banco, chave } = acesso;
    let alvo: { conversa: string; numero: string } | null = null;
    for (const n of [...new Set(numeros.map((x) => (x ?? "").replace(/\D/g, "")).filter(Boolean))]) {
      const { data, error } = await banco.rpc("servidor_whatsapp_codigo", { p_chave: chave, p_numero: n });
      const c = (error ? null : data) as { conversa: string | null; numero: string | null; na_janela: boolean } | null;
      if (c?.conversa && c.numero && c.na_janela) {
        alvo = { conversa: c.conversa, numero: c.numero };
        break;
      }
    }
    if (!alvo) return "fora_da_janela";
    if ((await tetoDoMes(banco, chave, alvo.conversa))?.economico) return "economico";
    const lista = vagas
      .slice(0, 3)
      .map((v) => `*${v.titulo}* · ${v.quem}\n📍 ${formatarLugar(v.bairro ?? "", v.cidade)} · ${v.nota}% de match\n${linkDaVaga(v.id)}`)
      .join("\n\n");
    const texto = [
      "Pronto, seu currículo está no Publike! 🎉 Olha as vagas que mais combinam com você agora:",
      lista,
      "É só abrir e tocar em *Curtir* para se candidatar.",
    ].join("\n\n");
    const r = await mandarDoRobo(cfg, banco, chave, alvo.conversa, alvo.numero, texto, null);
    if (!r.ok) console.error("Publike: as vagas do currículo não saíram pelo WhatsApp:", r.erro);
    return r.ok ? "enviada" : "falhou";
  } catch (e) {
    console.error("Publike: as vagas do currículo pelo WhatsApp falharam:", e instanceof Error ? e.message : e);
    return "falhou";
  }
}
