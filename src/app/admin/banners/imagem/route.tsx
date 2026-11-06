import type { NextRequest } from "next/server";
import { bannerDeVagas } from "@/lib/servidor/imagens-do-dia";
import { acessoVagasDoDia, vagasEscolhidas } from "@/lib/servidor/vagas-do-dia";
import { agoraDaRequisicao } from "@/lib/tempo";
import { lerIdsDoDia } from "@/lib/vagas-do-dia";

// A imagem de um banner com 1, 2 ou 3 vagas (claude/plano-banner-com-vagas.md): ?ids=a,b,c, na ordem escolhida.
// Só para quem abre as Vagas do dia (o admin ou um moderador); as vagas que saíram do ar ficam de fora.

const naoEncontrado = () => new Response("Não encontrado", { status: 404 });

export async function GET(request: NextRequest) {
  const c = await acessoVagasDoDia();
  if (!c) return naoEncontrado();
  const ids = lerIdsDoDia(request.nextUrl.searchParams.get("ids")).slice(0, 3);
  const agora = new Date(await agoraDaRequisicao()).toISOString();
  const vagas = await vagasEscolhidas(c, ids, agora);
  if (!vagas.length) return naoEncontrado();
  return bannerDeVagas(vagas);
}
