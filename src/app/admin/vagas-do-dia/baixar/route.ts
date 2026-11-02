import type { NextRequest } from "next/server";
import { urlDosEmails } from "@/lib/servidor/ambiente";
import { pacoteDoDia } from "@/lib/servidor/imagens-do-dia";
import { vagasEscolhidas } from "@/lib/servidor/vagas-do-dia";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";
import { diaEmNumeros, diaPorExtenso, lerIdsDoDia } from "@/lib/vagas-do-dia";

// "Baixar tudo" de Admin › Vagas do dia (?ids=a,b,c, na ordem do carrossel): o .zip de pacoteDoDia, com o
// carrossel, os stories, a legenda e os links. Só no admin, como a página.

export async function GET(request: NextRequest) {
  // ler o pedido antes de tudo deixa a rota dinâmica (o build não guarda uma resposta pronta)
  const ids = lerIdsDoDia(request.nextUrl.searchParams.get("ids"));
  if (!(await ehAdminLocal())) return new Response("Não encontrado", { status: 404 });
  const agora = await agoraDaRequisicao();
  const vagas = await vagasEscolhidas(criarClienteAdmin(), ids, new Date(agora).toISOString());
  if (!vagas.length) return new Response("Escolha pelo menos uma vaga que esteja no ar.", { status: 400 });

  const zip = await pacoteDoDia(vagas, diaPorExtenso(agora), urlDosEmails() ?? "https://publike.org", new Date(agora));
  return new Response(new Blob([zip]), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="vagas-do-dia-${diaEmNumeros(agora)}.zip"`,
      "cache-control": "private, no-store",
    },
  });
}
