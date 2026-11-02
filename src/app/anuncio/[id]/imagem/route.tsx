import type { NextRequest } from "next/server";
import { SITE_URL } from "@/lib/config";
import { imagemDaVaga, nomeDeArquivo } from "@/lib/servidor/kit-imagens";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// O post de uma vaga só (1080×1080), para a empresa baixar em Links para divulgar e postar no feed ou nos grupos.
// Só vaga no ar; quem contrata na vaga de agência é a empresa (ou "Empresa confidencial"), com a logo da agência.

export async function GET(request: NextRequest, ctx: RouteContext<"/anuncio/[id]/imagem">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Não encontrado", { status: 404 });
  const { data: a } = await criarClientePublico().rpc("obter_anuncio", { p_id: id }).maybeSingle();
  if (!a || a.tipo !== "vaga" || a.status !== "ativo" || a.preenchida_em) {
    return new Response("Não encontrado", { status: 404 });
  }
  const nome = a.contratante ?? (a.contratante_confidencial ? "Empresa confidencial" : a.autor_nome);
  const empresa = { nome, foto: a.contratante || a.contratante_confidencial ? null : a.autor_foto };
  const link = `${SITE_URL}/anuncio/${a.id}?utm_source=post&utm_campaign=vagas-empresa`;
  const arquivo = request.nextUrl.searchParams.has("baixar") ? `vaga-${nomeDeArquivo(a.titulo)}.png` : null;
  return imagemDaVaga(empresa, { ...a, beneficios_lista: a.beneficios_lista ?? [] }, link, arquivo);
}
