import { NextResponse, type NextRequest } from "next/server";
import { obterAnuncio } from "@/lib/dados";
import { UUID } from "@/lib/validacao";

// "Veja vagas parecidas" (o aviso de 5 dias sem resposta): as vagas da mesma área, perto de quem abriu.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const anuncio = UUID.test(id) ? await obterAnuncio(id).catch(() => null) : null;
  const categoria = anuncio?.categoria && anuncio.categoria !== "outros" ? `&categoria=${anuncio.categoria}` : "";
  return NextResponse.redirect(new URL(`/?tipo=vaga${categoria}`, request.url));
}
