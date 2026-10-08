import { NextResponse, type NextRequest } from "next/server";
import { obterMeuPerfil, obterUsuario, perfilCompleto } from "@/lib/dados";
import { caminhoSeguro } from "@/lib/formato";

// Depois de entrar: quem ainda não tem perfil com WhatsApp vai completar;
// os outros seguem para onde estavam indo.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const proximo = caminhoSeguro(url.searchParams.get("next"), "/");
  const base = process.env.NEXT_PUBLIC_SITE_URL ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "") : url.origin;

  const usuario = await obterUsuario();
  if (!usuario) return NextResponse.redirect(`${base}/entrar?next=${encodeURIComponent(proximo)}`);

  const perfil = await obterMeuPerfil();
  if (!perfilCompleto(perfil)) {
    return NextResponse.redirect(`${base}/perfil?completar=1&next=${encodeURIComponent(proximo)}`);
  }
  return NextResponse.redirect(`${base}${proximo}`);
}
