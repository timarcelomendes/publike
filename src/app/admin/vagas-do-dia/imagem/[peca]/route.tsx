import type { NextRequest } from "next/server";
import { capaDoDia, fimDoDia, storyDoDia, vagaDoDia } from "@/lib/servidor/imagens-do-dia";
import { nomeDeArquivo } from "@/lib/servidor/kit-imagens";
import { vagasEscolhidas } from "@/lib/servidor/vagas-do-dia";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";
import { diaPorExtenso, lerIdsDoDia } from "@/lib/vagas-do-dia";

// As imagens de Admin › Vagas do dia, uma por endereço e só no admin, como a página:
//   capa?ids=a,b,c · vaga?id=a&n=1&total=12 · fim?total=12 · story?id=a
// Com &baixar=1, vem como arquivo, com o número da ordem do carrossel no nome.

const naoEncontrado = () => new Response("Não encontrado", { status: 404 });
const doisDigitos = (n: number) => String(n).padStart(2, "0");

function numero(valor: string | null, padrao: number) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 && n <= 99 ? n : padrao;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/admin/vagas-do-dia/imagem/[peca]">) {
  if (!(await ehAdminLocal())) return naoEncontrado();
  const { peca } = await ctx.params;
  const sp = request.nextUrl.searchParams;
  const baixar = sp.has("baixar");
  const agora = await agoraDaRequisicao();
  const agoraIso = new Date(agora).toISOString();

  if (peca === "fim") {
    const total = numero(sp.get("total"), 1);
    return fimDoDia(baixar ? `${doisDigitos(total + 2)}-como-se-candidatar.png` : null);
  }
  if (peca === "capa") {
    const vagas = await vagasEscolhidas(criarClienteAdmin(), lerIdsDoDia(sp.get("ids")), agoraIso);
    return capaDoDia(vagas, diaPorExtenso(agora), baixar ? "01-capa.png" : null);
  }
  if (peca === "vaga" || peca === "story") {
    const [v] = await vagasEscolhidas(criarClienteAdmin(), lerIdsDoDia(sp.get("id")), agoraIso);
    if (!v) return naoEncontrado();
    if (peca === "story") return storyDoDia(v, baixar ? `story-${nomeDeArquivo(v.titulo)}.png` : null);
    const n = numero(sp.get("n"), 1);
    const total = Math.max(numero(sp.get("total"), n), n);
    return vagaDoDia(v, n, total, baixar ? `${doisDigitos(n + 1)}-${nomeDeArquivo(v.titulo)}.png` : null);
  }
  return naoEncontrado();
}
