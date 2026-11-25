import { connection } from "next/server";
import { chamarFerramenta, FERRAMENTAS, INSTRUCOES, PROTOCOLO } from "@/lib/servidor/mcp";
import { dentroDoLimite, embaralhar, enderecoDeQuemPediu } from "@/lib/servidor/limite";

// /api/mcp: o servidor MCP do Publike para o ChatGPT, o Claude e as outras IAs (src/lib/servidor/mcp.ts). O transporte
// "Streamable HTTP" sem sessão: cada POST é um pedido JSON-RPC (ou uma lista) e a resposta vem em JSON; sem o fluxo de
// eventos (o GET responde 405, como a especificação permite). Público e só de leitura.

type Pedido = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const CABECALHOS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, mcp-protocol-version, mcp-session-id, authorization",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const resposta = (id: Pedido["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const erro = (id: Pedido["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function responder(p: Pedido) {
  // notificação (sem id): nada volta
  const notificacao = p.id === undefined;
  switch (p.method) {
    case "initialize":
      return resposta(p.id, {
        protocolVersion: PROTOCOLO(p.params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "publike", title: "Publike: vagas em Goiânia", version: "1.0.0" },
        instructions: INSTRUCOES,
      });
    case "ping":
      return resposta(p.id, {});
    case "tools/list":
      return resposta(p.id, { tools: FERRAMENTAS });
    case "tools/call": {
      const nome = String(p.params?.name ?? "");
      const r = await chamarFerramenta(nome, p.params?.arguments).catch((e) => {
        console.error("Publike: a ferramenta do MCP falhou:", nome, e instanceof Error ? e.message : e);
        return { content: [{ type: "text" as const, text: "Não deu certo agora. Tente de novo em instantes." }], isError: true };
      });
      return r ? resposta(p.id, r) : erro(p.id, -32602, `Ferramenta desconhecida: ${nome}`);
    }
    case "resources/list":
      return resposta(p.id, { resources: [] });
    case "prompts/list":
      return resposta(p.id, { prompts: [] });
    default:
      return notificacao ? null : erro(p.id, -32601, `Método desconhecido: ${p.method}`);
  }
}

export async function POST(req: Request) {
  await connection();
  // 60 pedidos por minuto por endereço
  if (!dentroDoLimite(`mcp:${embaralhar(await enderecoDeQuemPediu())}`, 60, 60_000))
    return Response.json(erro(null, -32000, "Muitos pedidos. Tente de novo daqui a pouco."), { status: 429, headers: CABECALHOS });
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return Response.json(erro(null, -32700, "JSON inválido."), { status: 400, headers: CABECALHOS });
  }
  const lista = Array.isArray(corpo) ? (corpo as Pedido[]).slice(0, 10) : [corpo as Pedido];
  const respostas = (await Promise.all(lista.map((p) => responder(p && typeof p === "object" ? p : {})))).filter(Boolean);
  if (!respostas.length) return new Response(null, { status: 202, headers: CABECALHOS });
  return Response.json(Array.isArray(corpo) ? respostas : respostas[0], { headers: CABECALHOS });
}

export function GET() {
  return new Response("Este é o servidor MCP do Publike: use POST com JSON-RPC.", {
    status: 405,
    headers: { ...CABECALHOS, "Content-Type": "text/plain; charset=utf-8", Allow: "POST, OPTIONS" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CABECALHOS });
}
