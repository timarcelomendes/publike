import type { NextRequest } from "next/server";
import { SITE_URL } from "@/lib/config";
import { caminhoDaAreaContabil, cidadeDoSlug, SLUG_CONTABIL, vagaDaAreaContabil } from "@/lib/paginas-busca";
import { imagemDaArea } from "@/lib/servidor/kit-imagens";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";

// A imagem da área com as vagas no ar agora (27/11/2026; Marcelo: "fixo perde o valor de um dia para outro"): para os
// posts, os Stories e os grupos, e a prévia do link da página. Por enquanto, só contábil, fiscal e DP.
//   /vagas/goiania/contabil-fiscal-e-dp/imagem            (Stories, 1080×1920)
//   /vagas/goiania/contabil-fiscal-e-dp/imagem?post       (feed, 1080×1350)
//   ...?baixar                                            (o arquivo, para salvar)

export async function GET(request: NextRequest, ctx: RouteContext<"/vagas/[cidade]/[area]/imagem">) {
  const { cidade: slug, area } = await ctx.params;
  const cidade = area === SLUG_CONTABIL ? cidadeDoSlug(slug) : null;
  if (!cidade) return new Response("Não encontrado", { status: 404 });
  const vagas = (await anunciosNoAr("vaga", cidade)).filter((a) => vagaDaAreaContabil(a.titulo));
  const q = request.nextUrl.searchParams;
  const post = q.has("post");
  const link = `${SITE_URL}${caminhoDaAreaContabil(cidade)}?utm_source=imagem&utm_campaign=contabil`;
  return imagemDaArea(
    { selo: `${cidade} e região`, titulo: "Contábil, fiscal e DP", subtitulo: "agora, de auxiliar a analista" },
    vagas.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      titulo: a.titulo,
      pagamento_valor: a.pagamento_valor,
      pagamento_ate: a.pagamento_ate ?? null,
      pagamento_unidade: a.pagamento_unidade,
      bairro: a.bairro,
      cidade: a.cidade,
    })),
    link,
    post ? "post" : "story",
    q.has("baixar") ? `vagas-contabil-fiscal-dp-${post ? "post" : "stories"}.png` : null,
  );
}
