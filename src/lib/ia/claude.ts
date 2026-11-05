import "server-only";
import { chaveClaude, enderecoClaude, workspaceClaude } from "@/lib/servidor/ambiente";
import type { ParadaIA } from "./openai";

// Conversa com a API do Claude (Anthropic, Messages API). A chave fica só no servidor.
// Recebe o mesmo pedido da OpenAI (chamarIA em ./openai) e devolve a mesma resposta.
// Nos modelos usados aqui (Haiku e Sonnet), o texto não fica guardado na Anthropic por padrão.

export type PedidoClaude = {
  modelo: string;
  /** "sem": responde direto (Haiku); "pouco": o mínimo de raciocínio (Sonnet) */
  raciocinio: "sem" | "pouco";
  sistema: string;
  mensagem: string;
  maxTokens: number;
  imagens?: string[];
  arquivos?: { nome: string; dados: string }[];
  esquema?: { nome: string; schema: Record<string, unknown> };
  /** maxBuscas: quantas buscas a IA pode fazer (padrão 5) */
  buscaNaWeb?: { cidade: string; regiao: string; maxBuscas?: number };
  tempoLimite?: number;
};

export class ErroClaude extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
    /** vale tentar com a outra IA (sem créditos, fora do ar, chave recusada) */
    readonly reserva = false,
  ) {
    super(mensagem);
    this.name = "ErroClaude";
  }
}

// O Claude não aceita estas regras no esquema da resposta: saem (a resposta é conferida depois, como hoje).
const FORA_DO_ESQUEMA = new Set([
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
]);

export function esquemaParaClaude(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(esquemaParaClaude);
  if (!v || typeof v !== "object") return v;
  const saida: Record<string, unknown> = {};
  for (const [k, valor] of Object.entries(v)) {
    if (FORA_DO_ESQUEMA.has(k)) continue;
    // minItems só 0 ou 1
    if (k === "minItems" && typeof valor === "number" && valor > 1) {
      saida[k] = 1;
      continue;
    }
    saida[k] = esquemaParaClaude(valor);
  }
  return saida;
}

/** "data:image/png;base64,AAA" → tipo e dados; null se não for data: URL. */
function dataUrl(valor: string) {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(valor);
  return m ? { tipo: m[1], dados: m[2] } : null;
}

/** A explicação da própria API ("messages.0.content.0: ..."), curta: diz o que foi recusado. */
export function motivoDaApi(corpo: string) {
  try {
    const m = (JSON.parse(corpo) as { error?: { message?: unknown } }).error?.message;
    return typeof m === "string" ? m.replace(/\s+/g, " ").trim().slice(0, 240) : "";
  } catch {
    return "";
  }
}

function explicarErro(status: number, corpo: string) {
  const texto = corpo.toLowerCase();
  const motivo = motivoDaApi(corpo);
  if (texto.includes("credit balance") || status === 402)
    return { msg: "A conta do Claude está sem créditos (ou com problema no pagamento).", reserva: true };
  // limite de gastos definido no Console da Anthropic (Settings › Limits): a API responde 400
  if (texto.includes("usage limit"))
    return {
      msg: "A conta do Claude chegou ao limite de gastos definido no Console da Anthropic (Settings › Limits).",
      reserva: true,
    };
  if (texto.includes("anthropic-workspace-id"))
    return {
      msg: "A chave do Claude não é de um workspace. Crie a chave dentro de um workspace no Console da Anthropic, ou ponha ANTHROPIC_WORKSPACE_ID no servidor.",
      reserva: true,
    };
  if (status === 401)
    return { msg: "A chave do Claude não foi aceita. Confira ANTHROPIC_API_KEY no servidor.", reserva: true };
  if (status === 403) return { msg: "A chave do Claude não tem permissão para usar este modelo.", reserva: true };
  if (status === 404 || texto.includes("not_found"))
    return { msg: "Modelo do Claude não encontrado. Escolha outro no admin.", reserva: true };
  if (status === 429) return { msg: "O Claude recebeu pedidos demais. Tente de novo em instantes.", reserva: true };
  if (status === 529 || status >= 500)
    return { msg: "O Claude está fora do ar agora. Tente de novo em instantes.", reserva: true };
  return { msg: `O Claude recusou o pedido (código ${status}${motivo ? `: ${motivo}` : ""}).`, reserva: false };
}

