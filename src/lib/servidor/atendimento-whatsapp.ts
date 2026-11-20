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
import { acessoFila } from "./filas";
import {
  baixarMidia,
  configMeta,
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
const link = (caminho: string) => comOrigem(`${SITE_URL}${caminho}`, "whatsapp", "atendimento");
const DO_ATENDIMENTO = "utm_source=whatsapp&utm_campaign=atendimento";

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
  campanha ? t.replaceAll(DO_ATENDIMENTO, `utm_source=meta-ads&utm_campaign=${campanha}`) : t;

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

/** A função sem o complemento ("vigilante patrimonial" vira "vigilante"); null quando sobraria uma palavra geral. */
export function funcaoCurta(funcao: string) {
  const ps = palavrasDaFuncao(funcao);
  return ps.length > 1 && !PALAVRAS_GERAIS.has(ps[0]) ? ps[0] : null;
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
) {
  const centro = onde.ponto ?? (onde.local ? pontoDoLocal(onde.local) : null);
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
  const jeitos = (busca.jeito ?? []).filter((j) => j !== "qualquer");
  const regime = jeitos.includes("diaria") ? "diaria" : jeitos.includes("freelance") ? "freelance" : null;
  const tentar = async (texto: string | null, lugar: Record<string, unknown>, categoria: string | null = null) => {
    const { data, error } = await criarClientePublico().rpc("buscar_anuncios", {
      ...lugar,
      p_tipo: "vaga",
      p_texto: texto,
      p_categoria: categoria,
      p_regime: regime,
      p_limite: jeitos.length ? 60 : 20,
    } as never);
    const lista = (error ? [] : (data ?? [])) as unknown as (Anuncio & Vinda)[];
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

  type Achada = { a: Anuncio; termo: string; parecida: boolean; longe: boolean };
  const achadas: Achada[] = [];
  const ids = new Set<string>(jaMandadas);
  // as da função que ficaram de fora por já terem ido: "já te mandei as vagas de..."
  let repetidas = 0;
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
        if (a && !parecida && jaMandadas.has(a.id)) repetidas++;
        if (!a || ids.has(a.id) || achadas.length >= max) continue;
        ids.add(a.id);
        achadas.push({ a, termo: t, parecida, longe: eLonge });
      }
  };

  const funcoes = unicos((busca.funcoes?.length ? busca.funcoes : [busca.texto]).map(funcaoSemJeito), 3);
  // sem função: as mais perto (ou as mais novas), do jeito pedido; com o jeito, também nas cidades em volta
  const semFuncao = async () => {
    const categoria = CATEGORIAS.some((c) => c.slug === busca.categoria) ? busca.categoria : null;
    let l = await tentar(null, perto, categoria);
    if (!l.length && categoria) l = await tentar(null, perto);
    for (const a of l.slice(0, max)) {
      if (ids.has(a.id)) continue;
      ids.add(a.id);
      achadas.push({ a, termo: "", parecida: false, longe: false });
    }
    if (!achadas.length && jeitos.length && !onde.ponto)
      for (const a of (await tentar(null, longe)).slice(0, max)) achadas.push({ a, termo: "", parecida: false, longe: true });
  };
  if (!funcoes.length) await semFuncao();
  else {
    await juntar(funcoes, perto, false, false);
    await juntar(funcoes, longe, false, true);
    // a função mais curta, só para as que não acharam nada
    const semNada = funcoes.filter((f) => !achadas.some((x) => x.termo === f));
    const curtas = unicos(
      semNada.map(funcaoCurta).filter((c) => c && !funcoes.some((f) => simples(f) === simples(c))),
      3,
    );
    await juntar(curtas, perto, false, false);
    await juntar(curtas, longe, false, true);
    if (!achadas.length) {
      // o mesmo cargo em outro nível da mesma área ("supervisor de logística": coordenador, gerente, encarregado de
      // logística), antes das parecidas da IA (19/11/2026; Marcelo: "Tem vaga pra coordenador de logística")
      const areas = unicos(funcoes.map(areaDaLideranca), 3);
      await juntar(areas, perto, true, false, tituloDeLideranca);
      await juntar(areas, longe, true, true, tituloDeLideranca);
    }
    if (!achadas.length) {
      const parecidas = unicos(busca.parecidas ?? [], 4).filter(
        (p) => !funcoes.concat(curtas).some((f) => simples(f) === simples(p)),
      );
      await juntar(parecidas, perto, true, false);
      await juntar(parecidas, longe, true, true);
    }
    // "o que tiver": sem a função nem as parecidas, as mais perto
    if (!achadas.length && busca.jeito?.includes("qualquer")) {
      await semFuncao();
      for (const x of achadas) x.parecida = true;
    }
  }
  if (!achadas.length) return repetidas ? { jaForam: true as const } : null;

  // as de perto primeiro
  achadas.sort((x, y) => Number(x.longe) - Number(y.longe));
  const linha = ({ a, longe: eLonge }: Achada) => {
    const valor = valorDoAnuncio(a);
    const km = eLonge && centro && a.distancia_km != null && a.distancia_km >= 1 ? ` (a ${Math.round(a.distancia_km)} km)` : "";
    // longe, a cidade sempre aparece (Goiânia e Anápolis mostram só o bairro)
    const lugar = formatarLugar(a.bairro ?? "", a.cidade ?? "");
    const onde1 = eLonge && a.cidade && !lugar.includes(a.cidade) ? `${lugar}, ${a.cidade}` : lugar;
    return `• *${a.titulo}*${valor ? ` · ${valor}` : ""} · ${onde1}${km}\n${link(`/anuncio/${a.id}`)}`;
  };
  // a mensagem com botão vai até 1.024 letras: com links longos, cabem menos vagas
  let n = Math.min(Math.max(1, max), 4, achadas.length);
  while (n > 1 && achadas.slice(0, n).map(linha).join("\n\n").length > 760) n--;
  const usadas = achadas.slice(0, n);
  const perto1 = usadas.filter((x) => !x.longe);
  const longe1 = usadas.filter((x) => x.longe);
  const texto =
    perto1.length && longe1.length
      ? `${perto1.map(linha).join("\n\n")}\n\nUm pouco mais longe:\n\n${longe1.map(linha).join("\n\n")}`
      : usadas.map(linha).join("\n\n");

  // a frase que apresenta
  const parecidas = usadas[0].parecida;
  const achados = unicos(usadas.map((x) => x.termo), 3);
  const semNada = funcoes.filter((f) => !usadas.some((x) => x.termo === f) && !achados.some((t) => simples(t) === simples(f)));
  const aqui = onde.local ? " perto de você" : "";
  const doJeito = nomeDoJeito(jeitos);
  const jeito1 = doJeito ? ` ${doJeito}` : "";
  let abertura: string | null;
  if (!funcoes.length)
    abertura = doJeito
      ? !perto1.length && onde.local
        ? `Perto de você não achei vagas ${doJeito}, mas tem em outras cidades da região:`
        : `Olha as vagas ${doJeito}${aqui}:`
      : null;
  else if (parecidas)
    abertura = repetidas
      ? `As vagas de ${listaE(funcoes)}${jeito1} que estão no ar eu já te mandei. Separei outras que podem combinar com a sua experiência. Elas não são de ${listaE(funcoes)}: abra e veja se encaixam no seu perfil.`
      : `Agora não achei vaga de ${listaE(funcoes)}${jeito1} no ar. Separei outras vagas que podem combinar com a sua experiência. Elas não são de ${listaE(funcoes)}: abra e veja se encaixam no seu perfil.`;
  else {
    const nao = semNada.length ? `Agora não achei vaga de ${listaE(semNada)}${jeito1}. ` : "";
    abertura = !perto1.length
      ? `${nao}${onde.local ? `Perto de você não achei vaga de ${listaE(achados)}${jeito1}, mas tem em outras cidades da região:` : `Olha as vagas de ${listaE(achados)}${jeito1}:`}`
      : `${nao}Olha as vagas de ${listaE(achados)}${jeito1}${aqui}:`;
    // mais vagas, depois das que já foram
    if (repetidas && !semNada.length)
      abertura = !perto1.length && onde.local
        ? `Perto de você, as vagas de ${listaE(achados)}${jeito1} eu já te mandei. Olha mais nas cidades da região:`
        : `Olha mais vagas de ${listaE(achados)}${jeito1}${aqui}:`;
    // tudo perto, da função que ela disse e sem jeito: vale a frase da IA
    else if (!semNada.length && !longe1.length && !doJeito && achados.every((t) => funcoes.includes(t))) abertura = null;
  }
  const p = new URLSearchParams({ tipo: "vaga" });
  if (achados[0]) p.set("q", achados[0]);
  return {
    texto,
    quantas: n,
    abertura,
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
) {
  const texto = busca?.texto?.trim().slice(0, 40) ?? "";
  const jeito = [...new Set([...(busca?.jeito ?? []).filter(ehJeito), ...jeitoDoTexto(`${texto} ${textos.join(" ")}`)])];
  const funcoes = unicos((busca?.funcoes?.length ? busca.funcoes : [texto]).map(funcaoSemJeito), 3);
  const vagas = await procurarVagas(
    { texto, funcoes, parecidas: busca?.parecidas ?? [], categoria: busca?.categoria ?? "todas", jeito },
    { local },
    restam,
    jaMandadas,
  );
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
  return {
    abertura: vagas.abertura,
    /** a frase quando não vale a da IA (a busca de novo) */
    aberturaPadrao: `Olha as vagas de ${listaE(funcoes)}${local ? " perto de você" : ""}:`,
    texto: `${vagas.texto}\n\n${depoisDasVagas(restam - vagas.quantas)}`,
    botao: (vagas.mais ?? (restam - vagas.quantas <= 0 ? LINKS.vagas : null)) as Botao | null,
    quantas: vagas.quantas,
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

function boasVindas(nome: string | null, comeco: string, doAnuncio = false) {
  return [
    // quem veio do anúncio já recebeu o "Oi! 👋 Aqui é o Marcelo" da Meta (`BOAS_VINDAS_DO_ANUNCIO`)
    doAnuncio ? null : `${oi(nome, comeco)} 👋 Aqui é o ${QUEM_ATENDE}, do Publike.`,
    `O Publike é um site *grátis* de vagas de emprego perto de casa, em ${ONDE_FUNCIONA}:\n• quem procura trabalho se candidata pelo celular e acompanha cada passo: se a empresa viu, se aceitou e quando é a entrevista;\n• quem contrata publica a vaga de graça e recebe os candidatos organizados.`,
    "Como posso te ajudar?",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// "Procuro trabalho" (19/11/2026; Marcelo: "As pessoas estão parando aqui"): antes, o passo a passo em três itens e a
// pergunta no fim, com o botão Ver vagas competindo com ela. Agora, curta: só a pergunta, com o exemplo, sem botão (as
// vagas vêm na resposta, com o link de cada uma e o "Curtir" para se candidatar).
const PARA_QUEM_PROCURA = [
  "Que bom! 😊 Eu te mando as vagas por aqui, de graça.",
  "*Me conta o que você faz e o bairro onde mora.*",
  "Por exemplo: _sou cozinheira e moro no Jardim América_.",
].join("\n\n");

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
  const botao = MENU.find((b) => b.titulo === ultima.texto.trim());
  if (botao?.id === "a:equipe") return;
  await atenderConversa(
    cfg,
    banco,
    chave,
    { wamid: u.wamid, numero, texto: ultima.texto, payload: botao?.id ?? null, nome: null, origem: null },
    { retomada: true, espera: { texto: 0, botao: 0 } },
  );
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
- buscar_vagas: a pessoa procura trabalho e disse o que faz ou que vaga quer ("sou cozinheira", "tem vaga de motorista?"), agora ou antes na conversa. ${REGRAS_DA_BUSCA} "busca.categoria" só se tiver certeza (senão "todas"); "busca.cidade" com a cidade onde ela mora ou quer trabalhar, se ela disse (uma das cidades da lista; senão vazio); e "busca.bairro" com o bairro, como ela escreveu (senão vazio). Se a cidade que ela disse não está na lista (fica fora de onde o Publike funciona), deixe "busca.cidade" vazio e ponha o nome dela em "busca.fora", como ela escreveu; senão, "busca.fora" vazio. A "resposta" é só uma frase curta que apresenta as vagas, como "Olha as vagas de motorista perto do Jardim América:"; a lista vai logo depois. Se ela só disse que procura emprego, sem dizer o quê, use responder e pergunte o que ela faz e onde mora.
- equipe: a pessoa pede para falar com alguém, reclama, fala de pagamento, cobrança ou golpe, de problema na conta, de parceria ou de imprensa, ou você não sabe a resposta. Responda o que der (no golpe: não pague nada) e diga que vai pedir para alguém da equipe responder por aqui, no prazo que está em "Sobre esta conversa".
- silencio: a mensagem não pede resposta, como "ok", "beleza", "👍" ou um "obrigado" depois que você já se despediu. Deixe "resposta" vazia.
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
  const pediuFuncao = /o que você faz e o bairro/i.test(e.historico.findLast((x) => x.de !== "pessoa")?.texto ?? "");
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
    } = {},
  ) => {
    const texto = comCampanhaDoAnuncio(textoDaResposta, campanha);
    const url = extra.botao ? comCampanhaDoAnuncio(link(extra.botao.caminho), campanha) : null;
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
  // a apresentação, na primeira mensagem para a pessoa (as respostas prontas que não são as boas-vindas); quem veio do
  // anúncio já recebeu a da Meta (`BOAS_VINDAS_DO_ANUNCIO`): nada de "Oi" duas vezes
  const doAnuncio = veioDoAnuncio(e.origem);
  const ola = jaFalou || doAnuncio ? "" : `${oi(nome, comeco)} 👋 Aqui é o ${QUEM_ATENDE}, do Publike.\n\n`;

  // a equipe devolveu com os botões
  if (opcoes.retomada && opcoes.comBotoes) return saida(VOLTEI_COM_BOTOES, { menu: true });

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
    return saida(PARA_QUEM_PROCURA, { perfil: "trabalho" });
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

  // "ok" depois do "me conta o que você faz e o bairro": a pergunta de novo, clara (19/11/2026; Marcelo: "quando
  // demonstrar confirmação, deve perguntar claramente")
  if (
    jaFalou &&
    /o que você faz e o bairro/i.test(minhaUltima) &&
    textos.every((t) => soConfirmacao(t) || soEmoji(t))
  )
    return saida(PEDIR_FUNCAO_E_BAIRRO, { perfil: e.perfil ?? "trabalho" });

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
    // veio do anúncio para quem procura emprego (o texto do anúncio diz): a pergunta direto, sem o menu (20/11/2026;
    // nas conversas, 1 em cada 7 parava no menu)
    if (!jaFalou && doAnuncio && anuncioDeVagas(e.origem))
      return saida(`${oi(nome, comeco)} ${PARA_QUEM_PROCURA.replace(/^Que bom! 😊 /, "")}`, { perfil: "trabalho" });
    if (!jaFalou) return saida(boasVindas(nome, comeco, doAnuncio), { menu: semPerfil });
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
  const resposta = (plano.resposta ?? "")
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
    const r = await mensagemDaBusca(plano.busca, local, restam, textos, vagasJaMandadas(e.historico));
    // a frase da IA só quando as vagas são da função, perto; senão, a nossa (com a apresentação, na primeira mensagem)
    return saida(r.abertura === null ? `${resposta}\n\n${r.texto}` : `${ola}${r.abertura}${r.texto ? `\n\n${r.texto}` : ""}`, {
      perfil: perfil ?? "trabalho",
      botao: r.botao,
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
  return u.situacao === "robo" && ultima?.de === "robo" && RESPOSTA_SEM_VAGA.test(ultima.texto) ? u.historico : null;
}

export type BuscaDeNovo = { ok: true; texto: string; botao: Botao | null } | { ok: false; motivo: string };

/** A mensagem da busca nova para a conversa (sem enviar). */
export async function buscaDeNovo(conversa: string, nome: string | null): Promise<BuscaDeNovo> {
  const acesso = acessoFila();
  if (!acesso) return { ok: false, motivo: "Falta a chave do servidor." };
  const { cliente: banco, chave } = acesso;
  const historico = await conversaSemVaga(banco, chave, conversa);
  if (!historico) return { ok: false, motivo: "A conversa andou: a última resposta já não é a do “não achei”." };
  const teto = await tetoDoMes(banco, chave, conversa);
  if (teto?.economico) return { ok: false, motivo: "O atendimento está no modo econômico (o teto do mês)." };
  const enviadas = await banco.rpc("servidor_whatsapp_vagas_enviadas", { p_chave: chave, p_conversa: conversa });
  const restam = VAGAS_POR_DIA - (enviadas.error ? 0 : Number(enviadas.data) || 0);
  if (restam <= 0) return { ok: false, motivo: `A pessoa já recebeu as ${VAGAS_POR_DIA} vagas de hoje.` };
  const modelo = await modeloDoAtendimento();
  if (!modelo) return { ok: false, motivo: "A IA do atendimento está desligada." };
  let busca: Busca;
  try {
    const { texto } = await chamarIA({
      funcionalidade: "chat",
      modelo,
      sistema: `Você lê uma conversa do WhatsApp do Publike (vagas de emprego em ${ONDE_FUNCIONA}) com alguém que procura trabalho, e diz o que procurar para ela. ${REGRAS_DA_BUSCA} "busca.categoria" só se tiver certeza (senão "todas"); "busca.cidade" com a cidade onde ela mora ou quer trabalhar, se ela disse (uma das cidades da lista; senão vazio); "busca.bairro" com o bairro, como ela escreveu (senão vazio); "busca.fora" com a cidade que ela disse quando fica fora de onde o Publike funciona (senão vazio).`,
      mensagem: transcricao(historico),
      maxTokens: 300,
      esquema: ESQUEMA_DA_BUSCA,
      tempoLimite: 20_000,
    });
    busca = lerJson<{ busca: Busca }>(texto).busca;
  } catch (erro) {
    return { ok: false, motivo: `A IA não respondeu (${erro instanceof Error ? erro.message : "erro"}).` };
  }
  if (busca?.fora && !busca.cidade) return { ok: false, motivo: `A pessoa mora fora de onde o Publike funciona (${busca.fora}).` };
  const local = lugarDaBusca(busca?.cidade ?? "", busca?.bairro ?? "");
  const r = await mensagemDaBusca(busca, local, restam);
  if (!r.quantas) return { ok: false, motivo: "Ainda não há vaga da função nem parecida." };
  return {
    ok: true,
    texto: `${oi(primeiroNome(nome))} Procurei de novo as vagas para você, com mais cuidado.\n\n${r.abertura ?? r.aberturaPadrao}\n\n${r.texto}`,
    botao: r.botao,
  };
}

/** As vagas que o Publike já mandou nesta conversa (os links /anuncio/<id> das respostas). */
export function vagasJaMandadas(historico: { de: string; texto: string }[]) {
  const ids = new Set<string>();
  for (const m of historico)
    if (m.de !== "pessoa") for (const x of m.texto.matchAll(/\/anuncio\/([0-9a-f-]{36})/g)) ids.add(x[1]);
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
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const url = botao ? link(botao.caminho) : null;
  let r = botao && url ? await enviarComLink(cfg, numero, caber(texto), { titulo: botao.titulo, url }) : await enviarTexto(cfg, numero, texto);
  let marcaDoBotao = botao ? `[Botão: ${botao.titulo}]` : "";
  if (!r.ok && botao) {
    r = await enviarTexto(cfg, numero, url ? `${texto}\n\n${botao.titulo}: ${url}` : texto);
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
  // sem a migração: nada
  if (error) return { enviados: 0, falhas: 0 };
  let enviados = 0;
  let falhas = 0;
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
