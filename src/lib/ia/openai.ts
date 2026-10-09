import "server-only";
import { chaveIA, enderecoIA } from "@/lib/servidor/ambiente";

// Conversa com a API da OpenAI (Responses API). A chave fica só no servidor.

/**
 * Modelos que o admin pode escolher. O Luna é o mais barato e dá conta do
 * recado. "esforco" é o quanto o modelo raciocina antes de responder: o Luna
 * responde direto; o Sol não aceita "none", e o mínimo dele é "low".
 */
export const MODELOS_IA = [
  { id: "gpt-6-luna", nome: "GPT-6 Luna", ajuda: "Rápido e o mais barato. Recomendado.", esforco: "none" },
  { id: "gpt-6.1-sol", nome: "GPT-6.1 Sol", ajuda: "Escreve melhor, custa de 20 a 40 vezes mais.", esforco: "low" },
] as const;

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
  ) {
    super(mensagem);
    this.name = "ErroIA";
  }
}

export function iaConfigurada() {
  return Boolean(chaveIA());
}

type Pedido = {
  modelo: string;
  sistema: string;
  mensagem: string;
  maxTokens: number;
  /** Fotos para a IA olhar junto com o texto (endereços públicos). */
  imagens?: string[];
  /** Saída estruturada: nome e esquema JSON da resposta. Sem esquema, a resposta é texto livre. */
  esquema?: { nome: string; schema: Record<string, unknown> };
};

/** Por que a resposta parou antes: a IA se recusou ou acabou o espaço. */
export type ParadaIA = "recusa" | "limite" | null;

type ParteSaida = { type: string; text?: string };
type ItemSaida = { type: string; content?: ParteSaida[] };
type RespostaOpenAI = {
  status?: string;
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
  return `A IA não respondeu (código ${status}).`;
}

export async function chamarIA(p: Pedido): Promise<{ texto: string; parada: ParadaIA; modelo: string }> {
  const chave = chaveIA();
  if (!chave) throw new ErroIA("Falta a chave da IA no servidor (OPENAI_API_KEY).");
  const modelo = modeloDaIA(p.modelo);
  // Com raciocínio ligado, o "pensar" também conta como saída: sobra espaço para a resposta.
  const maxTokens = modelo.esforco === "none" ? p.maxTokens : p.maxTokens + 4000;

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
        input: p.imagens?.length
          ? [
              {
                role: "user",
                content: [
                  { type: "input_text", text: p.mensagem },
                  // "low" basta para ver telefone, rosto ou conteúdo impróprio, e custa bem menos
                  ...p.imagens.map((url) => ({ type: "input_image", image_url: url, detail: "low" })),
                ],
              },
            ]
          : p.mensagem,
        max_output_tokens: maxTokens,
        reasoning: { effort: modelo.esforco },
        // o texto dos anúncios não fica guardado na conta da OpenAI
        store: false,
        ...(p.esquema
          ? { text: { format: { type: "json_schema", name: p.esquema.nome, schema: p.esquema.schema, strict: true } } }
          : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ErroIA(tempo ? "A IA demorou demais para responder." : "Não foi possível falar com a IA agora.");
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new ErroIA(explicarErro(resposta.status, corpo), resposta.status);
  }

  const json = (await resposta.json()) as RespostaOpenAI;
  if (json.status === "failed" || json.status === "cancelled") {
    throw new ErroIA("A IA não conseguiu responder agora.");
  }

  let texto = "";
  let recusou = false;
  for (const item of json.output ?? []) {
    if (item.type !== "message") continue;
    for (const parte of item.content ?? []) {
      if (parte.type === "output_text" && typeof parte.text === "string") texto += parte.text;
      else if (parte.type === "refusal") recusou = true;
    }
  }
  if (!texto && typeof json.output_text === "string") texto = json.output_text;

  let parada: ParadaIA = null;
  if (recusou) parada = "recusa";
  else if (json.status === "incomplete") {
    // sem espaço para terminar, ou cortada pelo filtro de conteúdo da OpenAI
    parada = json.incomplete_details?.reason === "max_output_tokens" ? "limite" : "recusa";
  }
  return { texto: texto.trim(), parada, modelo: modelo.id };
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
