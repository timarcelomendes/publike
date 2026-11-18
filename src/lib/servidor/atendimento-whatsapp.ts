import "server-only";
import { textoDaAjuda } from "@/lib/ajuda";
import { SITE_URL } from "@/lib/config";
import { CATEGORIAS } from "@/lib/constantes";
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
  enviarTexto,
  marcarLidaDigitando,
  type ConfigMeta,
} from "./whatsapp";

// O atendimento pelo WhatsApp (18/11/2026, claude/plano-whatsapp-atendimento.md; migração 20270801120000). Pedido do
// Marcelo: "Quero automatizar o atendimento do WhatsApp, explicar aos interessados sobre o Publike". Quem escreve para
// o número da API (quase sempre vindo de um anúncio de clique para o WhatsApp no Instagram) recebe a resposta da IA do
// Publike, com o que está na Ajuda (src/lib/ajuda.ts), as vagas do banco quando pede e os links certos. A primeira
// resposta pergunta, com botões, se a pessoa procura trabalho ou quer contratar. Quando a pessoa pede alguém, a IA
// não sabe ou o número passa das respostas do dia, a conversa passa para a equipe (Admin › WhatsApp › Conversas e o
// e-mail dos "Avisos para a equipe") e a IA fica quieta. A IA usa o modelo do chat (Admin › IA › "IA do Publike").

// Quem atende se apresenta sempre como o Marcelo, o dono (18/11/2026, Marcelo, com o print do "Aqui é o Marcelo":
// "quando o cliente recebe aparece o nome dele, tem que ser o meu"). O nome do WhatsApp que chega com a mensagem é o de
// quem escreve; a IA confundia os dois e se apresentava com o nome da pessoa.
const QUEM_ATENDE = "Marcelo";

const BOTOES = [
  { id: "a:trabalho", titulo: "Procuro trabalho" },
  { id: "a:contratar", titulo: "Quero contratar" },
  { id: "a:equipe", titulo: "Falar com a equipe" },
];

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
  historico: { de: "pessoa" | "robo" | "equipe"; texto: string }[];
};

type Plano = {
  resposta: string;
  perfil: "trabalho" | "contratar" | "indefinido";
  acao: "nenhuma" | "buscar_vagas" | "equipe";
  busca: { texto: string; categoria: string };
};

