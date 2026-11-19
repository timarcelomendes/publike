import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "@/lib/config";
import { destinoDoAviso } from "@/lib/destino-aviso";
import { comOrigem } from "@/lib/origem";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { fraseDaEntrevista } from "@/lib/whatsapp";
import { atenderConversa } from "./atendimento-whatsapp";
import { acessoFila } from "./filas";

// O WhatsApp oficial (a API de nuvem da Meta; claude/plano-whatsapp-oficial.md, migração 20270619120000). O banco põe
// os avisos na fila (só de quem aceitou); daqui saem pelos modelos aprovados na Meta, com o botão que abre o Publike
// ou os botões de resposta rápida, que voltam pelo webhook (/api/whatsapp/webhook).
//
// Variáveis na Vercel (nunca no banco nem no código; só o usuário põe):
//   WHATSAPP_TOKEN            o token permanente do usuário do sistema (whatsapp_business_messaging e _management)
//   WHATSAPP_PHONE_ID         o ID do número do Publike na API (não é o número)
//   WHATSAPP_WABA_ID          o ID da conta do WhatsApp Business (para cadastrar e conferir os modelos)
//   WHATSAPP_APP_SECRET       a chave secreta do app da Meta (confere a assinatura do webhook)
//   WHATSAPP_WEBHOOK_TOKEN    o token que você inventa e põe também no cadastro do webhook na Meta
// Só em teste: WHATSAPP_GRAPH_URL (uma Meta falsa) e WHATSAPP_GRAPH_VERSAO.

const env = (nome: string) => (process.env[nome] || "").trim();

export type ConfigMeta = {
  token: string;
  phoneId: string;
  wabaId: string;
  appSecret: string;
  webhookToken: string;
  base: string;
};

/** A ligação com a Meta (null: falta o token ou o ID do número; nada sai e nada dá erro). */
export function configMeta(): ConfigMeta | null {
  const token = env("WHATSAPP_TOKEN");
  const phoneId = env("WHATSAPP_PHONE_ID");
  if (!token || !/^\d{5,30}$/.test(phoneId)) return null;
  const versao = env("WHATSAPP_GRAPH_VERSAO") || "v24.0";
  return {
    token,
    phoneId,
    wabaId: /^\d{5,30}$/.test(env("WHATSAPP_WABA_ID")) ? env("WHATSAPP_WABA_ID") : "",
    appSecret: env("WHATSAPP_APP_SECRET"),
    webhookToken: env("WHATSAPP_WEBHOOK_TOKEN"),
    base: `${(env("WHATSAPP_GRAPH_URL") || "https://graph.facebook.com").replace(/\/+$/, "")}/${versao}`,
  };
}

/** Para o Admin: o que está na Vercel (só sim ou não, nunca o valor). */
export function situacaoWhatsapp() {
  return {
    token: Boolean(env("WHATSAPP_TOKEN")),
    numero: /^\d{5,30}$/.test(env("WHATSAPP_PHONE_ID")),
    conta: /^\d{5,30}$/.test(env("WHATSAPP_WABA_ID")),
    segredo: Boolean(env("WHATSAPP_APP_SECRET")),
    webhook: env("WHATSAPP_WEBHOOK_TOKEN").length >= 12,
    enderecoWebhook: `${SITE_URL}/api/whatsapp/webhook`,
  };
}

// --- Os modelos (cadastrados na Meta pelo Admin › WhatsApp e conferidos sozinhos) -----------------------------------

type Botao = { tipo: "link"; texto: string; exemplo: string } | { tipo: "resposta"; texto: string; valor: string };

export type Modelo = {
  nome: string;
  /** o aviso do Publike que sai por este modelo (o tipo da notificação; a escolha fica em montarMensagem) */
  aviso: string;
  /** quem recebe e quando (para o Admin) */
  para: string;
  quando: string;
  corpo: string;
  exemplo: Record<string, string>;
  botoes: Botao[];
  /**
   * Marketing (o convite do pacote, 18/11/2026; Marcelo: "Boa ideia, se converter.. o custo compensa"): cadastra assim
   * na Meta e manda mesmo nessa categoria, que custa umas 9 vezes a de utilidade. Sem ela, é utilidade, e o modelo que
   * a Meta mudar para marketing não sai.
   */
  categoria?: "MARKETING";
};

export const RODAPE_WHATSAPP = "Responda PARAR para não receber mais";

