import type { NextRequest } from "next/server";
import { capaDoDia, fimDoDia, storyCapaDoDia, storyDoDia, storyFimDoDia, vagaDoDia } from "@/lib/servidor/imagens-do-dia";
import { nomeDeArquivo } from "@/lib/servidor/kit-imagens";
import { acessoVagasDoDia, vagasEscolhidas } from "@/lib/servidor/vagas-do-dia";
import { agoraDaRequisicao } from "@/lib/tempo";
import { diaPorExtenso, lerIdsDoDia, textoDaCapa } from "@/lib/vagas-do-dia";

// As imagens de Admin › Vagas do dia, uma por endereço e só para quem abre a página (admin ou moderador):
//   capa?ids=a,b,c · vaga?id=a&n=1&total=12 · fim?total=12 · story?id=a · story-capa?ids=a,b,c · story-fim
// As capas também leem o título (&titulo=), a praça (&cidade=) e o período (&periodo=) da página.
// Com &baixar=1, vem como arquivo, com o número da ordem do carrossel no nome.

const naoEncontrado = () => new Response("Não encontrado", { status: 404 });
const doisDigitos = (n: number) => String(n).padStart(2, "0");

function numero(valor: string | null, padrao: number) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 && n <= 99 ? n : padrao;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/admin/vagas-do-dia/imagem/[peca]">) {
  // o admin no computador ou um moderador logado (também pelo celular)
  const c = await acessoVagasDoDia();
  if (!c) return naoEncontrado();
  const { peca } = await ctx.params;
  const sp = request.nextUrl.searchParams;
  const baixar = sp.has("baixar");
  const agora = await agoraDaRequisicao();
  const agoraIso = new Date(agora).toISOString();
  const capa = textoDaCapa({ titulo: sp.get("titulo"), cidade: sp.get("cidade"), periodo: sp.get("periodo") }, agora);

  if (peca === "fim") {
    const total = numero(sp.get("total"), 1);
    return fimDoDia(undefined, baixar ? `${doisDigitos(total + 2)}-como-se-candidatar.png` : null);
  }
  if (peca === "story-fim") return storyFimDoDia(undefined, baixar ? "story-mais-vagas.png" : null);
  if (peca === "story-capa") {
    const vagas = await vagasEscolhidas(c, lerIdsDoDia(sp.get("ids")), agoraIso);
    return storyCapaDoDia(vagas, diaPorExtenso(agora), undefined, baixar ? "story-capa.png" : null, capa);
  }
  if (peca === "capa") {
    const vagas = await vagasEscolhidas(c, lerIdsDoDia(sp.get("ids")), agoraIso);
    return capaDoDia(vagas, diaPorExtenso(agora), undefined, baixar ? "01-capa.png" : null, capa);
  }
  if (peca === "vaga" || peca === "story") {
    const [v] = await vagasEscolhidas(c, lerIdsDoDia(sp.get("id")), agoraIso);
    if (!v) return naoEncontrado();
    if (peca === "story") return storyDoDia(v, undefined, baixar ? `story-${nomeDeArquivo(v.titulo)}.png` : null);
    const n = numero(sp.get("n"), 1);
    const total = Math.max(numero(sp.get("total"), n), n);
    return vagaDoDia(v, n, total, undefined, baixar ? `${doisDigitos(n + 1)}-${nomeDeArquivo(v.titulo)}.png` : null);
  }
  return naoEncontrado();
}
