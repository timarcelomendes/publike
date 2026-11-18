import { connection } from "next/server";
import { ehAcaoApi } from "@/lib/api-publica";
import { erroDaApi, responderPelaApi } from "@/lib/servidor/api-publica";

// Aceitar (POST .../aceitar), dispensar (POST .../dispensar) e mudar a etapa (PUT .../etapa; POST também vale), com as
// regras e os avisos ao candidato do site.
type Contexto = { params: Promise<{ vaga: string; candidato: string; acao: string }> };

async function responder(req: Request, { params }: Contexto, metodo: "POST" | "PUT") {
  await connection();
  const { vaga, candidato, acao } = await params;
  if (!ehAcaoApi(acao)) {
    return erroDaApi(404, "nao_encontrado", "Esse endereço não existe. As ações são aceitar, dispensar e etapa.");
  }
  if (metodo === "PUT" && acao !== "etapa") {
    return erroDaApi(405, "metodo_invalido", `Use POST para ${acao}.`);
  }
  return responderPelaApi(req, vaga, candidato, acao);
}

export const POST = (req: Request, ctx: Contexto) => responder(req, ctx, "POST");
export const PUT = (req: Request, ctx: Contexto) => responder(req, ctx, "PUT");
