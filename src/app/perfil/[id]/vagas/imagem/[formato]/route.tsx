import type { NextRequest } from "next/server";
import { SITE_URL } from "@/lib/config";
import { imagemPost, imagemStatus, nomeDeArquivo } from "@/lib/servidor/kit-imagens";
import { lerVagasDaEmpresa, totalDeVagasNoAr } from "@/lib/servidor/vagas-da-empresa";
import { linkDasVagas } from "@/lib/vagas-da-empresa";

// As imagens das vagas da empresa para baixar e postar (kit de divulgação em Links para divulgar):
// /perfil/<id>/vagas/imagem/status (1080×1920) e /post (1080×1080). Com ?baixar=1, vem como arquivo.

export async function GET(request: NextRequest, ctx: RouteContext<"/perfil/[id]/vagas/imagem/[formato]">) {
  const { id, formato } = await ctx.params;
  if (formato !== "status" && formato !== "post") return new Response("Não encontrado", { status: 404 });
  const quadro = await lerVagasDaEmpresa(id).catch(() => null);
  if (!quadro) return new Response("Não encontrado", { status: 404 });
  const vagas = quadro.vagas.map((v) => ({ ...v, tipo: "vaga" }));
  const total = await totalDeVagasNoAr(id, vagas.length);
  const link = linkDasVagas(SITE_URL, id, formato === "status" ? "status" : "post", quadro.marca?.apelido);
  const arquivo = request.nextUrl.searchParams.has("baixar")
    ? `vagas-${nomeDeArquivo(quadro.perfil.nome)}-${formato}.png`
    : null;
  const empresa = { nome: quadro.perfil.nome, foto: quadro.perfil.foto, cor: quadro.marca?.cor };
  return formato === "status"
    ? imagemStatus(empresa, vagas, total, link, arquivo)
    : imagemPost(empresa, vagas, total, link, arquivo);
}
