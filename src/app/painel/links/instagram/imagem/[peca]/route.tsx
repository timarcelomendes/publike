import type { NextRequest } from "next/server";
import { capaDoDia, fimDoDia, storyDoDia, vagaDoDia } from "@/lib/servidor/imagens-do-dia";
import { instagramDaConta } from "@/lib/servidor/instagram-da-conta";
import { nomeDeArquivo } from "@/lib/servidor/kit-imagens";
import { vagasEscolhidas } from "@/lib/servidor/vagas-do-dia";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import { diaPorExtenso, lerIdsDoDia } from "@/lib/vagas-do-dia";

// As imagens do Instagram do kit de divulgação (Links para divulgar), com a marca da empresa e só as vagas no ar
// da própria conta: capa?ids=a,b,c · vaga?id=a&n=1&total=12 · fim?total=12 · story?id=a (&baixar=1 baixa).

const naoEncontrado = () => new Response("Não encontrado", { status: 404 });
const doisDigitos = (n: number) => String(n).padStart(2, "0");

function numero(valor: string | null, padrao: number) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 && n <= 99 ? n : padrao;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/painel/links/instagram/imagem/[peca]">) {
  const { peca } = await ctx.params;
  const sp = request.nextUrl.searchParams;
  const conta = await instagramDaConta();
  if (!conta) return naoEncontrado();
  const baixar = sp.has("baixar");
  const agora = await agoraDaRequisicao();
  const agoraIso = new Date(agora).toISOString();
  const marca = nomeDeArquivo(conta.nome);
  const ler = (ids: string[]) => vagasEscolhidas(criarClientePublico(), ids, agoraIso, conta.conta);

  if (peca === "fim") {
    const total = numero(sp.get("total"), 1);
    return fimDoDia(conta.assinatura, baixar ? `${marca}-${doisDigitos(total + 2)}-como-se-candidatar.png` : null);
  }
  if (peca === "capa") {
    const vagas = await ler(lerIdsDoDia(sp.get("ids")));
    return capaDoDia(vagas, diaPorExtenso(agora), conta.assinatura, baixar ? `${marca}-01-capa.png` : null);
  }
  if (peca === "vaga" || peca === "story") {
    const [v] = await ler(lerIdsDoDia(sp.get("id")));
    if (!v) return naoEncontrado();
    if (peca === "story") return storyDoDia(v, conta.assinatura, baixar ? `${marca}-story-${nomeDeArquivo(v.titulo)}.png` : null);
    const n = numero(sp.get("n"), 1);
    const total = Math.max(numero(sp.get("total"), n), n);
    return vagaDoDia(v, n, total, conta.assinatura, baixar ? `${marca}-${doisDigitos(n + 1)}-${nomeDeArquivo(v.titulo)}.png` : null);
  }
  return naoEncontrado();
}
