import { connection } from "next/server";
import { candidaturasDaApi } from "@/lib/servidor/api-publica";

// As candidaturas às vagas da conta, da mudança mais antiga para a mais nova (?vaga=, ?desde=, ?cursor=, ?limite=).
export async function GET(req: Request) {
  await connection();
  return candidaturasDaApi(req);
}