export const MODELOS: Modelo[] = [
  {
    nome: "publike_match",
    aviso: "match",
    para: "Candidato",
    quando: "A empresa aceitou a candidatura (o match)",
    corpo:
      "Oi, {{nome}}! {{empresa}} aceitou a sua candidatura para a vaga de {{vaga}}. O contato de vocês já está liberado no Publike.",
    exemplo: { nome: "Ana", empresa: "Padaria Pão de Ouro", vaga: "Atendente de padaria" },
    botoes: [{ tipo: "link", texto: "Ver o contato", exemplo: "painel/matches" }],
  },
  {
    nome: "publike_entrevista",
    aviso: "entrevista",
    para: "Candidato",
    quando: "Entrevista marcada ou remarcada",
    corpo:
      "Oi, {{nome}}! A sua entrevista para a vaga de {{vaga}} ficou para {{quando}}. Confirme ou peça para remarcar no Publike.",
    exemplo: { nome: "Ana", vaga: "Atendente de padaria", quando: "ter, 18/11 às 14h, presencial, na Rua 10, 250" },
    botoes: [{ tipo: "link", texto: "Confirmar", exemplo: "anuncio/123" }],
  },
  {
    nome: "publike_escolher_horario",
    aviso: "entrevista",
    para: "Candidato",
    quando: "A empresa mandou horários para escolher",
    corpo:
      "Oi, {{nome}}! {{empresa}} mandou horários para a sua entrevista para a vaga de {{vaga}}. Escolha o melhor para você no Publike.",
    exemplo: { nome: "Ana", empresa: "Padaria Pão de Ouro", vaga: "Atendente de padaria" },
    botoes: [{ tipo: "link", texto: "Escolher o horário", exemplo: "anuncio/123" }],
  },
  {
    nome: "publike_entrevista_amanha",
    aviso: "entrevista_lembrete",
    para: "Candidato",
    quando: "Véspera da entrevista, à noite",
    corpo:
      "Oi, {{nome}}! Amanhã tem a sua entrevista para a vaga de {{vaga}}: {{quando}}. Se não puder ir, avise pelo Publike.",
    exemplo: { nome: "Ana", vaga: "Atendente de padaria", quando: "ter, 18/11 às 14h, presencial, na Rua 10, 250" },
    botoes: [{ tipo: "link", texto: "Ver a entrevista", exemplo: "anuncio/123" }],
  },
  {
    nome: "publike_te_respondeu",
    aviso: "te_respondeu",
    para: "Candidato",
    quando: "2 dias depois do contato: a empresa respondeu?",
    corpo:
      "Oi, {{nome}}! {{empresa}} te respondeu sobre a vaga de {{vaga}}? Toque numa opção: a sua resposta ajuda quem procura trabalho a saber quem responde.",
    exemplo: { nome: "Ana", empresa: "Padaria Pão de Ouro", vaga: "Atendente de padaria" },
    botoes: [
      { tipo: "resposta", texto: "Sim, respondeu", valor: "sim" },
      { tipo: "resposta", texto: "Ainda não", valor: "ainda_nao" },
      { tipo: "resposta", texto: "Desisti da vaga", valor: "desisti" },
    ],
  },
  {
    nome: "publike_deu_certo_v2",
    aviso: "conquista_pergunta",
    para: "Candidato",
    quando: "7 dias depois: começou a trabalhar?",
    // 16/11/2026: a 1ª versão a Meta pôs em marketing; esta fala só da candidatura (utilidade)
    corpo:
      "Oi, {{nome}}! Sobre a sua candidatura para a vaga de {{vaga}} em {{empresa}}: você já começou a trabalhar? Toque numa opção para atualizar a situação da candidatura no Publike.",
    exemplo: { nome: "Ana", vaga: "Atendente de padaria", empresa: "Padaria Pão de Ouro" },
    botoes: [
      { tipo: "resposta", texto: "Comecei!", valor: "comecei" },
      { tipo: "resposta", texto: "Ainda não", valor: "ainda_nao" },
      { tipo: "resposta", texto: "Não deu certo", valor: "nao_deu" },
    ],
  },
  {
    nome: "publike_retorno",
    aviso: "dispensada",
    para: "Candidato",
    quando: "Não seguiu: o retorno da empresa",
    corpo:
      "Oi, {{nome}}. {{empresa}} deixou um retorno sobre a sua candidatura para a vaga de {{vaga}}. Veja no Publike, junto com vagas parecidas.",
    exemplo: { nome: "Ana", empresa: "Padaria Pão de Ouro", vaga: "Atendente de padaria" },
    botoes: [{ tipo: "link", texto: "Ver o retorno", exemplo: "anuncio/123/parecidas" }],
  },
  {
    nome: "publike_candidato_novo",
    aviso: "curtida",
    para: "Quem contrata",
    quando: "Candidatura nova (juntas por vaga)",
    corpo: "Oi, {{nome}}! Chegou candidatura nova na vaga de {{vaga}}: {{candidatos}}. Veja e responda pelo Publike.",
    exemplo: { nome: "Padaria Pão de Ouro", vaga: "Atendente de padaria", candidatos: "Ana S. e mais 2 pessoas" },
    botoes: [{ tipo: "link", texto: "Ver a candidatura", exemplo: "painel/caixa" }],
  },
  {
    nome: "publike_pedido_servico",
    aviso: "curtida",
    para: "Prestador de serviço",
    quando: "Pedido novo num serviço",
    corpo: "Oi, {{nome}}! Chegou pedido novo para {{servico}} pelo Publike: {{clientes}}. Veja e responda pelo Publike.",
    exemplo: { nome: "João", servico: "Eletricista residencial", clientes: "Ana S." },
    botoes: [{ tipo: "link", texto: "Ver o pedido", exemplo: "painel/caixa" }],
  },
  {
    nome: "publike_esperando_resposta_v3",
    aviso: "lembrete_curtida",
    para: "Quem contrata",
    quando: "Candidatura sem resposta há 1 e 3 dias",
    // 16/11/2026: a v1 e a v2 a Meta pôs em marketing; a v3 segue o jeito do publike_candidato_novo (utilidade)
    corpo:
      "Oi, {{nome}}! Candidaturas sem resposta na vaga de {{vaga}}: {{quantos}} há mais de um dia. Veja e responda pelo Publike.",
    exemplo: { nome: "Padaria Pão de Ouro", vaga: "Atendente de padaria", quantos: "3 candidaturas" },
    botoes: [{ tipo: "link", texto: "Responder", exemplo: "painel/caixa" }],
  },
  {
    nome: "publike_ainda_espera_v2",
    aviso: "ainda_espera",
    para: "Quem contrata",
    quando: "O candidato disse que ainda não teve resposta",
    corpo:
      "Oi, {{nome}}! {{candidato}} informou que ainda aguarda o retorno sobre a candidatura para a vaga de {{vaga}}. Abra a candidatura no Publike para responder.",
    exemplo: { nome: "Padaria Pão de Ouro", candidato: "Ana S.", vaga: "Atendente de padaria" },
    botoes: [{ tipo: "link", texto: "Responder", exemplo: "painel/anuncio/123/quadro" }],
  },
  {
    nome: "publike_confirma_inicio",
    aviso: "conquista_confirmar",
    para: "Quem contrata",
    quando: "Confirmar se a pessoa começou",
    corpo: "Oi, {{nome}}! {{candidato}} começou a trabalhar com vocês pela vaga de {{vaga}}? Toque numa opção para confirmar.",
    exemplo: { nome: "Padaria Pão de Ouro", candidato: "Ana S.", vaga: "Atendente de padaria" },
    botoes: [
      { tipo: "resposta", texto: "Sim, começou", valor: "sim" },
      { tipo: "resposta", texto: "Não começou", valor: "nao" },
    ],
  },
  {
    nome: "publike_interesse_v2",
    aviso: "interesse_local",
    para: "Quem contrata",
    quando: "\"Quero trabalhar aqui\" em Quem contrata perto",
    // 16/11/2026: a versão curta voltou "100: Invalid parameter" (variável demais para o tamanho do texto). A v3, sem o
    // nome antigo ("que mora perto" no lugar de "na Rota do currículo"), a Meta pôs em marketing; a v2 é utilidade e
    // fica, com o nome antigo no texto (o modelo aprovado não muda de texto)
    corpo:
      "Oi, {{nome}}! {{candidato}} enviou o currículo para a sua empresa pelo Publike, na Rota do currículo. Abra o Publike para ver o currículo e responder.",
    exemplo: { nome: "Padaria Pão de Ouro", candidato: "Ana S." },
    botoes: [{ tipo: "link", texto: "Ver o currículo", exemplo: "talentos/123" }],
  },
  {
    nome: "publike_mensagem",
    aviso: "mensagem",
    para: "Todos",
    quando: "Mensagem nova no chat que ficou sem ler (a espera fica em Parâmetros)",
    // 16/11/2026: a versão curta voltou "100: Invalid parameter" (variável demais para o tamanho do texto)
    corpo:
      "Oi, {{nome}}! {{quem}} te mandou uma mensagem nova no chat do Publike e está esperando a sua resposta. Abra o Publike para ler e responder na conversa.",
    exemplo: { nome: "Ana", quem: "Padaria Pão de Ouro" },
    botoes: [{ tipo: "link", texto: "Ver a mensagem", exemplo: "painel/conversas" }],
  },
  {
    nome: "publike_vaga_que_combina",
    aviso: "convite",
    para: "Candidato",
    // modelo de marketing (claude/plano-ritmo-do-pacote.md)
    quando: "O pacote de candidatos convida quem combina com a vaga",
    corpo:
      "Oi, {{nome}}! Tem uma vaga perto de você que combina com o seu currículo: {{vaga}}. Veja os detalhes no Publike e, se tiver interesse, curta a vaga.",
    exemplo: { nome: "Ana", vaga: "Atendente de padaria" },
    botoes: [{ tipo: "link", texto: "Ver a vaga", exemplo: "anuncio/123" }],
    categoria: "MARKETING",
  },
];