type Bloco = {
  type: string;
  text?: string;
  citations?: { type?: string; url?: string }[];
  content?: { type?: string; url?: string }[] | { type?: string };
};
type RespostaClaude = {
  content?: Bloco[];
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export async function chamarClaude(
  p: PedidoClaude,
): Promise<{
  texto: string;
  parada: ParadaIA;
  modelo: string;
  fontes: string[];
  buscas: number;
  tokens: { entrada: number; saida: number };
}> {
  const chave = chaveClaude();
  if (!chave) throw new ErroClaude("Falta a chave do Claude no servidor (ANTHROPIC_API_KEY).", undefined, true);

  const conteudo: Record<string, unknown>[] = [];
  for (const a of p.arquivos ?? []) {
    const d = dataUrl(a.dados);
    if (!d || d.tipo !== "application/pdf") throw new ErroClaude("O Claude só lê arquivos em PDF.");
    conteudo.push({ type: "document", title: a.nome, source: { type: "base64", media_type: d.tipo, data: d.dados } });
  }
  for (const url of p.imagens ?? []) {
    const d = dataUrl(url);
    conteudo.push(
      d
        ? { type: "image", source: { type: "base64", media_type: d.tipo, data: d.dados } }
        : { type: "image", source: { type: "url", url } },
    );
  }
  conteudo.push({ type: "text", text: p.mensagem });

  // Com a busca na internet, o formato fixo (output_config) faz o Claude responder o JSON direto, sem buscar
  // (03/11/2026: "0 buscas" nas notícias). Aí o formato vai nas instruções e a resposta final é lida como JSON.
  const formatoNoTexto = Boolean(p.buscaNaWeb && p.esquema);
  const sistema = formatoNoTexto
    ? `${p.sistema}\n\nPrimeiro faça as buscas na internet (a ferramenta web_search), quantas precisar. No fim, responda só com um JSON válido, sem texto antes nem depois, neste formato (JSON Schema):\n${JSON.stringify(p.esquema!.schema)}`
    : p.sistema;
  const corpo: Record<string, unknown> = {
    model: p.modelo,
    system: sistema,
    max_tokens: p.buscaNaWeb ? p.maxTokens + 2000 : p.maxTokens,
    messages: [{ role: "user", content: conteudo }],
    // o Haiku responde direto; o Sonnet só raciocina entre uma busca e outra
    thinking: { type: p.raciocinio === "sem" ? "disabled" : "between_tools" },
    ...(p.esquema && !formatoNoTexto
      ? { output_config: { format: { type: "json_schema", schema: esquemaParaClaude(p.esquema.schema) } } }
      : {}),
    ...(p.buscaNaWeb
      ? {
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: Math.min(Math.max(p.buscaNaWeb.maxBuscas ?? 5, 1), 15),
              user_location: {
                type: "approximate",
                city: p.buscaNaWeb.cidade,
                region: p.buscaNaWeb.regiao,
                country: "BR",
                timezone: "America/Sao_Paulo",
              },
            },
          ],
        }
      : {}),
  };

  // com a busca na internet, o Claude pode pausar no meio ("pause_turn", muitas buscas seguidas): manda de novo
  // com o que ele já fez, até 3 vezes, para ele terminar a resposta
  const mensagens = corpo.messages as Record<string, unknown>[];
  const fontes = new Set<string>();
  let buscas = 0;
  // os tokens de todas as voltas (cada uma é cobrada)
  const tokens = { entrada: 0, saida: 0 };
  let json: RespostaClaude = {};
  for (let vez = 0; vez < 4; vez++) {
    json = await pedirAoClaude(corpo, chave, p.tempoLimite);
    tokens.entrada += json.usage?.input_tokens ?? 0;
    tokens.saida += json.usage?.output_tokens ?? 0;
    for (const b of json.content ?? []) {
      if (b.type === "server_tool_use") buscas++;
      if (b.type === "web_search_tool_result" && Array.isArray(b.content))
        for (const r of b.content) if (r.url) fontes.add(r.url);
    }
    if (json.stop_reason !== "pause_turn") break;
    mensagens.push({ role: "assistant", content: json.content ?? [] });
  }
  // o texto da resposta final (a de antes da pausa é só o caminho)
  // a resposta é o texto depois da última busca (o de antes é o caminho: "Vou procurar…")
  const blocos = json.content ?? [];
  let desde = 0;
  blocos.forEach((b, i) => {
    if (b.type === "web_search_tool_result") desde = i + 1;
  });
  let texto = "";
  for (const [i, b] of blocos.entries()) {
    if (b.type !== "text" || typeof b.text !== "string") continue;
    for (const c of b.citations ?? []) if (c.url) fontes.add(c.url);
    if (i >= desde) texto += b.text;
  }
  const parada: ParadaIA =
    json.stop_reason === "refusal"
      ? "recusa"
      : json.stop_reason === "max_tokens" || json.stop_reason === "pause_turn"
        ? "limite"
        : null;
  return { texto: texto.trim(), parada, modelo: p.modelo, fontes: [...fontes], buscas, tokens };
}

async function pedirAoClaude(
  corpo: Record<string, unknown>,
  chave: string,
  tempoLimite: number | undefined,
): Promise<RespostaClaude> {
  let resposta: Response;
  try {
    resposta = await fetch(`${enderecoClaude()}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
        // chave da organização (sem workspace): a API pede o workspace no pedido
        ...(workspaceClaude() ? { "anthropic-workspace-id": workspaceClaude() } : {}),
      },
      body: JSON.stringify(corpo),
      cache: "no-store",
      signal: AbortSignal.timeout(tempoLimite ?? 45_000),
    });
  } catch (e) {
    const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ErroClaude(
      tempo ? "O Claude demorou demais para responder." : "Não foi possível falar com o Claude agora.",
      undefined,
      true,
    );
  }
  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => "");
    const { msg, reserva } = explicarErro(resposta.status, texto);
    console.error(`Publike: o Claude respondeu ${resposta.status}:`, motivoDaApi(texto) || texto.slice(0, 300));
    throw new ErroClaude(msg, resposta.status, reserva);
  }

  return (await resposta.json()) as RespostaClaude;
}
