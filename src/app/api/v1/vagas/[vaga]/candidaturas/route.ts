import { connection } from "next/server";
import { candidaturasDaApi } from "@/lib/servidor/api-publica";

// As candidaturas de uma vaga (o mesmo que /api/v1/candidaturas?vaga=…).
export async function GET(req: Request, { params }: { params: Promise<{ vaga: string }> }) {
  await connection();
  const { vaga } = await params;
  return candidaturasDaApi(req, vaga);
}