const POR_NOME = new Map(MODELOS.map((m) => [m.nome, m]));

/** As variáveis do corpo, na ordem: "{{nome}}" → "nome". */
export function variaveisDoModelo(m: Modelo) {
  return [...m.corpo.matchAll(/\{\{([a-z_]+)\}\}/g)].map((x) => x[1]);
}

/** O corpo do cadastro na Meta (utilidade ou, no convite do pacote, marketing; português, parâmetros com nome). */
export function cadastroDoModelo(m: Modelo) {
  const botoes = m.botoes.map((b) =>
    b.tipo === "link"
      ? { type: "URL", text: b.texto, url: `${SITE_URL}/{{1}}`, example: [`${SITE_URL}/${b.exemplo}`] }
      : { type: "QUICK_REPLY", text: b.texto },
  );
  return {
    name: m.nome,
    language: "pt_BR",
    category: m.categoria ?? "UTILITY",
    parameter_format: "NAMED",
    components: [
      {
        type: "BODY",
        text: m.corpo,
        example: { body_text_named_params: variaveisDoModelo(m).map((v) => ({ param_name: v, example: m.exemplo[v] })) },
      },
      { type: "FOOTER", text: RODAPE_WHATSAPP },
      { type: "BUTTONS", buttons: botoes },
    ],
  };
}

// --- A API da Meta ---------------------------------------------------------------------------------------------------

type ErroMeta = {
  code?: number;
  message?: string;
  error_subcode?: number;
  error_user_msg?: string;
  error_data?: { details?: string };
};
type RespostaMeta<T> = { ok: true; dados: T } | { ok: false; status: number; erro: ErroMeta | null; texto: string };

async function graph<T>(
  cfg: ConfigMeta,
  caminho: string,
  init?: { metodo?: "GET" | "POST"; corpo?: unknown },
): Promise<RespostaMeta<T>> {
  try {
    const r = await fetch(`${cfg.base}/${caminho}`, {
      method: init?.metodo ?? "GET",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: init?.corpo === undefined ? undefined : JSON.stringify(init.corpo),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const json = (await r.json().catch(() => null)) as (T & { error?: ErroMeta }) | null;
    if (!r.ok || !json || json.error) {
      const erro = json?.error ?? null;
      return {
        ok: false,
        status: r.status,
        erro,
        texto: erro ? `${erro.code ?? r.status}: ${erro.error_user_msg || erro.error_data?.details || erro.message || "erro da Meta"}` : `HTTP ${r.status}`,
      };
    }
    return { ok: true, dados: json };
  } catch (e) {
    return { ok: false, status: 0, erro: null, texto: e instanceof Error ? e.message : String(e) };
  }
}

/** Os códigos do erro que passa (a Meta ocupada, o limite por minuto). */
const CODIGOS_PASSAGEIROS = [1, 2, 4, 80007, 130429, 131000, 131016, 131056];

/** Erro que passa (a Meta ocupada, limite por minuto, rede): tenta de novo. */
function passageiro(r: { status: number; erro: ErroMeta | null }) {
  const c = r.erro?.code;
  return r.status === 0 || r.status >= 500 || r.status === 429 || CODIGOS_PASSAGEIROS.includes(c ?? -1);
}

/** O token ou a conta com problema: para tudo (não é culpa de um aviso). */
function deConfiguracao(r: { status: number; erro: ErroMeta | null }) {
  const c = r.erro?.code;
  return r.status === 401 || [10, 190, 200, 131031, 133010].includes(c ?? -1);
}

/** O texto do parâmetro: sem quebra de linha, sem espaço repetido (a Meta recusa) e com um tamanho que cabe. */
function limpar(t: unknown, max = 120) {
  const s = String(t ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s) || "—";
}

export type Envio = { ok: true; wamid: string } | { ok: false; erro: string; passageiro: boolean; configuracao: boolean };

export async function enviarModelo(
  cfg: ConfigMeta,
  numero: string,
  modelo: Modelo,
  params: Record<string, string>,
  extra: { link?: string; respostas?: string[] } = {},
): Promise<Envio> {
  const components: unknown[] = [
    {
      type: "body",
      parameters: variaveisDoModelo(modelo).map((v) => ({ type: "text", parameter_name: v, text: limpar(params[v]) })),
    },
  ];
  modelo.botoes.forEach((b, i) => {
    if (b.tipo === "link") {
      components.push({
        type: "button",
        sub_type: "url",
        index: String(i),
        parameters: [{ type: "text", text: extra.link ?? "" }],
      });
    } else {
      components.push({
        type: "button",
        sub_type: "quick_reply",
        index: String(i),
        parameters: [{ type: "payload", payload: extra.respostas?.[i] ?? b.valor }],
      });
    }
  });
  const r = await graph<{ messages?: { id: string }[] }>(cfg, `${cfg.phoneId}/messages`, {
    metodo: "POST",
    corpo: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: numero.replace(/\D/g, ""),
      type: "template",
      template: { name: modelo.nome, language: { code: "pt_BR" }, components },
    },
  });
  if (r.ok) {
    const wamid = r.dados.messages?.[0]?.id;
    return wamid ? { ok: true, wamid } : { ok: false, erro: "a Meta não devolveu o id da mensagem", passageiro: false, configuracao: false };
  }
  return { ok: false, erro: r.texto.slice(0, 300), passageiro: passageiro(r), configuracao: deConfiguracao(r) };
}

/** Texto livre: só vale na janela de 24 horas depois de a pessoa mandar algo (a resposta a um botão ou ao PARAR). */
export async function enviarTexto(cfg: ConfigMeta, numero: string, texto: string) {
  const r = await graph<{ messages?: { id: string }[] }>(cfg, `${cfg.phoneId}/messages`, {
    metodo: "POST",
    corpo: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: numero.replace(/\D/g, ""),
      type: "text",
      text: { body: texto.slice(0, 4000), preview_url: false },
    },
  });
  return r.ok ? { ok: true as const, wamid: r.dados.messages?.[0]?.id ?? null } : { ok: false as const, erro: r.texto };
}

