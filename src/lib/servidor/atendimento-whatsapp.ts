import "server-only";
import { textoDaAjuda } from "@/lib/ajuda";
import { SITE_URL } from "@/lib/config";
import { CATEGORIAS, LIMITES_CONTA } from "@/lib/constantes";
import { formatarLugar, valorDoAnuncio } from "@/lib/formato";
import { modeloPara } from "@/lib/ia/funcionalidades";
import { chamarIA, iaConfigurada, lerJson } from "@/lib/ia/openai";
import { comOrigem } from "@/lib/origem";
import { ONDE_FUNCIONA } from "@/lib/pracas";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { criarClientePublico } from "@/lib/supabase/servidor";
import type { Json } from "@/lib/supabase/tipos-banco";
import {
  enviarComBotoes,
  enviarComLink,
  enviarTexto,
  marcarLidaDigitando,
  type ConfigMeta,
} from "./whatsapp";

// O atendimento pelo WhatsApp (18/11/2026, claude/plano-whatsapp-atendimento.md; migrações 20270801120000 e
// 20270803120000). Pedido do Marcelo: "Quero automatizar o atendimento do WhatsApp, explicar aos interessados sobre o
// Publike". Quem escreve para o número da API (quase sempre vindo de um anúncio de clique para o WhatsApp no Instagram)
// recebe a resposta do Publike. Quando a pessoa pede alguém, a IA não sabe ou o número passa das respostas do dia, a
// conversa passa para a equipe (Admin › WhatsApp › Conversas e o e-mail dos "Avisos para a equipe") e a IA fica quieta.
//
// O jeito de conversar (18/11/2026, à noite; Marcelo: "Tornar o diálogo mais simples mas completo, capricha e deixe ele
// melhor, não seja tão aficionado a levar o usuário a publicar ou procurar vagas, mas isso precisa ser evidente"):
//   * os momentos de sempre têm texto pronto, escrito com cuidado e sem IA: as boas-vindas (o "Oi" ou o "Posso ter mais
//     informações?" do anúncio), o "Procuro trabalho", o "Quero contratar", o "Oi" de novo, o áudio, a foto e o arquivo;
//   * o resto a IA responde, com o que está na Ajuda (src/lib/ajuda.ts): o que a pessoa perguntou, simples e completo,
//     sem terminar toda mensagem empurrando a publicar ou procurar vaga;
//   * o caminho fica à vista nos botões, e não no texto: os botões "Procuro trabalho", "Quero contratar" e "Falar com a
//     equipe" enquanto não se sabe o que a pessoa quer, e um botão que abre o site ("Ver vagas", "Publicar vaga
//     grátis") quando a conversa leva até ele;
//   * mensagens seguidas ("Oi", "Oi", "tudo bem?") recebem uma resposta só: espera uns segundos e só a mais nova
//     responde, com a conversa toda;
//   * "ok", "👍" e o código que a Meta manda ao ligar o número no Instagram não recebem resposta.
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

type Plano = {
  resposta: string;
  perfil: "trabalho" | "contratar" | "indefinido";
  acao: "responder" | "buscar_vagas" | "equipe" | "silencio";
  link: NomeDoLink | "nenhum";
  busca: { texto: string; categoria: string };
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
        required: ["texto", "categoria"],
        properties: {
          texto: { type: "string" },
          categoria: {
            type: "string",
            enum: [...CATEGORIAS.map((c) => c.slug), "todas"],
          },
        },
      },
    },
  },
};

/** Os links do site, já com a origem (o Admin conta quem chegou pelo WhatsApp). */
const link = (caminho: string) =>
  comOrigem(`${SITE_URL}${caminho}`, "whatsapp", "atendimento");

// --- Ler a mensagem ---------------------------------------------------------------------------------------------

