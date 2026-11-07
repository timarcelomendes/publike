import type { NextRequest } from "next/server";
import { pacoteDoDia } from "@/lib/servidor/imagens-do-dia";
import { instagramDaConta } from "@/lib/servidor/instagram-da-conta";
import { nomeDeArquivo } from "@/lib/servidor/kit-imagens";
import { vagasEscolhidas } from "@/lib/servidor/vagas-do-dia";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import { diaEmNumeros, diaPorExtenso, legendaDoDia, lerIdsDoDia, tituloDaEmpresa } from "@/lib/vagas-do-dia";

// "Baixar tudo" do Instagram no kit de divulgação (?ids=a,b,c, na ordem do carrossel): o carrossel, os stories, a
// legenda e os links, com a marca da empresa e só as vagas no ar da própria conta.

export async function GET(request: NextRequest) {
  const ids = lerIdsDoDia(request.nextUrl.searchParams.get("ids"));
  const conta = await instagramDaConta();
  if (!conta) return new Response("Não encontrado", { status: 404 });
  const agora = await agoraDaRequisicao();
  const vagas = await vagasEscolhidas(criarClientePublico(), ids, new Date(agora).toISOString(), conta.conta);
  if (!vagas.length) return new Response("Escolha pelo menos uma vaga que esteja no ar.", { status: 400 });

  const dia = diaPorExtenso(agora);
  const zip = await pacoteDoDia(
    vagas,
    dia,
    conta.assinatura,
    {
      legenda: legendaDoDia(vagas, dia, tituloDaEmpresa(conta.nome, vagas.length)),
      bio: conta.bio,
      linkDoStory: (id) => `${conta.story[0]}${id}${conta.story[1]}`,
    },
    new Date(agora),
    undefined,
    1,
    true,
    // o "Arraste para o lado" na capa (opcional)
    request.nextUrl.searchParams.get("arraste") !== "0",
  );
  return new Response(new Blob([zip]), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="instagram-${nomeDeArquivo(conta.nome)}-${diaEmNumeros(agora)}.zip"`,
      "cache-control": "private, no-store",
    },
  });
}
