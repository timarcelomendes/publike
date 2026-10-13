import { NextResponse, type NextRequest } from "next/server";
import { obterMeuPerfil, obterUsuario, perfilCompleto } from "@/lib/dados";
import { caminhoSeguro } from "@/lib/formato";
import { COOKIE_ORIGEM, origemValida } from "@/lib/origem";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Depois de entrar: quem ainda não tem perfil com WhatsApp vai completar;
// os outros seguem para onde estavam indo.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const proximo = caminhoSeguro(url.searchParams.get("next"), "/");
  const base = process.env.NEXT_PUBLIC_SITE_URL ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "") : url.origin;

  const usuario = await obterUsuario();
  if (!usuario) return NextResponse.redirect(`${base}/entrar?next=${encodeURIComponent(proximo)}`);

  // Chegou por uma campanha: se a conta acabou de nascer, o banco anota de qual (só conta nova conta).
  const origem = request.cookies.get(COOKIE_ORIGEM)?.value;
  if (origemValida(origem)) {
    // se falhar, a pessoa segue do mesmo jeito: a conta só fica sem campanha
    try {
      const supabase = await criarClienteServidor();
      await supabase.rpc("registrar_origem", { p_origem: origem });
    } catch {}
  }

  const perfil = await obterMeuPerfil();
  const resposta = NextResponse.redirect(
    perfilCompleto(perfil) ? `${base}${proximo}` : `${base}/perfil?completar=1&next=${encodeURIComponent(proximo)}`,
  );
  // já serviu: quem entra de novo depois não conta outra vez
  if (origem !== undefined) resposta.cookies.delete(COOKIE_ORIGEM);
  return resposta;
}
