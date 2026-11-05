import "server-only";
import { chaveClaude, chaveIA, enderecoIA } from "@/lib/servidor/ambiente";
import { criarClientePublico } from "@/lib/supabase/servidor";
import type { FuncionalidadeIA } from "@/lib/ia-nomes";
import { contarUsoDaIA } from "@/lib/servidor/uso-da-ia";
import { chamarClaude, ErroClaude, motivoDaApi } from "./claude";

// Conversa com a IA: a da OpenAI (Responses API) ou o Claude (./claude.ts), conforme o modelo escolhido no
// admin. As chaves ficam só no servidor. Com a reserva ligada (Admin › IA), quando a escolhida não tem chave,
// fica sem créditos ou sai do ar, o pedido vai uma vez para o par dela na outra IA (Luna ↔ Haiku, Sol ↔ Sonnet).

/**
 * Modelos que o admin pode escolher. O Luna e o Haiku são os mais baratos e dão conta do recado (mesmo preço).
 * "esforco" é o quanto o modelo raciocina antes de responder: o Luna e o Haiku respondem direto; o Sol não
 * aceita "none" (o mínimo é "low"), e o Sonnet só raciocina entre uma busca e outra.
 */
export const MODELOS_IA = [
  {
    id: "gpt-6-luna",
    /** dólares por milhão de tokens (entrada / saída), em outubro de 2026 */
    preco: { entrada: 0.1, saida: 0.5 },
    nome: "GPT-6 Luna",
    ajuda: "Rápido e o mais barato. Recomendado.",
    esforco: "none",
    provedor: "openai",
    par: "claude-haiku-5-5",
  },
  {
    id: "gpt-6.1-sol",
    /** dólares por milhão de tokens (entrada / saída), em outubro de 2026 */
    preco: { entrada: 2, saida: 10 },
    nome: "GPT-6.1 Sol",
    ajuda: "Escreve melhor, custa de 20 a 40 vezes mais.",
    esforco: "low",
    provedor: "openai",
    par: "claude-sonnet-5-5",
  },
  {
    id: "claude-haiku-5-5",
    /** dólares por milhão de tokens (entrada / saída), em outubro de 2026 */
    preco: { entrada: 0.1, saida: 0.5 },
    nome: "Claude Haiku 5.5",
    ajuda: "Rápido, o mesmo preço do Luna. Gasta os créditos do Claude.",
    esforco: "none",
    provedor: "claude",
    par: "gpt-6-luna",
  },
  {
    id: "claude-sonnet-5-5",
    /** dólares por milhão de tokens (entrada / saída), em outubro de 2026 */
    preco: { entrada: 2, saida: 10 },
    nome: "Claude Sonnet 5.5",
    ajuda: "Escreve melhor, o mesmo preço do Sol. Gasta os créditos do Claude.",
    esforco: "low",
    provedor: "claude",
    par: "gpt-6.1-sol",
  },
] as const;

/** Cada busca na internet, em dólar (US$ 10 a cada mil, na OpenAI e no Claude, em outubro de 2026). */
export const PRECO_BUSCA = 0.01;

export type ProvedorIA = (typeof MODELOS_IA)[number]["provedor"];

/** Tem a chave desta IA no servidor? */
export function temChave(provedor: ProvedorIA) {
  return Boolean(provedor === "claude" ? chaveClaude() : chaveIA());
}

const FALTA_CHAVE: Record<ProvedorIA, string> = {
  openai: "Falta a chave da OpenAI no servidor (OPENAI_API_KEY).",
  claude: "Falta a chave do Claude no servidor (ANTHROPIC_API_KEY).",
};

export type ModeloIA = (typeof MODELOS_IA)[number];

export const MODELO_PADRAO: string = MODELOS_IA[0].id;

/** O banco pode guardar um modelo antigo (de outra IA): o que não está na lista vira o padrão. */
export function modeloDaIA(id: string | null | undefined): ModeloIA {
  return MODELOS_IA.find((m) => m.id === id) ?? MODELOS_IA[0];
}

export class ErroIA extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
    /** vale tentar com a outra IA (sem chave, sem créditos, fora do ar) */
    readonly reserva = false,
  ) {
    super(mensagem);
    this.name = "ErroIA";
  }
}

/** Alguma IA tem chave neste servidor (a escolhida, ou a outra pela reserva). */
export function iaConfigurada() {
  return Boolean(chaveIA() || chaveClaude());
}

// a reserva (Admin › IA) vem do banco: lida no máximo a cada minuto por servidor
let reservaLida: { valor: boolean; em: number } | null = null;
async function usarReserva() {
  if (reservaLida && Date.now() - reservaLida.em < 60_000) return reservaLida.valor;
  let valor = true;
  try {
    const { data, error } = await criarClientePublico().rpc("ia_reserva");
    if (!error && typeof data === "boolean") valor = data;
  } catch {
    // sem banco (demonstração): a reserva fica ligada
  }
  reservaLida = { valor, em: Date.now() };
  return valor;
}