/**
 * Texto com até 3 botões de resposta (só na janela de 24 horas): o atendimento usa na primeira resposta ("Procuro
 * trabalho", "Quero contratar", "Falar com a equipe"). O toque volta no webhook como `interactive.button_reply`.
 */
export async function enviarComBotoes(
  cfg: ConfigMeta,
  numero: string,
  texto: string,
  botoes: { id: string; titulo: string }[],
) {
  const r = await graph<{ messages?: { id: string }[] }>(cfg, `${cfg.phoneId}/messages`, {
    metodo: "POST",
    corpo: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: numero.replace(/\D/g, ""),
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: texto.slice(0, 1024) },
        action: {
          buttons: botoes.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: b.titulo.slice(0, 20) } })),
        },
      },
    },
  });
  return r.ok ? { ok: true as const, wamid: r.dados.messages?.[0]?.id ?? null } : { ok: false as const, erro: r.texto };
}

/**
 * Texto com um botão que abre uma página do site (só na janela de 24 horas): o atendimento usa para deixar o caminho à
 * vista ("Ver vagas", "Publicar vaga grátis") sem pôr o link no meio do texto. O nome do botão vai até 20 letras.
 */
export async function enviarComLink(
  cfg: ConfigMeta,
  numero: string,
  texto: string,
  botao: { titulo: string; url: string },
) {
  const r = await graph<{ messages?: { id: string }[] }>(cfg, `${cfg.phoneId}/messages`, {
    metodo: "POST",
    corpo: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: numero.replace(/\D/g, ""),
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: texto.slice(0, 1024) },
        action: { name: "cta_url", parameters: { display_text: botao.titulo.slice(0, 20), url: botao.url } },
      },
    },
  });
  return r.ok ? { ok: true as const, wamid: r.dados.messages?.[0]?.id ?? null } : { ok: false as const, erro: r.texto };
}

/**
 * Marca a mensagem como lida e mostra "digitando…" para a pessoa até a resposta sair (no máximo 25 segundos). Sem
 * `digitando`, só marca como lida (o "👍" que não vai ter resposta).
 */
export async function marcarLidaDigitando(cfg: ConfigMeta, wamid: string, digitando = true) {
  await graph(cfg, `${cfg.phoneId}/messages`, {
    metodo: "POST",
    corpo: {
      messaging_product: "whatsapp",
      status: "read",
      message_id: wamid,
      ...(digitando ? { typing_indicator: { type: "text" } } : {}),
    },
  });
}

/** O modelo de teste da Meta (hello_world, em inglês, que toda conta nova já tem aprovado). */
export async function enviarTeste(cfg: ConfigMeta, numero: string, modelos: SituacaoModelos = {}) {
  // um aviso do Publike já aprovado, com os dados de exemplo (o teste de verdade, com o botão que abre o site)
  const aprovado = MODELOS.find(
    (m) => modelos[m.nome]?.status === "APPROVED" && m.botoes.length > 0 && m.botoes.every((b) => b.tipo === "link"),
  );
  if (aprovado) {
    const botao = aprovado.botoes[0];
    const r = await enviarModelo(cfg, numero, aprovado, aprovado.exemplo, {
      link: botao.tipo === "link" ? botao.exemplo : undefined,
    });
    return r.ok ? { ok: true as const, modelo: aprovado.nome } : { ok: false as const, erro: explicarErro(r.erro) };
  }
  // sem modelo do Publike aprovado ainda: o de exemplo da Meta (nem toda conta nova tem)
  const r = await graph<{ messages?: { id: string }[] }>(cfg, `${cfg.phoneId}/messages`, {
    metodo: "POST",
    corpo: {
      messaging_product: "whatsapp",
      to: numero.replace(/\D/g, ""),
      type: "template",
      template: { name: "hello_world", language: { code: "en_US" } },
    },
  });
  if (r.ok) return { ok: true as const, modelo: "hello_world" };
  // número de verdade (o hello_world só sai do número de teste da Meta, 131058) ou sem o hello_world (132001): um
  // texto simples, que a Meta aceita se a pessoa escreveu para o número do Publike nas últimas 24 horas
  if (r.erro?.code === 131058 || r.erro?.code === 132001) {
    const t = await enviarTexto(
      cfg,
      numero,
      "Teste do Publike: o WhatsApp oficial está ligado. Os avisos de verdade saem pelos modelos aprovados pela Meta.",
    );
    if (t.ok) return { ok: true as const, modelo: "texto" };
    return {
      ok: false as const,
      erro:
        "Nenhum aviso do Publike aprovado ainda, e o modelo de exemplo da Meta só sai do número de teste. Para testar " +
        "agora, mande um \"oi\" do seu WhatsApp para o número do Publike e clique de novo (vale por 24 horas). Ou use " +
        "\"Cadastrar e conferir na Meta\" e espere a aprovação (minutos ou horas).",
    };
  }
  return { ok: false as const, erro: explicarErro(r.texto) };
}

/**
 * O erro da Meta em português, para o Admin: os da hora de ligar e os do envio e da entrega (a lista de códigos da
 * API de nuvem). Sem código conhecido, ou já explicado, volta como veio.
 */
