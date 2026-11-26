import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "@/lib/config";
import { destinoDoAviso } from "@/lib/destino-aviso";
import { comOrigem } from "@/lib/origem";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { fraseDaEntrevista } from "@/lib/whatsapp";
import { atenderConversa } from "./atendimento-whatsapp";
import { urlDosEmails } from "./ambiente";
import { linkDoAvisoComEntrar } from "./entrar-pelo-whatsapp";
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
    enderecoWebhook: `${urlDosEmails() ?? SITE_URL}/api/whatsapp/webhook`,
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
  /**
   * O modelo que sai no lugar deste enquanto a Meta não aprova (ou se ela o puser em marketing): os aceites juntos
   * saem pelo de um aceite, com o primeiro (18/11/2026).
   */
  reserva?: string;
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
    // 18/11/2026: 7 aceites em 7 minutos para a mesma pessoa viravam 7 mensagens; os que chegam nos minutos de juntar
    // (Admin › WhatsApp › Parâmetros) vão juntos (migração 20270804120000)
    nome: "publike_matches",
    aviso: "match",
    para: "Candidato",
    quando: "Mais de um aceite nos mesmos minutos (juntos numa mensagem)",
    corpo:
      "Oi, {{nome}}! Você teve {{quantos}} aceitas no Publike, entre elas a da vaga de {{vaga}} em {{empresa}}. Os contatos de vocês já estão liberados: abra o Publike para ver cada um e combinar os próximos passos.",
    exemplo: { nome: "Ana", quantos: "3 candidaturas", vaga: "Atendente de padaria", empresa: "Padaria Pão de Ouro" },
    botoes: [{ tipo: "link", texto: "Ver os contatos", exemplo: "painel/matches" }],
    reserva: "publike_match",
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
  {
    // a vaga ainda está aberta? (migração 20271003120000): a resposta em um toque, sem entrar no site (os botões
    // "v:<id>:sim" e "v:<id>:preenchi" voltam para servidor_whatsapp_recebida)
    nome: "publike_vaga_continua",
    aviso: "vaga_continua",
    para: "Quem contrata",
    quando: "Vaga no ar há 14 dias ou mais com 10 curtidas ou mais, ou quando alguém pergunta (no máximo 1 a cada 7 dias)",
    corpo:
      "Oi, {{nome}}! A sua vaga de {{vaga}} no Publike ainda está aberta? Quem procura trabalho quer saber antes de se candidatar. Toque numa opção para responder.",
    exemplo: { nome: "Padaria Pão de Ouro", vaga: "Atendente de padaria" },
    botoes: [
      { tipo: "resposta", texto: "Sim, continua", valor: "sim" },
      { tipo: "resposta", texto: "Já preenchi", valor: "preenchi" },
    ],
  },
];

const POR_NOME = new Map(MODELOS.map((m) => [m.nome, m]));

/**
 * O código de entrar fora da janela de 24 horas (23/11/2026; Marcelo: "acho necessário"): o modelo de autenticação da
 * Meta, que sai a qualquer hora, com o botão "Copiar código". O texto é o da Meta ("*123456* é seu código de
 * verificação. Para sua segurança, não o compartilhe."), sem variável nossa. Cadastrado pelo `conferirModelos`, como
 * os outros; sai só para conta que já existe (src/lib/servidor/codigo-whatsapp.ts).
 */
export const MODELO_DO_CODIGO = "publike_codigo_de_acesso";
export const VALIDADE_DO_CODIGO_MINUTOS = 10;

export function cadastroDoModeloDoCodigo() {
  return {
    name: MODELO_DO_CODIGO,
    language: "pt_BR",
    category: "AUTHENTICATION",
    message_send_ttl_seconds: VALIDADE_DO_CODIGO_MINUTOS * 60,
    components: [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: VALIDADE_DO_CODIGO_MINUTOS },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copiar código" }] },
    ],
  };
}

