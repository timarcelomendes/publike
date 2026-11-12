import { connection } from "next/server";
import { chaveIndexNow } from "@/lib/servidor/indexnow";

// /indexnow.txt: a chave do IndexNow, que o Bing e os outros buscadores conferem para aceitar os avisos do site
// (lib/servidor/indexnow.ts). Pública de propósito: só prova que o aviso veio do dono do publike.org.
export async function GET() {
  await connection();
  const chave = chaveIndexNow();
  if (!chave) return new Response("Não encontrado", { status: 404 });
  return new Response(chave, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
