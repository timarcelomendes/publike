import { connection } from "next/server";
import { contaDaApi } from "@/lib/servidor/api-publica";

// A API pública do Publike (src/lib/servidor/api-publica.ts; a documentação em /desenvolvedores): a conta da chave, o
// limite de chamadas por dia e o uso de hoje. Serve para conferir a chave.
export async function GET(req: Request) {
  await connection();
  return contaDaApi(req);
}
