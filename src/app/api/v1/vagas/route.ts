import { connection } from "next/server";
import { vagasDaApi } from "@/lib/servidor/api-publica";

// As vagas da conta da chave (?status=ativo para só as no ar), para o CRM ligar os candidatos às vagas.
export async function GET(req: Request) {
  await connection();
  return vagasDaApi(req);
}
