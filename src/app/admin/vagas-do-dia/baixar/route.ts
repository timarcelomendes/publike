import type { NextRequest } from "next/server";
import { urlDosEmails } from "@/lib/servidor/ambiente";
import { DO_PUBLIKE, pacoteDoDia } from "@/lib/servidor/imagens-do-dia";
import { nomeDeArquivo } from "@/lib/servidor/kit-imagens";
import { acessoVagasDoDia, vagasEscolhidas } from "@/lib/servidor/vagas-do-dia";
import { agoraDaRequisicao } from "@/lib/tempo";
import {
  diaEmNumeros,
  diaPorExtenso,
  hashtagsDoDia,
  legendaDoDia,
  lerFiltrosDoDia,
  lerIdsDoDia,
  linkDaBio,
  linkDoFimDosStories,
  linkDoStory,
  textoDaCapa,
  tituloDaLegenda,
} from "@/lib/vagas-do-dia";

// "Baixar tudo" de Admin › Vagas do dia (?ids=a,b,c, na ordem do carrossel): o .zip de pacoteDoDia, com o
// carrossel, os stories, a legenda e os links. Só para quem abre a página (admin ou moderador). Com o título, a
// praça, o período e as áreas da página (&titulo=, &cidade=, &periodo=, &area=): nas capas, na legenda e no nome.

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
  const sp = request.nextUrl.searchParams;
  const capa = textoDaCapa({ titulo: sp.get("titulo"), cidade: sp.get("cidade"), periodo: sp.get("periodo") }, agora);
  const filtros = lerFiltrosDoDia({ area: sp.get("area"), cidade: sp.get("cidade") });
  const site = urlDosEmails() ?? "https://publike.org";
  const zip = await pacoteDoDia(
    vagas,
    dia,
    DO_PUBLIKE,
    {
      legenda: legendaDoDia(vagas, dia, tituloDaLegenda(capa), hashtagsDoDia(filtros)),
      bio: linkDaBio(site),
      linkDoStory: (id) => linkDoStory(site, id),
      fimDosStories: linkDoFimDosStories(site),
    },
    new Date(agora),
    capa,
    // "3 vagas por story" (a pilha da inicial), escolhido na página
    sp.get("stories") === "3" ? 3 : 1,
    // o "1/4" no selo desses stories (opcional)
    sp.get("numero") !== "0",
    // o "Arraste para o lado" na capa (opcional)
    sp.get("arraste") !== "0",
  );
  // "vagas-da-semana-2026-11-05.zip"
  const nome = nomeDeArquivo(capa.titulo) || "vagas-do-dia";
  return new Response(new Blob([zip]), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${nome}-${diaEmNumeros(agora)}.zip"`,
      "cache-control": "private, no-store",
    },
  });
}