/** Sem acento, sem pontuação, em minúsculas: "Olá! Tudo bem?" vira "ola tudo bem". */
const simples = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const PALAVRAS_DE_OI = new Set([
  "oi",
  "oii",
  "oiii",
  "oie",
  "ola",
  "olaa",
  "opa",
  "eai",
  "e",
  "ai",
  "bom",
  "boa",
  "dia",
  "tarde",
  "noite",
  "tudo",
  "bem",
  "td",
  "bm",
  "blz",
  "beleza",
  "tranquilo",
  "joia",
  "hello",
  "hi",
  "hey",
  "alo",
  "salve",
  "como",
  "vai",
  "voce",
  "vc",
  "pessoal",
  "gente",
  "amigo",
  "amiga",
  "moco",
  "moca",
  "marcelo",
  "publike",
]);

/** Só um "Oi", "Boa tarde", "Olá, tudo bem?". */
function soCumprimento(t: string) {
  const p = simples(t).split(" ").filter(Boolean);
  return (
    p.length > 0 &&
    p.length <= 6 &&
    p.every((x) => PALAVRAS_DE_OI.has(x) || /^o+i+e*$/.test(x))
  );
}

/** Só emoji ("👍", "🙏"): depois de conversar, não pede resposta. */
const soEmoji = (t: string) =>
  t.trim() !== "" && simples(t) === "" && t.trim().length <= 12;

/** O pedido geral, como o texto pronto do anúncio: "Olá! Posso ter mais informações sobre isso?". */
function pedidoGeral(t: string) {
  const s = simples(t);
  if (s.split(" ").length > 10 || /\bvagas? (de|para|pra)\b/.test(s))
    return false;
  return /(mais informac|informac(ao|oes) sobre|saber mais|tenho interesse|como funciona|quero entender|do que se trata|sobre isso|me explica|o que e o publike|que site e esse)/.test(
    s,
  );
}

/** O código que a Meta manda ao ligar o número no Instagram ou no Facebook ("79680 é seu código do Instagram"). */
function codigoDaMeta(t: string) {
  const s = simples(t);
  return (
    /\b\d{4,8}\b/.test(s) &&
    /\b(codigo|code)\b/.test(s) &&
    /\b(instagram|facebook|whatsapp|meta)\b/.test(s)
  );
}

/** "[a pessoa mandou um áudio]": o que veio sem texto (o webhook escreve assim). */
function midiaDaMensagem(t: string) {
  const m = t.match(/^\[a pessoa mandou (.+)\]$/);
  if (!m) return null;
  const o = m[1];
  if (o.includes("áudio")) return "audio" as const;
  if (o.includes("foto")) return "foto" as const;
  if (o.includes("vídeo")) return "video" as const;
  if (o.includes("figurinha")) return "figurinha" as const;
  if (o.includes("arquivo")) return "arquivo" as const;
  return "outro" as const;
}

const NAO_E_NOME = new Set([
  "loja",
  "centro",
  "studio",
  "estudio",
  "salao",
  "clinica",
  "academia",
  "mercado",
  "supermercado",
  "padaria",
  "restaurante",
  "bar",
  "lanchonete",
  "empresa",
  "comercial",
  "distribuidora",
  "farmacia",
  "escola",
  "colegio",
  "igreja",
  "grupo",
  "agencia",
  "publike",
  "dr",
  "dra",
  "sr",
  "sra",
  "pr",
  "pastor",
  "rh",
  "vagas",
  "emprego",
]);

