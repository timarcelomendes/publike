import { NextResponse, type NextRequest } from "next/server";
import { obterMeuPerfil, obterUsuario, perfilCompleto } from "@/lib/dados";
import { caminhoSeguro } from "@/lib/formato";
import { COOKIE_ORIGEM } from "@/lib/origem";
import { registrarOrigemDaConta } from "@/lib/servidor/origem";

// Depois de entrar: quem ainda não tem perfil com WhatsApp vai completar;
// os outros seguem para onde estavam indo.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const proximo = caminhoSeguro(url.searchParams.get("next"), "/");
  const base = process.env.NEXT_PUBLIC_SITE_URL ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "") : url.origin;

  const usuario = await obterUsuario();
  if (!usuario) return NextResponse.redirect(`${base}/entrar?next=${encodeURIComponent(proximo)}`);

  // Chegou por uma campanha: se a conta acabou de nascer, o banco anota de qual (só conta nova conta).
  // o cookie deste navegador ou, sem ele (link do e-mail aberto em outro navegador), a que veio no link
  const origem = request.cookies.get(COOKIE_ORIGEM)?.value;
  await registrarOrigemDaConta(origem ?? url.searchParams.get("origem"));

  const perfil = await obterMeuPerfil();
  const resposta = NextResponse.redirect(
    perfilCompleto(perfil) ? `${base}${proximo}` : `${base}/perfil?completar=1&next=${encodeURIComponent(proximo)}`,
  );
  // já serviu: quem entra de novo depois não conta outra vez
  if (origem !== undefined) resposta.cookies.delete(COOKIE_ORIGEM);
  return resposta;
}