/** O modelo do código pode sair: aprovado e na categoria de autenticação. */
export function codigoPeloModeloPode(modelos: SituacaoModelos) {
  const st = modelos[MODELO_DO_CODIGO];
  return st?.status === "APPROVED" && (!st.categoria || st.categoria === "AUTHENTICATION");
}

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

/**
 * O computador sem endereço público não manda nada pela Meta de verdade (20/11/2026: 7 mensagens do "Procurar de novo"
 * saíram do Admin do computador do Marcelo, ligado ao banco e ao WhatsApp do site, com os links em localhost:3000, que
 * não abrem no celular de ninguém). Ler (GET) pode; mandar, cadastrar ou ligar (POST), não. Com a Meta falsa dos
 * testes (WHATSAPP_GRAPH_URL), pode. No computador, PUBLIKE_URL_PUBLICA=https://publike.org libera, e os links saem
 * com ele.
 */
export function bloqueioDaMeta(cfg: ConfigMeta): string | null {
  if (!cfg.base.startsWith("https://graph.facebook.com/") || urlDosEmails()) return null;
  return `Daqui não sai pelo WhatsApp de verdade: o site aqui é ${SITE_URL}, e os links chegariam quebrados para quem recebe. Mande pelo Admin no ar (publike.org).`;
}

async function graph<T>(
  cfg: ConfigMeta,
  caminho: string,
  init?: { metodo?: "GET" | "POST"; corpo?: unknown },
): Promise<RespostaMeta<T>> {
  const bloqueio = init?.metodo === "POST" ? bloqueioDaMeta(cfg) : null;
  if (bloqueio) return { ok: false, status: 0, erro: null, texto: bloqueio };
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

/** O código pelo modelo de autenticação (o código vai no corpo e no botão de copiar). */
export async function enviarCodigoPeloModelo(cfg: ConfigMeta, numero: string, codigo: string): Promise<Envio> {
  const r = await graph<{ messages?: { id: string }[] }>(cfg, `${cfg.phoneId}/messages`, {
    metodo: "POST",
    corpo: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: numero.replace(/\D/g, ""),
      type: "template",
      template: {
        name: MODELO_DO_CODIGO,
        language: { code: "pt_BR" },
        components: [
          { type: "body", parameters: [{ type: "text", text: codigo }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: codigo }] },
        ],
      },
    },
  });
  if (r.ok) {
    const wamid = r.dados.messages?.[0]?.id;
    return wamid ? { ok: true, wamid } : { ok: false, erro: "a Meta não devolveu o id da mensagem", passageiro: false, configuracao: false };
  }
  return { ok: false, erro: r.texto.slice(0, 300), passageiro: passageiro(r), configuracao: deConfiguracao(r) };
}

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
 * Uma imagem ou um documento pelo link (só na janela de 24 horas): a Meta busca o arquivo no endereço (público) e manda.
 * O currículo pelo WhatsApp usa para o cartão em imagem e o PDF.
 */
export async function enviarArquivo(
  cfg: ConfigMeta,
  numero: string,
  arquivo: { tipo: "image" | "document"; url: string; legenda: string; nome?: string },
) {
  const midia =
    arquivo.tipo === "image"
      ? { link: arquivo.url, caption: arquivo.legenda.slice(0, 1024) }
      : { link: arquivo.url, caption: arquivo.legenda.slice(0, 1024), filename: (arquivo.nome ?? "curriculo.pdf").slice(0, 120) };
  const r = await graph<{ messages?: { id: string }[] }>(cfg, `${cfg.phoneId}/messages`, {
    metodo: "POST",
    corpo: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: numero.replace(/\D/g, ""),
      type: arquivo.tipo,
      [arquivo.tipo]: midia,
    },
  });
  return r.ok ? { ok: true as const, wamid: r.dados.messages?.[0]?.id ?? null } : { ok: false as const, erro: r.texto };
}