export function explicarErro(texto: string) {
  const codigo = Number(/^(\d+):/.exec(texto)?.[1] ?? 0);
  const explicacao: Record<number, string> = {
    131058: "o modelo de exemplo da Meta (hello_world) só sai do número de teste; use um aviso do Publike aprovado",
    131047: "passaram 24 horas desde a última mensagem da pessoa; fora dessa janela, só sai modelo aprovado",
    131030: "o número não está na lista de destinatários do número de teste da Meta (Etapa 1 › Destinatário; até 5 números)",
    190: "o token venceu ou não vale (o token temporário da Meta dura 24 horas; use o do usuário do sistema)",
    131026: "o número não tem WhatsApp, o aplicativo da pessoa está desatualizado ou ela não aceitou os termos novos do WhatsApp",
    131042: "falta a forma de pagamento da conta do WhatsApp (Gerenciador do WhatsApp › Configurações)",
    132001: "o modelo não existe nesta conta ou ainda não foi aprovado",
    133010: "o número do Publike ainda não foi registrado na API (Admin › WhatsApp › Ligação e teste)",
    131031: "a conta do WhatsApp está bloqueada pela Meta",
    10: "o token não tem permissão para esta conta do WhatsApp (atribua a conta ao usuário do sistema)",
    200: "o token não tem permissão para esta conta do WhatsApp (atribua a conta ao usuário do sistema)",
    // o envio e a entrega
    4: "chamadas demais à Meta em pouco tempo",
    100: "a Meta recusou um campo da mensagem (parâmetro inválido); confira o modelo e as variáveis",
    368: "a conta foi bloqueada por um tempo por violar as regras da Meta (veja o Gerenciador do WhatsApp)",
    80007: "a conta chegou no limite de envios da Meta por um tempo",
    130429: "a Meta limitou a velocidade de envio (mensagens por segundo)",
    130472: "a pessoa está num teste da Meta e não recebe mensagens de marketing",
    131000: "erro desconhecido na Meta",
    131005: "o app perdeu uma permissão na Meta (confira o usuário do sistema e o token)",
    131008: "faltou um campo obrigatório na mensagem",
    131009: "um valor da mensagem não vale para a Meta",
    131016: "a Meta estava fora do ar",
    131021: "o número de destino é o próprio número do Publike",
    131037: "o número do Publike precisa do nome de exibição aprovado pela Meta antes de mandar",
    131045: "o número do Publike está com erro de registro (registre de novo em Ligação e teste)",
    131048: "a Meta limitou o número do Publike porque muitas mensagens foram bloqueadas ou marcadas como spam",
    131049: "a Meta não entregou para não cansar a pessoa (o limite de mensagens de marketing por pessoa)",
    131050: "a pessoa parou de receber mensagens de marketing de empresas no WhatsApp",
    131051: "um tipo de mensagem que a Meta não aceita",
    131056: "mensagens demais para a mesma pessoa em pouco tempo",
    131057: "a conta do WhatsApp estava em manutenção na Meta",
    132000: "o número de variáveis não bate com o do modelo aprovado",
    132005: "o texto do modelo, com as variáveis, passou de 1.024 letras",
    132012: "o formato de uma variável não bate com o do modelo aprovado",
    132015: "a Meta pausou o modelo por baixa qualidade (muita gente bloqueou ou denunciou)",
    132016: "a Meta desligou o modelo de vez (foi pausado vezes demais); é preciso cadastrar outro",
    133004: "a Meta estava com um problema técnico",
    135000: "erro genérico da Meta com os dados da mensagem",
  };
  return explicacao[codigo] ? `${explicacao[codigo]} (${texto})` : texto;
}

/** O erro passageiro pelo texto guardado na fila ("130429: …"): o robô tenta de novo até 3 vezes. */
export function erroPassageiro(texto: string) {
  return CODIGOS_PASSAGEIROS.includes(Number(/^(\d+):/.exec(texto)?.[1] ?? 0));
}

type DadosDoNumero = {
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  name_status?: string;
  code_verification_status?: string;
  platform_type?: string;
};

/**
 * O número do Publike na Meta: o nome aprovado, a qualidade, o limite por dia e se já está registrado na API de
 * nuvem (platform_type CLOUD_API). Se a Meta não conhecer algum campo, pergunta só o básico.
 */
export async function conferirNumero(cfg: ConfigMeta) {
  const basico = "display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status";
  let r = await graph<DadosDoNumero>(cfg, `${cfg.phoneId}?fields=${basico},code_verification_status,platform_type`);
  if (!r.ok && r.erro?.code === 100) r = await graph<DadosDoNumero>(cfg, `${cfg.phoneId}?fields=${basico}`);
  return r.ok ? { ok: true as const, ...r.dados } : { ok: false as const, erro: r.texto };
}

/** Registra o número na API de nuvem (obrigatório; não dá pelo painel da Meta). O PIN vira a confirmação em duas etapas. */
export async function registrarNumero(cfg: ConfigMeta, pin: string) {
  const r = await graph<{ success?: boolean }>(cfg, `${cfg.phoneId}/register`, {
    metodo: "POST",
    corpo: { messaging_product: "whatsapp", pin },
  });
  if (!r.ok) return { ok: false as const, erro: r.texto };
  return r.dados.success === false ? { ok: false as const, erro: "a Meta não confirmou" } : { ok: true as const };
}

/** Os apps que recebem o webhook da conta do WhatsApp (a Meta só manda os avisos ao app inscrito nela). */
export async function appsDoWebhook(cfg: ConfigMeta) {
  if (!cfg.wabaId) return { ok: false as const, erro: "Falta o WHATSAPP_WABA_ID na Vercel." };
  const r = await graph<{ data?: { whatsapp_business_api_data?: { id?: string; name?: string } }[] }>(
    cfg,
    `${cfg.wabaId}/subscribed_apps`,
  );
  if (!r.ok) return { ok: false as const, erro: r.texto };
  const apps = (r.dados.data ?? []).map((a) => a.whatsapp_business_api_data?.name || a.whatsapp_business_api_data?.id || "app");
  return { ok: true as const, apps };
}

/** Inscreve o app do Publike no webhook da conta do WhatsApp. */
export async function ligarWebhookDaConta(cfg: ConfigMeta) {
  if (!cfg.wabaId) return { ok: false as const, erro: "Falta o WHATSAPP_WABA_ID na Vercel." };
  const r = await graph<{ success?: boolean }>(cfg, `${cfg.wabaId}/subscribed_apps`, { metodo: "POST", corpo: {} });
  if (!r.ok) return { ok: false as const, erro: r.texto };
  return r.dados.success === false ? { ok: false as const, erro: "a Meta não confirmou" } : { ok: true as const };
}

