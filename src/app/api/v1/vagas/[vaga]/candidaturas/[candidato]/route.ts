import { connection } from "next/server";
import { candidatoDaApi } from "@/lib/servidor/api-publica";

// Uma candidatura, com o currículo e as respostas às perguntas da vaga.
export async function GET(req: Request, { params }: { params: Promise<{ vaga: string; candidato: string }> }) {
  await connection();
  const { vaga, candidato } = await params;
  return candidatoDaApi(req, vaga, candidato);
}