/**
 * Baixa um arquivo que a pessoa mandou (o áudio do atendimento): a Meta dá o endereço pelo id, e o arquivo sai com o
 * mesmo token. Maior que `maxBytes` (ou sem resposta em 15 s), devolve null.
 */
export async function baixarMidia(cfg: ConfigMeta, id: string, maxBytes = 4_000_000) {
  const r = await graph<{ url?: string; mime_type?: string; file_size?: number }>(cfg, encodeURIComponent(id));
  if (!r.ok || !r.dados.url) {
    if (!r.ok) console.error("Publike: a Meta não deu o arquivo:", r.texto);
    return null;
  }
  if ((r.dados.file_size ?? 0) > maxBytes) return null;
  try {
    const arquivo = await fetch(r.dados.url, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!arquivo.ok) {
      console.error("Publike: o arquivo da Meta não veio:", arquivo.status);
      return null;
    }
    const dados = await arquivo.blob();
    if (dados.size > maxBytes) return null;
    return { dados, tipo: r.dados.mime_type ?? (dados.type || "application/octet-stream") };
  } catch (e) {
    console.error("Publike: o arquivo da Meta não veio:", e instanceof Error ? e.message : e);
    return null;
  }
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

/**
 * O conjunto de dados da conta do WhatsApp Business, para a API de Conversões (migração 20270825120000): pede o que já
 * existe e, se não tem, cria. Devolve o ID.
 */
export async function datasetDaConta(cfg: ConfigMeta) {
  if (!cfg.wabaId) return { ok: false as const, erro: "Falta o WHATSAPP_WABA_ID na Vercel." };
  type Dataset = { id?: string; dataset_id?: string; data?: { id?: string; dataset_id?: string }[] };
  const idDe = (d: Dataset) => {
    const id = d.id ?? d.dataset_id ?? d.data?.[0]?.id ?? d.data?.[0]?.dataset_id;
    return typeof id === "string" && /^\d{5,30}$/.test(id) ? id : null;
  };
  const existe = await graph<Dataset>(cfg, `${cfg.wabaId}/dataset`);
  if (existe.ok && idDe(existe.dados)) return { ok: true as const, id: idDe(existe.dados)!, criado: false };
  const novo = await graph<Dataset>(cfg, `${cfg.wabaId}/dataset`, { metodo: "POST", corpo: {} });
  if (!novo.ok) return { ok: false as const, erro: novo.texto };
  const id = idDe(novo.dados);
  return id ? { ok: true as const, id, criado: true } : { ok: false as const, erro: "a Meta não devolveu o ID" };
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

/** O modelo pode sair agora: aprovado pela Meta e na categoria que ele declara. */
export function podeSair(modelos: SituacaoModelos, nome: string) {
  const def = POR_NOME.get(nome);
  const st = modelos[nome];
  return !!def && st?.status === "APPROVED" && !categoriaBloqueia(def, st.categoria);
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
  // o modelo do código de entrar (autenticação), do mesmo jeito
  {
    const t = naMeta.get(MODELO_DO_CODIGO);
    const tentado = antes[MODELO_DO_CODIGO]?.tentado_em ? Date.parse(antes[MODELO_DO_CODIGO].tentado_em!) : 0;
    if (t)
      novos[MODELO_DO_CODIGO] = {
        status: t.status,
        categoria: t.category,
        motivo: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : undefined,
      };
    else if (!forcar && agora - tentado < 6 * 3600_000) novos[MODELO_DO_CODIGO] = antes[MODELO_DO_CODIGO] ?? { status: "FALTA" };
    else {
      const criado = await graph<{ id?: string; status?: string; category?: string }>(cfg, `${cfg.wabaId}/message_templates`, {
        metodo: "POST",
        corpo: cadastroDoModeloDoCodigo(),
      });
      novos[MODELO_DO_CODIGO] = criado.ok
        ? { status: criado.dados.status ?? "PENDING", categoria: criado.dados.category, tentado_em: new Date().toISOString() }
        : { status: "ERRO", motivo: criado.texto.slice(0, 200), tentado_em: new Date().toISOString() };
    }
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

export type Escolha = { modelo: string; params: Record<string, string>; respostas?: string[] };
/** `reserva`: o que sai se o modelo ainda não puder sair (em análise na Meta ou posto em marketing). */
type Montada = (Escolha & { reserva?: Escolha }) | { pular: string };

/**
 * O que sai: o modelo escolhido ou, se ele ainda não pode sair e o de reserva pode, o de reserva (os aceites juntos
 * saem pelo de um aceite enquanto a Meta não aprova o publike_matches).
 */
export function escolherModelo(montada: Escolha & { reserva?: Escolha }, modelos: SituacaoModelos): Escolha {
  return montada.reserva && !podeSair(modelos, montada.modelo) && podeSair(modelos, montada.reserva.modelo)
    ? montada.reserva
    : montada;
}

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
      // os aceites que chegaram juntos (a vaga e a empresa são as do primeiro): uma mensagem só
      if (item.quantos > 1)
        return {
          modelo: "publike_matches",
          params: { nome, quantos: `${item.quantos} candidaturas`, vaga, empresa },
          reserva: { modelo: "publike_match", params: { nome, empresa, vaga } },
        };
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
    case "vaga_continua":
      // a vaga ainda está aberta? (migração 20271003120000): os botões respondem aqui mesmo
      if (!vaga) return { pular: "a vaga não existe mais" };
      return {
        modelo: "publike_vaga_continua",
        params: { nome, vaga },
        respostas: ["sim", "preenchi"].map((r) => `v:${item.id}:${r}`),
      };
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
  const c = (conf ?? {}) as {
    ativo?: boolean;
    modelos?: SituacaoModelos;
    conferidos_em?: string | null;
    para_todos?: boolean;
    descartados_hora?: number;
  };
  if (!c.ativo) return resultado;
  // só para os números de teste, descartando avisos de verdade: o /api/filas acusa, e o alarme da fila avisa por
  // e-mail (migração 20270916170000; 23/11/2026: 169 avisos descartados em um dia, sem ninguém ver)
  if (c.para_todos === false && Number(c.descartados_hora) > 0)
    resultado.motivo = `WhatsApp em modo de teste: ${c.descartados_hora} aviso(s) descartado(s) na última hora. Ligue "Todos que aceitaram" em Admin › WhatsApp › Parâmetros.`;
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
    const montada = montarMensagem(item);
    if ("pular" in montada) {
      resultado.puladas++;
      await marcar(item.id, "descartada", { motivo: montada.pular });
      continue;
    }
    const m = escolherModelo(montada, modelos);
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
    const fim = temLink ? linkDoBotao(item) : undefined;
    // a conta cujo login é este número: o botão já entra, com um toque (migração 20271002120000; a Super Box publicou
    // pelo WhatsApp e o "Ver a candidatura" caía no entrar do site)
    const link = fim ? ((await linkDoAvisoComEntrar({ cliente, chave }, item, fim)) ?? fim) : undefined;
    const envio = await enviarModelo(cfg, item.numero, def, m.params, { link, respostas: m.respostas });
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
  /** o áudio (a mensagem de voz): o atendimento baixa e transcreve (`baixarMidia`) */
  audio?: { id?: string; mime_type?: string };
  /** a localização que a pessoa mandou: o atendimento mostra as vagas perto dela */
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  /** a foto e o arquivo: o id para baixar na Meta (vale 30 dias) e a legenda (Publicar pelo WhatsApp) */
  image?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
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

/** A foto ou o PDF da mensagem (a imagem mandada como arquivo também vale como foto). */
function midiaRecebida(m: MensagemRecebida) {
  if (m.type === "image" && m.image?.id)
    return { tipo: "imagem" as const, id: m.image.id, mime: m.image.mime_type ?? null, legenda: m.image.caption ?? null };
  if (m.type === "document" && m.document?.id) {
    const mime = (m.document.mime_type ?? "").toLowerCase();
    if (mime === "application/pdf")
      return { tipo: "pdf" as const, id: m.document.id, mime, legenda: m.document.caption ?? null };
    if (/^image\/(jpeg|png|webp)$/.test(mime))
      return { tipo: "imagem" as const, id: m.document.id, mime, legenda: m.document.caption ?? null };
  }
  return null;
}

/**
 * Baixa a foto ou o PDF que a pessoa mandou (Publicar pelo WhatsApp): a Meta dá o endereço pelo id (vale 5 minutos) e
 * o arquivo sai com o mesmo token. Até `max` bytes; o resto, null.
 */
export async function baixarFotoOuPdf(cfg: ConfigMeta, id: string, max = 8 * 1024 * 1024) {
  const info = await graph<{ url?: string; mime_type?: string; file_size?: number }>(cfg, encodeURIComponent(id));
  if (!info.ok || !info.dados.url) return { ok: false as const, erro: info.ok ? "sem endereço" : info.texto };
  if (info.dados.file_size && info.dados.file_size > max)
    return { ok: false as const, erro: "grande", grande: true, tamanho: info.dados.file_size };
  try {
    const r = await fetch(info.dados.url, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!r.ok) return { ok: false as const, erro: `HTTP ${r.status}` };
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > max) return { ok: false as const, erro: "grande", grande: true, tamanho: bytes.length };
    const mime = (info.dados.mime_type || r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    return { ok: true as const, bytes, mime };
  } catch (e) {
    return { ok: false as const, erro: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * O anúncio de onde a pessoa veio, só o que serve (sem a imagem). O id do clique (`ctwa_clid`) volta para a Meta
 * quando a conversa vira vaga publicada (migração 20270824120000, src/lib/servidor/meta-conversoes.ts).
 */
function origemDoAnuncio(r: Record<string, unknown> | undefined) {
  if (!r) return null;
  const texto = (k: string, max: number) => (typeof r[k] === "string" ? String(r[k]).slice(0, max) : null);
  const clique = texto("ctwa_clid", 300);
  const o = {
    tipo: texto("source_type", 20),
    link: texto("source_url", 300),
    titulo: texto("headline", 200),
    texto: texto("body", 500),
    ...(clique && clique.length >= 8 ? { clique } : {}),
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
          // a foto e o PDF ficam guardados (só o id da Meta): o Publicar pelo WhatsApp lê as fotos seguidas juntas
          const midia = midiaRecebida(m);
          if (midia) {
            const { error: erroMidia } = await banco.rpc("servidor_whatsapp_midia", {
              p_chave: chave,
              p_wamid: m.id,
              p_numero: m.from,
              p_tipo: midia.tipo,
              p_midia: midia.id,
              p_mime: midia.mime,
              p_legenda: midia.legenda,
            });
            // sem a migração 20270806120000: a foto segue como antes (o atendimento responde pelo tipo)
            if (erroMidia && erroMidia.code !== "PGRST202")
              console.error("Publike: a foto do WhatsApp não ficou guardada:", erroMidia.message);
          }
          const recebida = {
            wamid: m.id,
            numero: m.from,
            // áudio, foto, figurinha e arquivo chegam sem texto: o atendimento responde pelo tipo (`midiaDaMensagem`)
            texto: texto ?? (m.type && m.type !== "text" ? `[a pessoa mandou ${MIDIA_RECEBIDA[m.type] ?? "uma mensagem que não é texto"}]` : ""),
            payload,
            nome,
            origem: origemDoAnuncio(m.referral),
            audio: m.type === "audio" && m.audio?.id ? { id: m.audio.id, tipo: m.audio.mime_type ?? null } : null,
            local:
              m.type === "location" &&
              typeof m.location?.latitude === "number" &&
              typeof m.location?.longitude === "number"
                ? { lat: m.location.latitude, lng: m.location.longitude }
                : null,
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