type Pedido = {
  modelo: string;
  /** de qual funcionalidade é a chamada (Admin › IA conta as chamadas e o custo de cada uma) */
  funcionalidade: FuncionalidadeIA;
  sistema: string;
  mensagem: string;
  maxTokens: number;
  /** Fotos para a IA olhar junto com o texto (endereços públicos ou data: URL). */
  imagens?: string[];
  /** "high" para ler letra miúda (telefone num cartaz); o padrão "low" sai bem mais barato */
  detalhe?: "low" | "high";
  /** PDFs para a IA ler junto com o texto (data: URL em base64), como o currículo de quem procura trabalho. */
  arquivos?: { nome: string; dados: string }[];
  /** Saída estruturada: nome e esquema JSON da resposta. Sem esquema, a resposta é texto livre. */
  esquema?: { nome: string; schema: Record<string, unknown> };
  /** Deixa a IA pesquisar na internet, a partir deste lugar (as notícias). */
  /** maxBuscas: só a Claude usa (a OpenAI decide sozinha quantas buscas faz) */
  buscaNaWeb?: { cidade: string; regiao: string; maxBuscas?: number };
  /** Em milissegundos (padrão 45 s; a busca na internet demora mais). */
  tempoLimite?: number;
};

/** Por que a resposta parou antes: a IA se recusou ou acabou o espaço. */
export type ParadaIA = "recusa" | "limite" | null;

type ParteSaida = { type: string; text?: string; annotations?: { type: string; url?: string }[] };
type ItemSaida = {
  type: string;
  content?: ParteSaida[];
  /** web_search_call: as páginas que a busca abriu */
  action?: { sources?: { type?: string; url?: string }[] };
};
type RespostaOpenAI = {
  status?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  incomplete_details?: { reason?: string } | null;
  output?: ItemSaida[];
  output_text?: string;
};

function explicarErro(status: number, corpo: string) {
  const texto = corpo.toLowerCase();
  if (status === 401) return "A chave da IA não foi aceita. Confira OPENAI_API_KEY no servidor.";
  if (status === 403) return "A chave da IA não tem permissão para usar este modelo.";
  if (status === 404 || texto.includes("model_not_found")) return "Modelo de IA não encontrado. Escolha outro no admin.";
  if (status === 429 && (texto.includes("insufficient_quota") || texto.includes("billing"))) {
    return "A conta da OpenAI está sem créditos.";
  }
  if (status === 429) return "A IA recebeu pedidos demais. Tente de novo em instantes.";
  if (status >= 500) return "A IA está fora do ar agora. Tente de novo em instantes.";
  const motivo = motivoDaApi(corpo);
  return `A IA recusou o pedido (código ${status}${motivo ? `: ${motivo}` : ""}).`;
}

/** buscas: quantas buscas na internet a IA fez (para explicar uma busca que voltou vazia) */
type RespostaIA = {
  texto: string;
  parada: ParadaIA;
  modelo: string;
  fontes: string[];
  buscas?: number;
  /** os tokens que a chamada gastou (para o custo no Admin › IA) */
  tokens?: { entrada: number; saida: number };
};

/**
 * Manda o pedido para a IA do modelo escolhido; com a reserva ligada, o par na outra IA cobre a falha. Cada chamada
 * conta no uso da funcionalidade (só os números: o modelo que respondeu e os tokens).
 */
export async function chamarIA(p: Pedido): Promise<RespostaIA> {
  try {
    const r = await chamarComReserva(p);
    await contarUsoDaIA(p.funcionalidade, r.modelo, r.tokens ?? null, false, r.buscas ?? 0);
    return r;
  } catch (e) {
    await contarUsoDaIA(p.funcionalidade, modeloDaIA(p.modelo).id, null, true);
    throw e;
  }
}

async function chamarComReserva(p: Pedido): Promise<RespostaIA> {
  const escolhido = modeloDaIA(p.modelo);
  const par = MODELOS_IA.find((m) => m.id === escolhido.par);
  const comReserva = async () => Boolean(par && temChave(par.provedor) && (await usarReserva()));
  if (!temChave(escolhido.provedor)) {
    if (par && (await comReserva())) return chamarCom(par, p);
    throw new ErroIA(FALTA_CHAVE[escolhido.provedor]);
  }
  try {
    return await chamarCom(escolhido, p);
  } catch (e) {
    if (e instanceof ErroIA && e.reserva && par && (await comReserva())) {
      console.warn(`Publike: ${escolhido.nome} falhou (${e.message}); usando ${par.nome}.`);
      try {
        return await chamarCom(par, p);
      } catch (e2) {
        // as duas falharam: a mensagem conta as duas, senão só aparece o erro da reserva
        if (e2 instanceof ErroIA)
          throw new ErroIA(`${escolhido.nome}: ${e.message} ${par.nome}: ${e2.message}`, e2.status);
        throw e2;
      }
    }
    throw e;
  }
}