export type SituacaoModelo = { status: string; categoria?: string; motivo?: string; tentado_em?: string };
export type SituacaoModelos = Record<string, SituacaoModelo>;

/**
 * A Meta pôs o modelo numa categoria que ele não declara (um de utilidade virou marketing): o robô não manda e o Admin
 * avisa. O modelo que declara `categoria` (o do convite do pacote, marketing) sai na categoria dele.
 */
export function categoriaBloqueia(m: Pick<Modelo, "categoria">, categoriaNaMeta: string | undefined | null) {
  return !!categoriaNaMeta && categoriaNaMeta !== "UTILITY" && categoriaNaMeta !== m.categoria;
}

/**
 * Confere na Meta a situação de cada modelo e cadastra os que faltam (no máximo uma tentativa a cada 6 horas por
 * modelo, a não ser que o Admin peça). Guarda no banco pela função `guardar`.
 */
export async function conferirModelos(
  cfg: ConfigMeta,
  antes: SituacaoModelos,
  guardar: (m: SituacaoModelos) => Promise<void>,
  forcar = false,
): Promise<{ ok: boolean; erro?: string; modelos: SituacaoModelos }> {
  if (!cfg.wabaId) return { ok: false, erro: "Falta o WHATSAPP_WABA_ID na Vercel.", modelos: antes };
  const lista = await graph<{ data?: { name: string; status: string; category?: string; language?: string; rejected_reason?: string }[] }>(
    cfg,
    `${cfg.wabaId}/message_templates?fields=name,status,category,language,rejected_reason&limit=250`,
  );
  if (!lista.ok) return { ok: false, erro: lista.texto, modelos: antes };
  const naMeta = new Map(
    (lista.dados.data ?? []).filter((t) => t.language === "pt_BR").map((t) => [t.name, t] as const),
  );
  const agora = Date.now();
  const novos: SituacaoModelos = {};
  for (const m of MODELOS) {
    const t = naMeta.get(m.nome);
    if (t) {
      novos[m.nome] = {
        status: t.status,
        categoria: t.category,
        motivo: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : undefined,
      };
      continue;
    }
    const tentado = antes[m.nome]?.tentado_em ? Date.parse(antes[m.nome].tentado_em!) : 0;
    if (!forcar && agora - tentado < 6 * 3600_000) {
      novos[m.nome] = antes[m.nome] ?? { status: "FALTA" };
      continue;
    }
    const criado = await graph<{ id?: string; status?: string; category?: string }>(cfg, `${cfg.wabaId}/message_templates`, {
      metodo: "POST",
      corpo: cadastroDoModelo(m),
    });
    novos[m.nome] = criado.ok
      ? { status: criado.dados.status ?? "PENDING", categoria: criado.dados.category, tentado_em: new Date().toISOString() }
      : { status: "ERRO", motivo: criado.texto.slice(0, 200), tentado_em: new Date().toISOString() };
  }
  await guardar(novos);
  return { ok: true, modelos: novos };
}

// --- A fila -----------------------------------------------------------------------------------------------------------

type Entrevista = { quando: string; formato: string; local: string | null; situacao: string };

export type ItemWhatsapp = {
  id: number;
  tipo: string;
  conta_id: string;
  numero: string;
  quantos: number;
  anuncio_id: string | null;
  ator_id: string | null;
  tentativas: number;
  aviso: { tipo: string; link: string | null; recado_id: string | null; texto: string } | null;
  dados: {
    nome: string | null;
    conta_tipo: string | null;
    vaga: string | null;
    anuncio_tipo: string | null;
    empresa: string | null;
    ator: string | null;
    esperando: number | null;
    entrevista: Entrevista | null;
  } | null;
};

type Montada = { modelo: string; params: Record<string, string>; respostas?: string[] } | { pular: string };

function emais(nome: string | null, quantos: number) {
  const base = nome || "Uma pessoa";
  const mais = quantos - 1;
  return mais > 0 ? `${base} e mais ${mais} ${mais === 1 ? "pessoa" : "pessoas"}` : base;
}

/** Que modelo sai para este aviso, e com o quê (ou por que não sai). */
export function montarMensagem(item: ItemWhatsapp): Montada {
  const d = item.dados;
  if (!d) return { pular: "a conta não existe mais" };
  const nome = d.nome || "tudo bem";
  const vaga = d.vaga ?? "";
  const empresa = d.empresa ?? "A empresa";
  const pessoa = d.conta_tipo === "pessoa";
  const e = d.entrevista;
  switch (item.tipo) {
    case "match":
      if (!pessoa) return { pular: "match para quem não é candidato" };
      return { modelo: "publike_match", params: { nome, empresa, vaga } };
    case "entrevista":
      if (!e) return { pular: "sem entrevista desta pessoa" };
      if (e.situacao === "escolher") return { modelo: "publike_escolher_horario", params: { nome, empresa, vaga } };
      if (["marcada", "confirmada", "remarcar"].includes(e.situacao))
        return { modelo: "publike_entrevista", params: { nome, vaga, quando: fraseDaEntrevista(e) } };
      return { pular: `entrevista ${e.situacao}` };
    case "entrevista_lembrete":
      if (!e || !["marcada", "confirmada"].includes(e.situacao)) return { pular: "o lembrete é só para o candidato" };
      return { modelo: "publike_entrevista_amanha", params: { nome, vaga, quando: fraseDaEntrevista(e) } };
    case "te_respondeu":
      return {
        modelo: "publike_te_respondeu",
        params: { nome, empresa, vaga },
        respostas: ["sim", "ainda_nao", "desisti"].map((r) => `r:${item.id}:${r}`),
      };
    case "conquista_pergunta":
      return {
        modelo: "publike_deu_certo_v2",
        params: { nome, vaga, empresa },
        respostas: ["comecei", "ainda_nao", "nao_deu"].map((r) => `c:${item.id}:${r}`),
      };
    case "dispensada":
      return { modelo: "publike_retorno", params: { nome, empresa, vaga } };
    case "curtida":
      if (d.anuncio_tipo === "servico")
        return { modelo: "publike_pedido_servico", params: { nome, servico: vaga, clientes: emais(d.ator, item.quantos) } };
      return { modelo: "publike_candidato_novo", params: { nome, vaga, candidatos: emais(d.ator, item.quantos) } };
    case "lembrete_curtida": {
      const n = Number(d.esperando ?? 0);
      if (n < 1) return { pular: "ninguém esperando mais" };
      return {
        modelo: "publike_esperando_resposta_v3",
        params: { nome, vaga, quantos: n === 1 ? "1 candidatura" : `${n} candidaturas` },
      };
    }
    case "ainda_espera":
      return { modelo: "publike_ainda_espera_v2", params: { nome, candidato: d.ator ?? "Uma pessoa", vaga } };
    case "conquista_confirmar":
      return {
        modelo: "publike_confirma_inicio",
        params: { nome, candidato: d.ator ?? "Uma pessoa", vaga },
        respostas: ["sim", "nao"].map((r) => `e:${item.id}:${r}`),
      };
    case "interesse_local":
      return { modelo: "publike_interesse_v2", params: { nome, candidato: d.ator ?? "Uma pessoa" } };
    case "mensagem":
      return { modelo: "publike_mensagem", params: { nome, quem: d.ator ?? "Uma pessoa" } };
    case "convite":
      // só o convite do pacote entra na fila (o gatilho confere); o botão leva à vaga
      if (!pessoa) return { pular: "convite para quem não é candidato" };
      if (!vaga) return { pular: "a vaga não existe mais" };
      return { modelo: "publike_vaga_que_combina", params: { nome, vaga } };
    default:
      return { pular: `sem modelo para ${item.tipo}` };
  }
}

