import type { NextRequest } from "next/server";
import { urlDosEmails } from "@/lib/servidor/ambiente";
import { DO_PUBLIKE, pacoteDoDia } from "@/lib/servidor/imagens-do-dia";
import { acessoVagasDoDia, vagasEscolhidas } from "@/lib/servidor/vagas-do-dia";
import { agoraDaRequisicao } from "@/lib/tempo";
import {
  diaEmNumeros,
  diaPorExtenso,
  legendaDoDia,
  lerIdsDoDia,
  linkDaBio,
  linkDoFimDosStories,
  linkDoStory,
} from "@/lib/vagas-do-dia";

// "Baixar tudo" de Admin › Vagas do dia (?ids=a,b,c, na ordem do carrossel): o .zip de pacoteDoDia, com o
// carrossel, os stories, a legenda e os links. Só para quem abre a página (admin ou moderador).

export async function GET(request: NextRequest) {
  // ler o pedido antes de tudo deixa a rota dinâmica (o build não guarda uma resposta pronta)
  const ids = lerIdsDoDia(request.nextUrl.searchParams.get("ids"));
  // o admin no computador ou um moderador logado (também pelo celular)
  const c = await acessoVagasDoDia();
  if (!c) return new Response("Não encontrado", { status: 404 });
  const agora = await agoraDaRequisicao();
  const vagas = await vagasEscolhidas(c, ids, new Date(agora).toISOString());
  if (!vagas.length) return new Response("Escolha pelo menos uma vaga que esteja no ar.", { status: 400 });

  const dia = diaPorExtenso(agora);
  const site = urlDosEmails() ?? "https://publike.org";
  const zip = await pacoteDoDia(
    vagas,
    dia,
    DO_PUBLIKE,
    {
      legenda: legendaDoDia(vagas, dia),
      bio: linkDaBio(site),
      linkDoStory: (id) => linkDoStory(site, id),
      fimDosStories: linkDoFimDosStories(site),
    },
    new Date(agora),
  );
  return new Response(new Blob([zip]), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="vagas-do-dia-${diaEmNumeros(agora)}.zip"`,
      "cache-control": "private, no-store",
    },
  });
}
