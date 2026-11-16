import { timingSafeEqual } from "node:crypto";
import { atualizarConteudos } from "@/lib/servidor/conteudos-ia";

// Os números dos conteúdos em dia (Vercel Cron, em vercel.json; migração 20270705120000): até 2 artigos por dia, cada
// um no máximo a cada 7 dias. A Vercel manda "Authorization: Bearer <CRON_SECRET>"; sem o segredo certo, nada roda.
export const maxDuration = 300;

function autorizado(cabecalho: string | null) {
  const segredo = (process.env.CRON_SECRET || "").trim();
  if (segredo.length < 16 || !cabecalho) return false;
  const esperado = Buffer.from(`Bearer ${segredo}`);
  const veio = Buffer.from(cabecalho);
  return esperado.length === veio.length && timingSafeEqual(esperado, veio);
}

export async function GET(request: Request) {
  if (!autorizado(request.headers.get("authorization"))) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }
  const r = await atualizarConteudos();
  return Response.json(r, { status: r.ok ? 200 : 500, headers: { "cache-control": "no-store" } });
}