/** O primeiro nome do perfil do WhatsApp, quando parece nome de gente ("~Raphael" vira "Raphael"; "Loja X", nada). */
function primeiroNome(nome: string | null) {
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

// --- Os textos prontos ------------------------------------------------------------------------------------------

const oi = (nome: string | null) => `Oi${nome ? `, ${nome}` : ""}!`;

function boasVindas(nome: string | null) {
  return [
    `${oi(nome)} 👋 Aqui é o ${QUEM_ATENDE}, do Publike.`,
    `O Publike é um site *grátis* de vagas de emprego perto de casa, em ${ONDE_FUNCIONA}:\n• quem procura trabalho se candidata pelo celular e acompanha cada passo: se a empresa viu, se aceitou e quando é a entrevista;\n• quem contrata publica a vaga de graça e recebe os candidatos organizados.`,
    "Como posso te ajudar?",
  ].join("\n\n");
}

const PARA_QUEM_PROCURA = [
  "Que bom! Para quem procura trabalho, funciona assim:",
  "1. Você faz o currículo pelo celular, em poucos minutos.\n2. Vê as vagas perto de casa e se candidata com um toque, no botão *Curtir*.\n3. Acompanha cada candidatura: se a empresa viu, se aceitou e quando é a entrevista. Quando ela aceita, vocês conversam direto.",
  "É grátis, sempre. Se quiser, me conta o que você faz e o bairro onde mora, que eu procuro vagas para você por aqui.",
].join("\n\n");

const PARA_QUEM_CONTRATA = [
  "Que bom! Para contratar pelo Publike:",
  "1. Você publica a vaga de graça. Pode colar o texto ou mandar a foto do anúncio: o Publike preenche tudo para você conferir.\n2. Os candidatos chegam no seu painel, mostrando o quanto cada um combina com a vaga.\n3. Você aceita quem quiser e conversa direto com a pessoa.",
  `Dá para ter até ${LIMITES_CONTA.comum.noAr} vagas no ar de graça, sem limite de candidatos. Quem contrata muito tem planos com recursos a mais, como a triagem com IA. Se ficar alguma dúvida, é só me perguntar.`,
].join("\n\n");

const PASSAR_PARA_EQUIPE =
  "Certo! Vou pedir para alguém da equipe do Publike te responder por aqui. Em breve alguém fala com você, no horário comercial.";
const CONTINUAR_COM_A_EQUIPE =
  "Para continuar, vou pedir para alguém da equipe do Publike te responder por aqui. Em breve alguém fala com você, no horário comercial.";

// --- A IA -------------------------------------------------------------------------------------------------------

function instrucoes(e: Entrada, jaFalou: boolean) {
  const nome = primeiroNome(e.nome);
  const anuncio = [e.origem?.titulo, e.origem?.texto]
    .filter(Boolean)
    .join(" — ");
  const quem = [
    nome
      ? `A pessoa se chama ${nome} (é o nome dela no WhatsApp, não o seu). Chame pelo nome no máximo uma vez, na saudação.`
      : "O nome de quem escreve não veio: não chame a pessoa por nome.",
    e.conta
      ? `Este número já tem conta no Publike (${e.conta.tipo === "pessoa" ? "de pessoa" : "de empresa, comércio ou agência"}).`
      : "Este número ainda não tem conta no Publike.",
    e.perfil === "trabalho"
      ? "Ela procura trabalho."
      : e.perfil === "contratar"
        ? "Ela quer contratar."
        : "Ainda não se sabe se ela procura trabalho ou quer contratar.",
    anuncio
      ? `Ela chegou por um anúncio do Publike no Instagram ou no Facebook: "${anuncio}".`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `Você responde o WhatsApp oficial do Publike, um site grátis de vagas de emprego, freelances e serviços perto de casa, em ${ONDE_FUNCIONA}.

Quem você é
- Você é o ${QUEM_ATENDE}, do Publike.
- ${
    jaFalou
      ? 'Você já falou com a pessoa nesta conversa: não se apresente de novo e não comece com "Oi".'
      : `Esta é a sua primeira mensagem para a pessoa: comece com "${oi(nome)} Aqui é o ${QUEM_ATENDE}, do Publike." e diga numa frase o que é o Publike; depois responda.`
  }
- Se a pessoa perguntar se está falando com um robô, diga com franqueza que é o atendimento automático do Publike, em nome do ${QUEM_ATENDE}, e que alguém da equipe responde por aqui se ela quiser.

Como responder
- Responda o que a pessoa perguntou: simples, mas completo, com o que ela precisa saber para resolver. Se a pergunta tiver duas partes, responda as duas.
- Escreva como numa conversa de WhatsApp: frases curtas, palavras do dia a dia, gentil e direto, sem jargão de RH.
- Parágrafos curtos, com uma linha em branco entre eles. No máximo umas 5 frases; para um passo a passo, até 3 itens numerados ("1.", "2.", "3."), curtos.
- *negrito* do WhatsApp em no máximo duas palavras. No máximo um emoji, e só se combinar. Sem títulos, sem markdown, sem listas com hífen ou asterisco.
- Sem pressa de vender: não termine toda mensagem com uma pergunta nem convidando a publicar vaga, procurar vaga ou fazer currículo. Ofereça o próximo passo só quando ele ajudar a pessoa a resolver o que ela falou, e uma vez só.
- Não escreva links nem endereços de site. Quando a pessoa precisar abrir o site, escolha o botão no campo "link": ele vai junto da mensagem, e no texto você pode dizer "é só tocar no botão abaixo".
- Não repita o que você já disse na conversa. Não pergunte se a pessoa procura trabalho ou quer contratar: quando ainda não se sabe, a mensagem já vai com os botões "Procuro trabalho" e "Quero contratar".

O que nunca fazer
- Nunca invente vaga, empresa, salário, preço, prazo ou regra: use só o que está aqui. Não diga o preço dos planos: escolha o botão "empresas".
- Nunca peça documento, CPF, senha, código, dados de cartão ou dinheiro. O Publike nunca cobra de quem procura trabalho: se pediram dinheiro em nome de uma vaga, é golpe.
- Você não mexe na conta de ninguém, não publica vaga nem candidata a pessoa: diga como ela faz no site.

O essencial do Publike
- Para quem procura trabalho: é grátis, sempre. A pessoa faz o currículo pelo celular em poucos minutos (dá para mandar o PDF, uma foto ou contar falando), vê as vagas perto de casa e se candidata com um toque, no botão Curtir da vaga. Depois acompanha cada candidatura: se a empresa viu, se aceitou e quando é a entrevista. Quando a empresa aceita, as duas se conectam e conversam direto.
- Para quem contrata (empresa, comércio, agência ou família): publicar é grátis, até ${LIMITES_CONTA.comum.noAr} vagas no ar ao mesmo tempo, sem limite de candidatos. Dá para colar o texto da vaga ou mandar a foto do anúncio, e o Publike preenche tudo para conferir. Os candidatos chegam no painel com o quanto combinam com a vaga. Para quem contrata muito, há planos com recursos a mais (triagem com IA, teste prático, entrevista em vídeo e mais vagas no ar).

${quem}

O que fazer (campo "acao")
- responder: o normal.
- buscar_vagas: a pessoa procura trabalho e disse o que faz ou que vaga quer ("sou cozinheira", "tem vaga de motorista?"). Preencha "busca.texto" com a função, no singular, como ela falou ("cozinheira", "motorista"), e "busca.categoria" só se tiver certeza (senão "todas"). A "resposta" é só uma frase curta que apresenta as vagas, como "Olha as vagas de motorista no ar agora:"; a lista vai logo depois. Se ela só disse que procura emprego, sem dizer o quê, use responder e pergunte o que ela faz.
- equipe: a pessoa pede para falar com alguém, reclama, fala de pagamento, cobrança ou golpe, de problema na conta, de parceria ou de imprensa, ou você não sabe a resposta. Responda o que der (no golpe: não pague nada) e diga que vai pedir para alguém da equipe responder por aqui, em breve, no horário comercial.
- silencio: a mensagem não pede resposta, como "ok", "beleza", "👍" ou um "obrigado" depois que você já se despediu. Deixe "resposta" vazia. Para o primeiro "obrigado", use responder, com uma frase curta e sem pergunta.
Fora de buscar_vagas, "busca" vai com texto vazio e categoria "todas".

O botão (campo "link")
- vagas: ver as vagas no ar. publicar: publicar uma vaga. curriculo: fazer ou mudar o currículo. empresas: o que o Publike oferece a quem contrata, com os planos. ajuda: as perguntas e respostas do site. entrar: entrar na conta. nenhum: sem botão.
- Escolha um só quando a pessoa precisar abrir o site para fazer o que vocês falaram. Na dúvida, nenhum. Não repita o botão que foi na sua mensagem anterior (o histórico mostra entre colchetes os botões que foram junto; não escreva colchetes).

"perfil": trabalho, contratar ou indefinido, pelo que a conversa mostra até agora.
Assunto que não é trabalho nem o Publike: diga com gentileza que por aqui você só ajuda com o Publike.

A Ajuda do site (o que você sabe sobre o Publike):
${textoDaAjuda()}`;
}

function transcricao(historico: Mensagem[]) {
  const quem = { pessoa: "Pessoa", robo: "Você", equipe: "Equipe" } as const;
  return `Conversa até agora:\n${historico.map((m) => `${quem[m.de]}: ${m.texto}`).join("\n")}\n\nResponda à Pessoa (às mensagens dela depois da sua última resposta).`;
}

/** As vagas no ar que combinam com o que a pessoa disse (as mais perto do centro de Goiânia), em linhas com o link. */
async function vagasEmTexto(busca: Plano["busca"]) {
  const tentar = async (texto: string | null, categoria: string | null) => {
    const { data, error } = await criarClientePublico().rpc("buscar_anuncios", {
      p_tipo: "vaga",
      p_texto: texto,
      p_categoria: categoria,
      p_raio_km: 60,
      p_ordem: "recentes",
      p_limite: 20,
    });
    return error ? [] : (data ?? []);
  };
  const texto = busca.texto.trim().slice(0, 60) || null;
  const categoria = CATEGORIAS.some((c) => c.slug === busca.categoria)
    ? busca.categoria
    : null;
  let lista = await tentar(texto, categoria);
  if (!lista.length && categoria) lista = await tentar(texto, null);
  if (!lista.length && texto && texto.length > 6)
    lista = await tentar(texto.slice(0, 6), null);
  if (!lista.length) return null;
  const linha = (a: (typeof lista)[number]) => {
    const valor = valorDoAnuncio(a);
    return `• *${a.titulo}*${valor ? ` · ${valor}` : ""} · ${formatarLugar(a.bairro, a.cidade)}\n${link(`/anuncio/${a.id}`)}`;
  };
  // a mensagem com botão vai até 1.024 letras: com links longos, cabem menos vagas
  let n = Math.min(4, lista.length);
  while (n > 1 && lista.slice(0, n).map(linha).join("\n\n").length > 800) n--;
  const p = new URLSearchParams({ tipo: "vaga" });
  if (texto) p.set("q", texto);
  return {
    texto: lista.slice(0, n).map(linha).join("\n\n"),
    mais:
      lista.length > n ? { titulo: "Ver mais vagas", caminho: `/?${p}` } : null,
  };
}

/** O modelo do chat (Admin › IA), se a IA está configurada. */
async function modeloDoAtendimento() {
  if (!iaConfigurada()) return null;
  const { data } = await criarClientePublico().rpc("config_publica");
  return modeloPara(data?.[0], "chat");
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
  m: {
    wamid: string;
    numero: string;
    texto: string;
    payload: string | null;
    nome: string | null;
    origem: Record<string, string | null> | null;
  },
  opcoes: { espera?: typeof ESPERA } = {},
) {
  const { data, error } = await banco.rpc(
    "servidor_whatsapp_conversa_entrada",
    {
      p_chave: chave,
      p_numero: m.numero,
      p_texto: m.texto,
      p_nome: m.nome,
      p_origem: (m.origem as Json) ?? null,
      p_payload: m.payload,
      p_wamid: m.wamid,
    },
  );
  if (error || !data) {
    console.error(
      "Publike: a conversa do WhatsApp não entrou:",
      error?.message,
    );
    return;
  }
  const e = data as unknown as Entrada;
  if (!e.ligado || e.situacao === "equipe") return;
  // o código que a Meta manda ao ligar o número no Instagram fica guardado na conversa, sem resposta
  if (codigoDaMeta(m.texto)) return;

  // o "👍" ou a figurinha depois de conversar não vai ter resposta: só marca como lida, sem o "digitando…"
  const soReacao =
    e.historico.some((x) => x.de !== "pessoa") &&
    (soEmoji(m.texto) || midiaDaMensagem(m.texto) === "figurinha");
  await marcarLidaDigitando(cfg, m.wamid, !soReacao).catch(() => undefined);

  // espera um pouco: se chegou outra mensagem da pessoa, ela é que responde, com a conversa toda
  const espera = opcoes.espera ?? ESPERA;
  await new Promise((r) =>
    setTimeout(r, m.payload ? espera.botao : espera.texto),
  );
  const agora = await banco.rpc("servidor_whatsapp_conversa_ultima", {
    p_chave: chave,
    p_conversa: e.chave,
  });
  if (!agora.error && agora.data) {
    const u = agora.data as unknown as {
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
      console.error(
        "Publike: a mensagem com botão do atendimento não saiu:",
        r.erro,
      );
      r = await enviarTexto(
        cfg,
        m.numero,
        extra.botao && url
          ? `${texto}\n\n${extra.botao.titulo}: ${url}`
          : texto,
      );
      marca = "";
    }
    if (!r.ok)
      console.error("Publike: a resposta do atendimento não saiu:", r.erro);
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

  // o botão "Falar com a equipe"
  if (e.pediu_equipe)
    return saida(PASSAR_PARA_EQUIPE, {
      equipe: true,
      motivo: "a pessoa pediu",
    });
  // passou das respostas do dia: a equipe continua
  if (e.respostas_hoje >= e.limite)
    return saida(CONTINUAR_COM_A_EQUIPE, {
      equipe: true,
      motivo: "o número passou das respostas da IA no dia",
    });

  const nome = primeiroNome(e.nome);
  const respostas = e.historico.filter((x) => x.de !== "pessoa");
  const jaFalou = respostas.length > 0;
  const minhaUltima = respostas.at(-1)?.texto ?? "";
  const novas = semResposta(e.historico);
  const textos = novas.length ? novas.map((x) => x.texto) : [m.texto];
  const midias = textos.map(midiaDaMensagem);
  const semPerfil = !e.perfil;

  // os botões do começo, com texto pronto
  if (novas.length <= 1 && m.payload === "a:trabalho")
    return saida(PARA_QUEM_PROCURA, { perfil: "trabalho", botao: LINKS.vagas });
  if (novas.length <= 1 && m.payload === "a:contratar")
    return saida(PARA_QUEM_CONTRATA, {
      perfil: "contratar",
      botao: LINKS.publicar,
    });

  // só "Oi", "Posso ter mais informações sobre isso?" ou uma figurinha
  const soOi = textos.every(
    (t) =>
      soCumprimento(t) ||
      soEmoji(t) ||
      midiaDaMensagem(t) === "figurinha" ||
      (!jaFalou && pedidoGeral(t)),
  );
  if (soOi) {
    if (!jaFalou) return saida(boasVindas(nome), { menu: semPerfil });
    // "👍" ou figurinha depois de conversar: não pede resposta
    if (!textos.some(soCumprimento)) return;
    const deNovo =
      minhaUltima.startsWith("Oi") || minhaUltima.startsWith("Estou por aqui");
    return saida(
      deNovo
        ? semPerfil
          ? "Estou por aqui! 😊 É só me contar como posso te ajudar, ou tocar num dos botões abaixo."
          : "Estou por aqui! 😊 É só me contar como posso te ajudar."
        : `${oi(nome)} ${semPerfil ? "Como posso te ajudar?" : "Em que posso te ajudar?"}`,
      { menu: semPerfil },
    );
  }

  // só áudio, foto, vídeo ou arquivo: por aqui, só texto
  if (midias.every(Boolean)) {
    const tipo = midias.at(-1);
    if (tipo === "foto" && e.perfil === "contratar")
      return saida(
        "Recebi a foto! Por aqui eu não consigo publicar, mas no site é rapidinho: toque em *Publicar vaga grátis* e envie a foto do anúncio lá. O Publike lê e preenche tudo para você conferir.",
        { botao: LINKS.publicar },
      );
    if (tipo === "arquivo" && e.perfil !== "contratar")
      return saida(
        "Recebi o arquivo, mas por aqui eu não consigo abrir. Se for o seu currículo, é só enviar no site: dá para mandar o PDF ou uma foto, e o Publike preenche tudo para você conferir.",
        { botao: LINKS.curriculo },
      );
    return saida(
      tipo === "audio"
        ? "Ainda não consigo ouvir áudio por aqui. Pode me escrever? Assim eu já te respondo."
        : "Por aqui eu só consigo ler mensagens escritas. Pode me contar por escrito?",
      { menu: !jaFalou && semPerfil },
    );
  }

  // o resto, a IA
  const modelo = await modeloDoAtendimento();
  if (!modelo)
    return saida(CONTINUAR_COM_A_EQUIPE, {
      equipe: true,
      motivo: "a IA está desligada",
    });

  let plano: Plano;
  try {
    const { texto } = await chamarIA({
      funcionalidade: "chat",
      modelo,
      sistema: instrucoes(e, jaFalou),
      mensagem: transcricao(
        e.historico.length ? e.historico : [{ de: "pessoa", texto: m.texto }],
      ),
      maxTokens: 600,
      esquema: ESQUEMA,
      tempoLimite: 20_000,
    });
    plano = lerJson<Plano>(texto);
  } catch (erro) {
    console.error(
      "Publike: a IA do atendimento falhou:",
      erro instanceof Error ? erro.message : erro,
    );
    return saida(CONTINUAR_COM_A_EQUIPE, {
      equipe: true,
      motivo: "a IA não respondeu",
    });
  }

  const perfil =
    plano.perfil === "trabalho" || plano.perfil === "contratar"
      ? plano.perfil
      : null;
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
    return saida(CONTINUAR_COM_A_EQUIPE, {
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
    const vagas = await vagasEmTexto({
      texto: busca,
      categoria: plano.busca?.categoria ?? "todas",
    });
    if (!vagas)
      return saida(
        `Agora não achei vaga${busca ? ` de ${busca}` : ""} no ar perto daqui. Entram vagas novas todo dia: as que estão no ar agora ficam no botão abaixo.`,
        { perfil: perfil ?? "trabalho", botao: LINKS.vagas },
      );
    resposta = `${resposta}\n\n${vagas.texto}\n\nPara se candidatar, abra a vaga e toque em *Curtir*.`;
    return saida(resposta, { perfil: perfil ?? "trabalho", botao: vagas.mais });
  }

  // o botão que abre o site, quando a conversa leva até ele; senão, os botões do começo, uma vez, enquanto não se sabe
  // o que a pessoa quer
  const botao =
    plano.link && plano.link !== "nenhum" && plano.link in LINKS
      ? LINKS[plano.link]
      : null;
  const menuJaFoi = respostas.some((x) => x.texto.includes("[Botões:"));
  return saida(resposta, {
    perfil,
    botao,
    menu: !botao && !perfil && semPerfil && !menuJaFoi,
  });
}