const ESQUEMA = {
  nome: "atendimento_whatsapp",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["resposta", "perfil", "acao", "busca"],
    properties: {
      resposta: { type: "string" },
      perfil: { type: "string", enum: ["trabalho", "contratar", "indefinido"] },
      acao: { type: "string", enum: ["nenhuma", "buscar_vagas", "equipe"] },
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

/** Os links que a IA pode mandar, já com a origem (o Admin conta quem chegou pelo WhatsApp). */
const link = (caminho: string) =>
  comOrigem(`${SITE_URL}${caminho}`, "whatsapp", "atendimento");

function instrucoes(e: Entrada) {
  const quem = [
    e.nome
      ? `Quem escreve aparece no WhatsApp como "${e.nome}" (pode ser apelido). Esse é o nome da pessoa, não o seu: se parecer nome, chame a pessoa pelo primeiro nome, no máximo uma vez por mensagem. Nunca se apresente com o nome dela.`
      : "O nome de quem escreve não veio: não chame a pessoa por nome.",
    e.conta
      ? `Este número já tem conta no Publike (${e.conta.tipo === "pessoa" ? "pessoa" : "empresa, comércio ou agência"}).`
      : "Este número ainda não tem conta no Publike.",
    e.perfil === "trabalho" ? "A pessoa disse que procura trabalho." : null,
    e.perfil === "contratar" ? "A pessoa disse que quer contratar." : null,
    e.origem?.titulo || e.origem?.texto
      ? `Ela chegou por um anúncio do Publike no Instagram ou no Facebook: "${[e.origem.titulo, e.origem.texto].filter(Boolean).join(" — ")}". Comece pelo assunto do anúncio.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `Você atende o WhatsApp do Publike, um site grátis de vagas, freelances e serviços perto de casa, em ${ONDE_FUNCIONA}.
Você é o ${QUEM_ATENDE}, do Publike, em todas as conversas. Na primeira mensagem, apresente-se assim: "Aqui é o ${QUEM_ATENDE}, do Publike". Depois, não precisa repetir.
Se a pessoa perguntar se está falando com um robô ou com o ${QUEM_ATENDE} mesmo, diga com franqueza que este é o atendimento automático do Publike, em nome do ${QUEM_ATENDE}, e que uma pessoa da equipe responde por aqui se ela quiser.
Responda em português do Brasil, como uma pessoa da equipe falaria no WhatsApp: simples, calorosa e direta, sem jargão de RH.
No máximo 5 frases curtas. Sem markdown, sem títulos, sem listas com asterisco; pode usar *negrito* do WhatsApp em uma ou duas palavras. No máximo um emoji, e só se combinar.
Use só o que está abaixo sobre o Publike. Nunca invente vaga, empresa, salário, preço, prazo ou regra. Não fale de preço dos planos: mande ver em ${link("/empresas")}.
Nunca peça documento, CPF, senha, código de SMS, dados de cartão ou dinheiro. O Publike nunca cobra de quem procura trabalho.
Você não consegue mexer na conta de ninguém, publicar vaga, nem candidatar a pessoa: explique como ela faz no site, com o link.

O que mais importa:
- Para quem procura trabalho: é grátis, sempre. A pessoa vê as vagas perto de casa, se candidata com um toque (o botão Curtir da vaga) e acompanha cada candidatura: vê se a empresa viu, se aceitou e quando marcou a entrevista. Quando a empresa aceita, os dois se conectam e conversam. O currículo fica pronto em poucos minutos (dá para mandar o PDF, uma foto ou contar falando). Links: vagas ${link("/")}, currículo ${link("/perfil/curriculo")}.
- Para quem contrata (empresa, comércio, agência ou família): publicar a vaga é grátis, sem limite de candidatos. A pessoa cola o texto da vaga ou manda a foto do anúncio, e o Publike preenche tudo; ela confere e publica. Os candidatos chegam com o quanto combinam com a vaga. Há planos opcionais com recursos a mais (triagem com IA, teste prático, entrevista em vídeo). Links: publicar ${link("/publicar")}, para empresas ${link("/empresas")}.
- Se ainda não sabe o que a pessoa quer, responda o que ela perguntou e termine perguntando se ela procura trabalho ou quer contratar.

${quem}

Escolha a ação:
- buscar_vagas: a pessoa procura trabalho e disse o que faz ou que vaga quer ("sou cozinheira", "tem vaga de motorista?"). Preencha "busca.texto" com a profissão no singular, do jeito que ela falou, e "busca.categoria" só se tiver certeza (senão "todas"). A resposta é uma frase curta apresentando as vagas; o site põe a lista logo depois. Se ela só disse que procura emprego, sem dizer o quê, use "nenhuma" e pergunte que trabalho ela faz e em que bairro ou cidade.
- equipe: a pessoa pede para falar com uma pessoa ou atendente, reclama, fala de pagamento ou cobrança, de problema na conta, de golpe, de parceria ou imprensa, ou você não sabe a resposta. Diga que uma pessoa da equipe vai responder por aqui, em breve, no horário comercial.
- nenhuma: o resto. Em nenhuma e equipe, "busca" vai com texto vazio e categoria "todas".
"perfil": trabalho, contratar ou indefinido, pelo que a conversa mostra até agora.
Áudio, foto ou arquivo: diga com gentileza que por aqui você só lê texto e peça para escrever.
Assunto fora de trabalho e do Publike: diga, com gentileza, que aqui você só ajuda com o Publike.

O que você sabe sobre o Publike (a Ajuda do site):
${textoDaAjuda()}`;
}

function transcricao(e: Entrada) {
  return `Conversa até agora:\n${e.historico
    .map(
      (m) =>
        `${m.de === "pessoa" ? "Pessoa" : m.de === "equipe" ? "Equipe" : "Publike"}: ${m.texto}`,
    )
    .join("\n")}\n\nResponda à última mensagem da Pessoa.`;
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
  const linhas = lista.slice(0, 4).map((a) => {
    const valor = valorDoAnuncio(a);
    const lugar = formatarLugar(a.bairro, a.cidade);
    return `• *${a.titulo}*${valor ? ` · ${valor}` : ""} · ${lugar}\n${link(`/anuncio/${a.id}`)}`;
  });
  const p = new URLSearchParams({ tipo: "vaga" });
  if (texto) p.set("q", texto);
  const mais = lista.length > 4 ? `\n\nVeja todas: ${link(`/?${p}`)}` : "";
  return `${linhas.join("\n\n")}${mais}`;
}

/** O modelo do chat (Admin › IA), se a IA está configurada e o assistente ligado. */
async function modeloDoAtendimento() {
  if (!iaConfigurada()) return null;
  const { data } = await criarClientePublico().rpc("config_publica");
  return modeloPara(data?.[0], "chat");
}

const PASSAR_PARA_EQUIPE =
  "Vou chamar uma pessoa da equipe do Publike para te responder por aqui. Em breve alguém fala com você, no horário comercial.";

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

  const saida = async (
    texto: string,
    extra: {
      perfil?: string | null;
      equipe?: boolean;
      motivo?: string;
      botoes?: boolean;
    } = {},
  ) => {
    const r = extra.botoes
      ? await enviarComBotoes(cfg, m.numero, texto, BOTOES)
      : await enviarTexto(cfg, m.numero, texto);
    if (!r.ok)
      console.error("Publike: a resposta do atendimento não saiu:", r.erro);
    await banco.rpc("servidor_whatsapp_conversa_saida", {
      p_chave: chave,
      p_conversa: e.chave,
      // a resposta que não saiu fica fora da conversa, mas a passagem para a equipe vale
      p_texto: r.ok ? texto : "",
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
    return saida(PASSAR_PARA_EQUIPE, {
      equipe: true,
      motivo: "o número passou das respostas da IA no dia",
    });

  const modelo = await modeloDoAtendimento();
  if (!modelo)
    return saida(PASSAR_PARA_EQUIPE, {
      equipe: true,
      motivo: "a IA está desligada",
    });

  await marcarLidaDigitando(cfg, m.wamid).catch(() => undefined);

  let plano: Plano;
  try {
    const { texto } = await chamarIA({
      funcionalidade: "chat",
      modelo,
      sistema: instrucoes(e),
      mensagem: transcricao(e),
      maxTokens: 500,
      esquema: ESQUEMA,
      tempoLimite: 20_000,
    });
    plano = lerJson<Plano>(texto);
  } catch (erro) {
    console.error(
      "Publike: a IA do atendimento falhou:",
      erro instanceof Error ? erro.message : erro,
    );
    return saida(PASSAR_PARA_EQUIPE, {
      equipe: true,
      motivo: "a IA não respondeu",
    });
  }

  const perfil =
    plano.perfil === "trabalho" || plano.perfil === "contratar"
      ? plano.perfil
      : null;
  let resposta = (plano.resposta ?? "").trim().slice(0, 1500);
  if (!resposta)
    return saida(PASSAR_PARA_EQUIPE, {
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
    const vagas = await vagasEmTexto({
      texto: plano.busca?.texto ?? "",
      categoria: plano.busca?.categoria ?? "todas",
    });
    resposta = vagas
      ? `${resposta}\n\n${vagas}\n\nPara se candidatar, abra a vaga e toque em *Curtir*.`
      : `Agora não achei vaga com isso no ar. Veja as vagas novas de hoje: ${link("/?tipo=vaga")}. Se fizer o currículo, as empresas também te encontram: ${link("/perfil/curriculo")}`;
  }

  // a primeira resposta, sem saber o que a pessoa quer: os botões
  const botoes =
    !perfil &&
    !e.perfil &&
    e.historico.filter((x) => x.de !== "pessoa").length === 0;
  return saida(resposta, { perfil, botoes });
}
