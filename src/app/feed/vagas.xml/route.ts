import { connection } from "next/server";
import { MODO_DEMO } from "@/lib/config";
import { xmlDoFeed } from "@/lib/feed-vagas";
import { vagasParaOFeed } from "@/lib/servidor/feed-vagas";

// O arquivo de vagas para os sites de vagas (parte 2 de claude/plano-painel-feed-indicacao-documentos.md):
// /feed/vagas.xml?fonte=jooble. Cada site recebe o endereço com o próprio nome em "fonte" (vai no utm_source).
// Guardado por 1 hora nos servidores do caminho (o site lê uma vez por dia).

export async function GET(req: Request) {
  await connection();
  const fonte = new URL(req.url).searchParams.get("fonte") ?? "feed";
  const vagas = MODO_DEMO ? [] : await vagasParaOFeed();
  if (vagas === null) {
    return new Response("O arquivo de vagas não está disponível agora.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "3600" },
    });
  }
  return new Response(xmlDoFeed(vagas, fonte), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
