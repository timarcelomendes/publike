import "server-only";
import { chaveClaude, enderecoClaude } from "@/lib/servidor/ambiente";
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
  buscaNaWeb?: { cidade: string; regiao: string };
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
type RespostaClaude = { content?: Bloco[]; stop_reason?: string | null };

export async function chamarClaude(
  p: PedidoClaude,
): Promise<{ texto: string; parada: ParadaIA; modelo: string; fontes: string[] }> {
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

  const corpo: Record<string, unknown> = {
    model: p.modelo,
    system: p.sistema,
    max_tokens: p.buscaNaWeb ? p.maxTokens + 2000 : p.maxTokens,
    messages: [{ role: "user", content: conteudo }],
    // o Haiku responde direto; o Sonnet só raciocina entre uma busca e outra
    thinking: { type: p.raciocinio === "sem" ? "disabled" : "between_tools" },
    ...(p.esquema
      ? { output_config: { format: { type: "json_schema", schema: esquemaParaClaude(p.esquema.schema) } } }
      : {}),
    ...(p.buscaNaWeb
      ? {
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 5,
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

  let resposta: Response;
  try {
    resposta = await fetch(`${enderecoClaude()}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": chave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(corpo),
      cache: "no-store",
      signal: AbortSignal.timeout(p.tempoLimite ?? 45_000),
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

  const json = (await resposta.json()) as RespostaClaude;
  let texto = "";
  const fontes = new Set<string>();
  for (const b of json.content ?? []) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r.url) fontes.add(r.url);
      continue;
    }
    if (b.type !== "text" || typeof b.text !== "string") continue;
    texto += b.text;
    for (const c of b.citations ?? []) if (c.url) fontes.add(c.url);
  }
  const parada: ParadaIA =
    json.stop_reason === "refusal" ? "recusa" : json.stop_reason === "max_tokens" ? "limite" : null;
  return { texto: texto.trim(), parada, modelo: p.modelo, fontes: [...fontes] };
}