async function chamarCom(modelo: ModeloIA, p: Pedido): Promise<RespostaIA> {
  if (modelo.provedor === "openai") return chamarOpenAI(modelo, p);
  try {
    return await chamarClaude({ ...p, modelo: modelo.id, raciocinio: modelo.esforco === "none" ? "sem" : "pouco" });
  } catch (e) {
    if (e instanceof ErroClaude) throw new ErroIA(e.message, e.status, e.reserva);
    throw e;
  }
}

async function chamarOpenAI(modelo: ModeloIA, p: Pedido): Promise<RespostaIA> {
  const chave = chaveIA();
  if (!chave) throw new ErroIA(FALTA_CHAVE.openai, undefined, true);
  // a busca na internet não funciona sem raciocínio: no mínimo "low"
  const esforco = p.buscaNaWeb && modelo.esforco === "none" ? "low" : modelo.esforco;
  // Com raciocínio ligado, o "pensar" também conta como saída: sobra espaço para a resposta.
  const maxTokens = esforco === "none" ? p.maxTokens : p.maxTokens + 4000;

  let resposta: Response;
  try {
    resposta = await fetch(`${enderecoIA()}/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${chave}`,
      },
      body: JSON.stringify({
        model: modelo.id,
        instructions: p.sistema,
        input:
          p.imagens?.length || p.arquivos?.length
            ? [
                {
                  role: "user",
                  content: [
                    { type: "input_text", text: p.mensagem },
                    ...(p.arquivos ?? []).map((a) => ({ type: "input_file", filename: a.nome, file_data: a.dados })),
                    // "low" basta para ver telefone, rosto ou conteúdo impróprio, e custa bem menos
                    ...(p.imagens ?? []).map((url) => ({
                      type: "input_image",
                      image_url: url,
                      detail: p.detalhe ?? "low",
                    })),
                  ],
                },
              ]
            : p.mensagem,
        max_output_tokens: maxTokens,
        reasoning: { effort: esforco },
        // o texto dos anúncios não fica guardado na conta da OpenAI
        store: false,
        ...(p.buscaNaWeb
          ? {
              tools: [
                {
                  type: "web_search",
                  user_location: {
                    type: "approximate",
                    country: "BR",
                    city: p.buscaNaWeb.cidade,
                    region: p.buscaNaWeb.regiao,
                  },
                },
              ],
              // a lista das páginas que a busca abriu: só vale fonte que veio daqui
              include: ["web_search_call.action.sources"],
            }
          : {}),
        ...(p.esquema
          ? { text: { format: { type: "json_schema", name: p.esquema.nome, schema: p.esquema.schema, strict: true } } }
          : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(p.tempoLimite ?? 45_000),
    });
  } catch (e) {
    const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ErroIA(
      tempo ? "A IA demorou demais para responder." : "Não foi possível falar com a IA agora.",
      undefined,
      true,
    );
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    console.error(`Publike: a OpenAI respondeu ${resposta.status}:`, motivoDaApi(corpo) || corpo.slice(0, 300));
    // chave recusada, sem créditos, pedidos demais ou fora do ar: a outra IA pode cobrir
    const reserva = [401, 403, 404, 429].includes(resposta.status) || resposta.status >= 500;
    throw new ErroIA(explicarErro(resposta.status, corpo), resposta.status, reserva);
  }

  const json = (await resposta.json()) as RespostaOpenAI;
  if (json.status === "failed" || json.status === "cancelled") {
    throw new ErroIA("A IA não conseguiu responder agora.");
  }

  let texto = "";
  let recusou = false;
  const fontes = new Set<string>();
  let buscas = 0;
  for (const item of json.output ?? []) {
    if (item.type === "web_search_call") {
      buscas++;
      for (const f of item.action?.sources ?? []) if (f.url) fontes.add(f.url);
      continue;
    }
    if (item.type !== "message") continue;
    for (const parte of item.content ?? []) {
      if (parte.type === "output_text" && typeof parte.text === "string") {
        texto += parte.text;
        for (const a of parte.annotations ?? []) if (a.type === "url_citation" && a.url) fontes.add(a.url);
      } else if (parte.type === "refusal") recusou = true;
    }
  }
  if (!texto && typeof json.output_text === "string") texto = json.output_text;

  let parada: ParadaIA = null;
  if (recusou) parada = "recusa";
  else if (json.status === "incomplete") {
    // sem espaço para terminar, ou cortada pelo filtro de conteúdo da OpenAI
    parada = json.incomplete_details?.reason === "max_output_tokens" ? "limite" : "recusa";
  }
  return {
    texto: texto.trim(),
    parada,
    modelo: modelo.id,
    fontes: [...fontes],
    buscas,
    tokens: { entrada: json.usage?.input_tokens ?? 0, saida: json.usage?.output_tokens ?? 0 },
  };
}

/** Lê a resposta em JSON (saída estruturada). */
export function lerJson<T>(texto: string): T {
  try {
    return JSON.parse(texto) as T;
  } catch {
    // às vezes vem cercado de texto; pega o primeiro objeto
    const inicio = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (inicio >= 0 && fim > inicio) return JSON.parse(texto.slice(inicio, fim + 1)) as T;
    throw new ErroIA("A IA respondeu num formato inesperado.");
  }
}