/** O fim do link do botão ("painel/caixa?c=…"), com a origem do WhatsApp. */
export function linkDoBotao(item: ItemWhatsapp) {
  // várias candidaturas juntas: a lista dos novos da vaga (não a ficha da primeira)
  const caminho =
    item.tipo === "curtida" && item.quantos > 1 && item.anuncio_id
      ? `/painel/caixa?aba=novos&vaga=${item.anuncio_id}`
      : destinoDoAviso(
    {
      tipo: item.tipo,
      anuncio_id: item.anuncio_id,
      ator_id: item.ator_id,
      recado_id: item.aviso?.recado_id ?? null,
      link: item.aviso?.link ?? null,
    },
        item.conta_id,
      );
  // a origem para o Admin › Campanhas ("whatsapp:aviso-match")
  const completo = comOrigem(`${SITE_URL}${caminho}`, "whatsapp", `aviso-${item.tipo.replace(/_/g, "-")}`);
  return completo.slice(SITE_URL.length).replace(/^\/+/, "");
}

export type ResultadoWhatsapp = { enviadas: number; falhas: number; puladas: number; motivo?: string };

/** O /api/filas a cada minuto: confere os modelos (a cada 30 minutos) e manda o que está na hora. */
export async function enviarWhatsappPendentes(limite = 30): Promise<ResultadoWhatsapp> {
  const resultado: ResultadoWhatsapp = { enviadas: 0, falhas: 0, puladas: 0 };
  const cfg = configMeta();
  const acesso = acessoFila();
  if (!cfg || !acesso) return resultado;
  const { cliente, chave } = acesso;
  const { data: conf, error: eConf } = await cliente.rpc("servidor_whatsapp_config", { p_chave: chave });
  if (eConf) {
    // sem a migração 20270619120000: nada a fazer
    if (eConf.code === "PGRST202") return resultado;
    return { ...resultado, motivo: "Não deu para ler a configuração do WhatsApp." };
  }
  const c = (conf ?? {}) as { ativo?: boolean; modelos?: SituacaoModelos; conferidos_em?: string | null };
  if (!c.ativo) return resultado;
  let modelos = c.modelos ?? {};
  if (!c.conferidos_em || Date.now() - Date.parse(c.conferidos_em) > 30 * 60_000) {
    const r = await conferirModelos(cfg, modelos, async (m) => {
      await cliente.rpc("servidor_whatsapp_salvar_modelos", { p_chave: chave, p_modelos: m });
    });
    if (r.ok) modelos = r.modelos;
  }

  const { data, error } = await cliente.rpc("servidor_whatsapp_pegar", { p_chave: chave, p_limite: limite });
  if (error) {
    console.error("Publike: falha ao ler a fila do WhatsApp:", error.message);
    return { ...resultado, motivo: "Não foi possível ler a fila do WhatsApp." };
  }
  const itens = ((data as { itens?: ItemWhatsapp[] } | null)?.itens ?? []) as ItemWhatsapp[];
  const marcar = (id: number, situacao: string, extra: { modelo?: string; wamid?: string; motivo?: string; minutos?: number } = {}) =>
    cliente.rpc("servidor_whatsapp_marcar", {
      p_chave: chave,
      p_id: id,
      p_situacao: situacao,
      p_modelo: extra.modelo ?? null,
      p_wamid: extra.wamid ?? null,
      p_motivo: extra.motivo ?? null,
      p_tentar_em_minutos: extra.minutos ?? null,
    });

  let parar: string | null = null;
  for (const item of itens) {
    // o token caiu no meio: o resto volta para a fila
    if (parar) {
      await marcar(item.id, "pendente", { motivo: parar, minutos: 30 });
      continue;
    }
    const m = montarMensagem(item);
    if ("pular" in m) {
      resultado.puladas++;
      await marcar(item.id, "descartada", { motivo: m.pular });
      continue;
    }
    const def = POR_NOME.get(m.modelo)!;
    const situacao = modelos[m.modelo];
    if (situacao?.status !== "APPROVED") {
      // o modelo ainda em análise na Meta: espera (o aviso vence em um dia)
      await marcar(item.id, "pendente", {
        modelo: m.modelo,
        motivo: `modelo ${m.modelo} ainda não aprovado pela Meta (${situacao?.status ?? "falta cadastrar"})`,
        minutos: 30,
      });
      continue;
    }
    if (categoriaBloqueia(def, situacao.categoria)) {
      // a Meta mudou o modelo para marketing (umas 9 vezes mais caro e com limite por pessoa): não manda
      await marcar(item.id, "pendente", {
        modelo: m.modelo,
        motivo: `a Meta mudou o modelo ${m.modelo} para ${situacao.categoria}`,
        minutos: 60,
      });
      continue;
    }
    const temLink = def.botoes.some((b) => b.tipo === "link");
    const envio = await enviarModelo(cfg, item.numero, def, m.params, {
      link: temLink ? linkDoBotao(item) : undefined,
      respostas: m.respostas,
    });
    if (envio.ok) {
      resultado.enviadas++;
      await marcar(item.id, "enviada", { modelo: m.modelo, wamid: envio.wamid });
    } else if (envio.configuracao) {
      parar = `a Meta recusou o envio: ${explicarErro(envio.erro)}`;
      resultado.falhas++;
      await marcar(item.id, "pendente", { modelo: m.modelo, motivo: parar, minutos: 30 });
    } else if (envio.passageiro && item.tentativas < 3) {
      await marcar(item.id, "pendente", { modelo: m.modelo, motivo: envio.erro, minutos: 5 * item.tentativas });
    } else {
      resultado.falhas++;
      await marcar(item.id, "falhou", { modelo: m.modelo, motivo: explicarErro(envio.erro) });
    }
  }
  if (parar) resultado.motivo = `WhatsApp parado: ${parar}. Confira o token em Admin › WhatsApp.`;
  return resultado;
}

