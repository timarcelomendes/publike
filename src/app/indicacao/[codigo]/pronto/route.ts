import { NextResponse, type NextRequest } from "next/server";
import { MODO_DEMO } from "@/lib/config";
import { COOKIE_NOME_INDICACAO, CODIGO_INDICACAO_EMAIL } from "@/lib/indicacao-email";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Depois de entrar pelo link da indicação: marca a indicação (a conta nova que nasceu dela) e leva para a vaga com o
// código de quem indicou (?i=p.<conta>). O proxy guarda o código no cookie da indicação, e a curtida grava
// "Indicado por" como nos links de hoje (src/lib/indicacao.ts).

function enderecoBase(request: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "") : request.nextUrl.origin;
}

export async function GET(request: NextRequest, { params }: RouteContext<"/indicacao/[codigo]/pronto">) {
  const { codigo } = await params;
  const base = enderecoBase(request);
  if (MODO_DEMO || !CODIGO_INDICACAO_EMAIL.test(codigo)) return NextResponse.redirect(`${base}/?tipo=vaga`);
  const supabase = await criarClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.redirect(`${base}/indicacao/${codigo}`);

  const { data } = await supabase.rpc("usar_indicacao_email", { p_codigo: codigo });
  const linha = data?.[0];
  if (!linha) return NextResponse.redirect(`${base}/indicacao/${codigo}`);
  const resposta = NextResponse.redirect(
    `${base}/anuncio/${linha.anuncio_id}?i=${encodeURIComponent(linha.codigo)}&indicado=1`,
  );
  // o nome já serviu (o perfil nasceu com ele)
  resposta.cookies.delete(COOKIE_NOME_INDICACAO);
  return resposta;
}