// --- O webhook --------------------------------------------------------------------------------------------------------

/** A assinatura da Meta (X-Hub-Signature-256: "sha256=<hex>" do corpo com a chave secreta do app). */
export function assinaturaValida(corpo: string, cabecalho: string | null, segredo: string) {
  if (!segredo || !cabecalho?.startsWith("sha256=")) return false;
  const esperado = Buffer.from(createHmac("sha256", segredo).update(corpo, "utf8").digest("hex"));
  const veio = Buffer.from(cabecalho.slice(7).trim().toLowerCase());
  return esperado.length === veio.length && timingSafeEqual(esperado, veio);
}

/** O "hub.verify_token" do cadastro do webhook na Meta. */
export function tokenDoWebhookValido(token: string | null) {
  const esperado = env("WHATSAPP_WEBHOOK_TOKEN");
  if (esperado.length < 12 || !token) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

type MensagemRecebida = {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  button?: { payload?: string; text?: string };
  interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
  /** de onde veio: o anúncio de clique para o WhatsApp (Instagram ou Facebook) */
  referral?: Record<string, unknown>;
};
type ContatoRecebido = { wa_id?: string; profile?: { name?: string } };
type StatusRecebido = {
  id?: string;
  status?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
  pricing?: { billable?: boolean };
};
export type AvisoDaMeta = {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: { messages?: MensagemRecebida[]; statuses?: StatusRecebido[]; contacts?: ContatoRecebido[] };
    }[];
  }[];
};

/** O que a pessoa mandou sem texto, como fica guardado na conversa ("[a pessoa mandou um áudio]"). */
const MIDIA_RECEBIDA: Record<string, string> = {
  audio: "um áudio",
  voice: "um áudio",
  image: "uma foto",
  video: "um vídeo",
  document: "um arquivo",
  sticker: "uma figurinha",
  location: "uma localização",
  contacts: "um contato",
};

/** O anúncio de onde a pessoa veio, só o que serve (sem a imagem nem o id do clique). */
function origemDoAnuncio(r: Record<string, unknown> | undefined) {
  if (!r) return null;
  const texto = (k: string, max: number) => (typeof r[k] === "string" ? String(r[k]).slice(0, max) : null);
  const o = {
    tipo: texto("source_type", 20),
    link: texto("source_url", 300),
    titulo: texto("headline", 200),
    texto: texto("body", 500),
  };
  return o.tipo || o.link || o.titulo ? o : null;
}

/**
 * O que a Meta mandou: a entrega e a leitura, os botões, o PARAR e o resto. Responde pelo WhatsApp quando é o caso.
 * A conversa com a IA (o atendimento, migração 20270801120000) volta em `depois`: o webhook responde 200 à Meta na hora
 * e roda depois (`after()`), porque a IA pode levar alguns segundos.
 */
export async function tratarAvisoDaMeta(aviso: AvisoDaMeta, cliente?: ClienteBanco) {
  const depois: (() => Promise<void>)[] = [];
  const acesso = acessoFila();
  if (!acesso) return { tratados: 0, depois };
  const banco = cliente ?? acesso.cliente;
  const chave = acesso.chave;
  const cfg = configMeta();
  let tratados = 0;
  for (const entrada of aviso.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      if (mudanca.field !== "messages" || !mudanca.value) continue;
      for (const st of mudanca.value.statuses ?? []) {
        if (!st.id || !st.status) continue;
        const e = st.errors?.[0];
        await banco.rpc("servidor_whatsapp_status", {
          p_chave: chave,
          p_wamid: st.id,
          p_status: st.status,
          p_erro: e ? `${e.code ?? ""}: ${e.error_data?.details || e.message || e.title || "erro"}`.slice(0, 300) : null,
          p_cobrada: typeof st.pricing?.billable === "boolean" ? st.pricing.billable : null,
        });
        tratados++;
      }
      for (const m of mudanca.value.messages ?? []) {
        if (!m.id || !m.from) continue;
        const payload = m.button?.payload ?? m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? null;
        const texto =
          m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
        const { data } = await banco.rpc("servidor_whatsapp_recebida", {
          p_chave: chave,
          p_wamid: m.id,
          p_numero: m.from,
          p_texto: texto ? texto.slice(0, 500) : null,
          p_payload: payload ? payload.slice(0, 256) : null,
        });
        tratados++;
        if ((data as { acao?: string } | null)?.acao === "conversa" && cfg) {
          // a reação (o joinha numa mensagem) e o que a Meta não sabe mostrar não pedem resposta
          if (m.type === "reaction" || m.type === "unsupported" || m.type === "system") continue;
          const nome = mudanca.value.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
          const recebida = {
            wamid: m.id,
            numero: m.from,
            // áudio, foto, figurinha e arquivo chegam sem texto: o atendimento responde pelo tipo (`midiaDaMensagem`)
            texto: texto ?? (m.type && m.type !== "text" ? `[a pessoa mandou ${MIDIA_RECEBIDA[m.type] ?? "uma mensagem que não é texto"}]` : ""),
            payload,
            nome,
            origem: origemDoAnuncio(m.referral),
          };
          depois.push(() => atenderConversa(cfg, banco, chave, recebida));
          continue;
        }
        const volta = (data as { texto?: string } | null)?.texto;
        if (volta && cfg) {
          const r = await enviarTexto(cfg, m.from, volta);
          if (!r.ok) console.error("Publike: a resposta pelo WhatsApp não saiu:", r.erro);
        }
      }
    }
  }
  return { tratados, depois };
}
